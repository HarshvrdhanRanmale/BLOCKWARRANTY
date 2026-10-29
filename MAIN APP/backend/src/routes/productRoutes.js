const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const { ethers } = require('ethers');
const Product = require('../models/Product');
const User = require('../models/User');
const Transfer = require('../models/Transfer');
const SupplierInvoiceSubmission = require('../models/SupplierInvoiceSubmission');
const SupplierInventory = require('../models/SupplierInventory');
const supplierVerificationService = require('../services/supplierVerificationService');
const warrantyVerificationService = require('../services/warrantyVerificationService');
const checkWarrantyProvider = require('../services/warrantyProviders/checkWarrantyProvider');
const { authenticate } = require('../middleware/auth');
const { productKey, verifyTransactionEvent, contractAt, getProvider } = require('../services/blockchain');
const { validateDocumentBuffer } = require('../services/documentParser');

const router = express.Router();
const text = (value, maxLength = 5000) => String(value ?? '').trim().slice(0, maxLength);
const escapeRegExp = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const invoiceFields = [
  'productName', 'brand', 'category', 'purchaseDate', 'warrantyPeriod', 'warrantyUnit',
  'invoiceNumber', 'serialNumber', 'modelNumber', 'currency', 'unitPrice', 'quantity', 'lineItemAmount', 'subtotal',
  'discount', 'shippingCost', 'tax', 'total', 'amountPaid', 'balanceDue', 'description'
];

function extractedFields(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(invoiceFields.map((field) => [field, text(value[field], 500)]));
}

function uploadInvoice(file, walletAddress, productId) {
  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'invoices' });
  const stream = bucket.openUploadStream(file.name, {
    contentType: file.mimeType,
    metadata: { walletAddress, productId }
  });
  return new Promise((resolve, reject) => {
    stream.once('error', reject);
    stream.once('finish', () => resolve({ id: stream.id, bucket }));
    stream.end(file.buffer);
  });
}

function optionalNumber(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    const error = new Error(`${field} must be a valid non-negative number.`);
    error.status = 400;
    throw error;
  }
  return number;
}

router.use(authenticate);

/**
 * Pre-validate invoice against supplier inventories in the database.
 * Auto-evaluates immediately and stores the submission so it shows in the supplier portal.
 */
router.post('/validate-invoice', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ success: false, valid: false, message: 'The database is not connected yet.' });
    }

    const body = req.body || {};
    const brand = text(body.brand, 120);
    const productName = text(body.productName, 200);
    const invoiceNumber = text(body.invoiceNumber, 120);
    const serialNumber = text(body.serialNumber, 120);
    const purchaseDate = body.purchaseDate;
    const owner = req.user.walletAddress.toLowerCase();

    let invoiceBuffer = null;
    let fileName = 'Invoice.pdf';
    let fileMimeType = 'application/pdf';

    if (body.invoiceFile?.data) {
      try {
        invoiceBuffer = Buffer.from(String(body.invoiceFile.data), 'base64');
        fileName = text(body.invoiceFile.name, 255) || 'Invoice.pdf';
        fileMimeType = text(body.invoiceFile.mimeType, 80) || 'application/pdf';
      } catch (err) {
        console.warn('Could not decode invoice buffer for pre-validation:', err.message);
      }
    }

    let customerName = String(body.customerName || req.user?.name || '').trim();
    if (!customerName || customerName.toLowerCase() === 'retail customer') {
      try {
        const u = await User.findOne({ walletAddress: String(owner || '').toLowerCase() }).lean();
        if (u?.name?.trim()) {
          customerName = u.name.trim();
        }
      } catch (_) {}
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIORITY 1: CheckWarranty Aggregator (Primary Verification Provider)
    // Apple products go directly to Apple Authorized Supplier.
    // In test mode, CheckWarranty is queried only for test fixture serials (TEST-*).
    // ─────────────────────────────────────────────────────────────────────────
    const cleanBrand = String(brand || '').trim().toLowerCase();
    const isApple = cleanBrand === 'apple';
    const isTestMode = Boolean(process.env.CHECKWARRANTY_API_KEY && process.env.CHECKWARRANTY_API_KEY.startsWith('cw_test_'));
    const isTestSerial = serialNumber && serialNumber.trim().toUpperCase().startsWith('TEST-');

    if (!isApple && serialNumber && (await checkWarrantyProvider.supportsBrand(brand)) && (!isTestMode || isTestSerial)) {
      try {
        const checkRes = await checkWarrantyProvider.lookupDevice({
          brand,
          serialNumber: serialNumber.trim()
        });

        if (checkRes.success && (checkRes.status === 'VERIFIED' || checkRes.status === 'EXPIRED')) {
          return res.status(200).json({
            success: true,
            valid: true,
            validationState: 'auto_passed',
            verificationSource: 'checkwarranty',
            verificationProvider: 'CheckWarranty API',
            matchedSerial: serialNumber.trim(),
            warrantyDetails: checkRes.warranty,
            device: checkRes.device,
            message: `Verified via CheckWarranty OEM API: ${checkRes.device?.model || brand} (${checkRes.warranty?.coverageType || 'Manufacturer Standard Warranty'})`
          });
        }
      } catch (cwErr) {
        console.warn('CheckWarranty pre-validation warning:', cwErr.message);
      }
    }

    const result = await supplierVerificationService.processAndValidateCustomerRegistration({
      brand,
      productName,
      modelNumber: text(body.modelNumber, 80),
      serialNumber,
      invoiceNumber,
      purchaseDate,
      customerWallet: owner,
      customerName: customerName || 'Retail Customer',
      fileName,
      fileBuffer: invoiceBuffer,
      fileMimeType
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Invoice validation error:', error.message);
    return res.status(error.status || 500).json({
      success: false,
      valid: false,
      message: error.message || 'Invoice validation service encountered an error.'
    });
  }
});

/**
 * Register Product with on-chain transaction verification.
 */
router.post('/', async (req, res) => {
  let uploadedInvoice = null;
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ message: 'The product database is not connected yet. Please retry in a moment.' });
    }

    const body = req.body || {};
    const productName = text(body.productName, 200);
    if (!productName) return res.status(400).json({ message: 'Product name is required.' });

    const owner = req.user.walletAddress.toLowerCase();
    const productId = text(body.productId, 100) || `BW-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    const pKey = productKey(productId);

    // If txHash is provided, verify on-chain registration event
    const txHash = body.txHash ? text(body.txHash, 80) : '';
    let blockchainStatus = 'pending';
    let blockchainBlock = null;

    if (txHash) {
      try {
        const verified = await verifyTransactionEvent({
          txHash,
          eventName: 'ProductRegistered',
          expectedProductKey: pKey,
          expectedCaller: owner,
        });
        blockchainStatus = 'confirmed';
        blockchainBlock = verified.receipt.blockNumber;
      } catch (verifyErr) {
        console.warn('Registration verification warning:', verifyErr.message);
        return res.status(400).json({
          message: `On-chain transaction verification failed: ${verifyErr.message}`,
        });
      }
    }

    const image = text(body.productImage, 9_000_000);
    if (image.length > 9_000_000) {
      return res.status(413).json({ message: 'The product image is too large to save.' });
    }

    let purchaseDate = null;
    if (body.purchaseDate) {
      purchaseDate = new Date(body.purchaseDate);
      if (Number.isNaN(purchaseDate.getTime())) return res.status(400).json({ message: 'Purchase date is invalid.' });
    }

    const invoiceInput = body.invoiceFile;
    let invoiceBuffer = null;
    if (invoiceInput?.data) {
      const encoded = String(invoiceInput.data);
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
        return res.status(400).json({ message: 'The invoice file data is not valid base64 encoding.' });
      }
      invoiceBuffer = Buffer.from(encoded, 'base64');
      let validatedMimeType;
      try {
        validatedMimeType = validateDocumentBuffer(invoiceInput.mimeType, invoiceBuffer, 15 * 1024 * 1024);
      } catch (valErr) {
        return res.status(valErr.status || 400).json({ message: valErr.message });
      }
      uploadedInvoice = await uploadInvoice({
        name: text(invoiceInput.name, 255) || 'invoice',
        mimeType: validatedMimeType,
        buffer: invoiceBuffer
      }, owner, productId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STRICT SUPPLIER VALIDATION CHECK
    // The product MUST NOT register until the invoice is verified and validated
    // by the supplier automated verification engine across all brand suppliers.
    // ─────────────────────────────────────────────────────────────────────────
    let matchedSubmissionId = text(body.submissionId, 120);
    let targetSupplierWallet = '';
    let finalSerial = text(body.serialNumber, 120);
    let matchedUnitDoc = null;
    let checkWarrantyResult = null;

    const cleanRegBrand = text(body.brand, 120).trim().toLowerCase();
    const isRegApple = cleanRegBrand === 'apple';
    const isRegTestMode = Boolean(process.env.CHECKWARRANTY_API_KEY && process.env.CHECKWARRANTY_API_KEY.startsWith('cw_test_'));
    const isRegTestSerial = finalSerial && finalSerial.trim().toUpperCase().startsWith('TEST-');

    // Apple goes directly to Apple supplier ledger.
    // Non-Apple in test mode checks CheckWarranty API for test fixtures (TEST-*).
    if (!isRegApple && finalSerial && (await checkWarrantyProvider.supportsBrand(text(body.brand, 120))) && (!isRegTestMode || isRegTestSerial)) {
      try {
        const checkRes = await checkWarrantyProvider.lookupDevice({
          brand: text(body.brand, 120),
          serialNumber: finalSerial
        });
        if (checkRes.success && (checkRes.status === 'VERIFIED' || checkRes.status === 'EXPIRED')) {
          checkWarrantyResult = checkRes;
          finalSerial = checkRes.serialNumber || finalSerial;
        }
      } catch (cwErr) {
        console.warn('CheckWarranty registration check warning:', cwErr.message);
      }
    }

    if (checkWarrantyResult) {
      // Verified directly by CheckWarranty OEM aggregator
    } else if (matchedSubmissionId) {
      const existingSub = await SupplierInvoiceSubmission.findOne({
        submissionId: matchedSubmissionId,
        customerWallet: owner
      });

      if (!existingSub || (existingSub.validationState !== 'auto_passed' && existingSub.validationState !== 'manually_approved')) {
        return res.status(422).json({
          message: `Product registration rejected: Invoice submission ${matchedSubmissionId} is not approved by supplier validation (State: ${existingSub?.validationState || 'not_found'}).`,
          validationState: existingSub?.validationState || 'not_found'
        });
      }

      targetSupplierWallet = existingSub.supplierWalletAddress;
      finalSerial = existingSub.extractedData?.serialNumber || finalSerial;
    } else {
      // Execute supplier automated verification check across all brand suppliers in DB
      let regCustomerName = String(body.customerName || req.user?.name || '').trim();
      if (!regCustomerName || regCustomerName.toLowerCase() === 'retail customer') {
        try {
          const u = await User.findOne({ walletAddress: String(owner || '').toLowerCase() }).lean();
          if (u?.name?.trim()) {
            regCustomerName = u.name.trim();
          }
        } catch (_) {}
      }

      const valResult = await supplierVerificationService.processAndValidateCustomerRegistration({
        brand: text(body.brand, 120),
        productName,
        modelNumber: text(body.modelNumber, 80),
        serialNumber: finalSerial,
        invoiceNumber: text(body.invoiceNumber, 120),
        purchaseDate,
        customerWallet: owner,
        customerName: regCustomerName || 'Retail Customer',
        fileName: text(invoiceInput?.name, 255) || 'Invoice.pdf',
        fileBuffer: invoiceBuffer,
        fileMimeType: invoiceInput?.mimeType || 'application/pdf'
      });

      if (!valResult.valid || valResult.validationState !== 'auto_passed') {
        return res.status(422).json({
          message: `Product registration rejected: ${valResult.message}`,
          validationState: valResult.validationState,
          submissionId: valResult.submissionId,
          reasonCodes: valResult.reasonCodes
        });
      }

      matchedSubmissionId = valResult.submissionId;
      targetSupplierWallet = valResult.supplierWallet;
      finalSerial = valResult.matchedSerial || finalSerial;
      matchedUnitDoc = valResult.matchedUnit;
    }

    const product = await Product.create({
      productId,
      publicId: crypto.randomBytes(24).toString('hex'),
      walletAddress: owner,
      productName,
      brand: text(body.brand, 120),
      category: text(body.category, 80) || 'Other',
      purchaseDate,
      warrantyPeriod: optionalNumber(body.warrantyPeriod, 'Warranty period'),
      warrantyUnit: ['Days', 'Months', 'Years'].includes(body.warrantyUnit) ? body.warrantyUnit : 'Years',
      invoiceNumber: text(body.invoiceNumber, 120),
      currency: text(body.currency, 12),
      unitPrice: optionalNumber(body.unitPrice, 'Unit price'),
      quantity: optionalNumber(body.quantity, 'Quantity'),
      lineItemAmount: optionalNumber(body.lineItemAmount, 'Product / line amount'),
      subtotal: optionalNumber(body.subtotal, 'Subtotal'),
      discount: optionalNumber(body.discount, 'Discount'),
      shippingCost: optionalNumber(body.shippingCost, 'Shipping cost'),
      tax: optionalNumber(body.tax, 'Tax'),
      total: optionalNumber(body.total, 'Invoice total'),
      amountPaid: optionalNumber(body.amountPaid, 'Amount paid'),
      balanceDue: optionalNumber(body.balanceDue, 'Balance due'),
      description: text(body.description),
      productImage: image,
      productImageSourceUrl: text(body.productImageSourceUrl, 1000),
      invoiceFileId: uploadedInvoice?.id || null,
      invoiceFileName: text(invoiceInput?.name, 255),
      invoiceMimeType: text(invoiceInput?.mimeType, 80),
      invoiceExtractedData: extractedFields(body.invoiceExtractedData),
      blockchainTxHash: txHash || null,
      blockchainBlock,
      blockchainStatus,
      serialNumber: finalSerial,
      supplierWalletAddress: targetSupplierWallet,
      supplierSubmissionId: matchedSubmissionId,
      supplierVerificationStatus: 'auto_passed',
      verificationSource: checkWarrantyResult ? 'checkwarranty' : (targetSupplierWallet ? 'supplier' : 'unverified'),
      verificationProvider: checkWarrantyResult ? 'CheckWarranty API' : (targetSupplierWallet ? 'Authorized Supplier Ledger' : ''),
      verificationStatus: checkWarrantyResult ? checkWarrantyResult.status : 'VERIFIED',
      warrantyDetails: checkWarrantyResult ? checkWarrantyResult.warranty : null,
      verifiedAt: new Date(),
      status: 'Active'
    });

    // Update the matched supplier inventory unit with customerProductId
    if (finalSerial && targetSupplierWallet) {
      await SupplierInventory.updateOne(
        {
          supplierWalletAddress: targetSupplierWallet,
          manufacturerSerialNumber: { $regex: new RegExp(`^${finalSerial.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        },
        {
          $set: {
            customerProductId: productId,
            status: 'registered',
            registeredByCustomer: owner,
            registeredAt: new Date()
          }
        }
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ASYNC WARRANTY VERIFICATION (non-blocking)
    // Run the multi-tiered warranty verification engine in the background.
    // Priority 1: CheckWarranty API → Priority 2: Supplier DB → Priority 3: Manual
    // ─────────────────────────────────────────────────────────────────────────
    const brandForVerification = text(body.brand, 120);
    if (finalSerial && brandForVerification) {
      warrantyVerificationService.verifyWarranty({
        brand: brandForVerification,
        serialNumber: finalSerial,
        modelNumber: text(body.modelNumber, 80),
        productId,
        customerWallet: owner
      }).then(vResult => {
        console.log(`[WarrantyVerification] Product ${productId}: ${vResult.verificationStatus} via ${vResult.verificationSource} (${vResult.verificationProvider})`);
      }).catch(vErr => {
        console.warn(`[WarrantyVerification] Background verification failed for ${productId}:`, vErr.message);
      });
    }

    return res.status(201).json({ message: 'Product registered successfully.', product });
  } catch (error) {
    if (uploadedInvoice?.id) {
      try { await uploadedInvoice.bucket.delete(uploadedInvoice.id); } catch (cleanupError) {
        console.error('Invoice cleanup failed:', cleanupError.message);
      }
    }
    console.error('Product registration failed:', error.message);
    return res.status(error.status || 500).json({ message: error.status ? error.message : 'The product could not be saved. Please retry.' });
  }
});

/**
 * On-demand warranty re-verification for an existing product.
 * Runs the multi-tiered verification engine and persists the result.
 */
router.post('/:productId/verify-warranty', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ message: 'Database is not connected.' });
    }

    const productId = text(req.params.productId, 100);
    const caller = req.user.walletAddress.toLowerCase();

    const product = await Product.findOne({ productId }).lean();
    if (!product) return res.status(404).json({ message: 'Product not found.' });
    if (product.walletAddress.toLowerCase() !== caller) {
      return res.status(403).json({ message: 'You do not own this product.' });
    }

    const brand = product.brand || '';
    const serial = product.serialNumber || '';
    if (!serial) {
      return res.status(400).json({ message: 'Product has no serial number for warranty verification.' });
    }

    const result = await warrantyVerificationService.verifyWarranty({
      brand,
      serialNumber: serial,
      modelNumber: product.invoiceExtractedData?.modelNumber || '',
      productId,
      customerWallet: caller,
      forceRefresh: true
    });

    // Reload the updated product document
    const updated = await Product.findOne({ productId }).lean();

    return res.json({
      message: result.message || 'Warranty verification complete.',
      verification: {
        status: result.verificationStatus,
        source: result.verificationSource,
        provider: result.verificationProvider,
        verifiedAt: result.verifiedAt,
        warrantyDetails: result.warrantyDetails || null,
        supplierFallbackUsed: result.supplierFallbackUsed || false,
        fallbackReason: result.fallbackReason || null,
        externalReferenceId: result.externalReferenceId || ''
      },
      product: updated
    });
  } catch (error) {
    console.error('Warranty re-verification failed:', error.message);
    return res.status(500).json({ message: 'Warranty verification failed. Please retry.' });
  }
});

router.get('/:productId/invoice', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'The product database is not connected yet.' });
    const owner = req.user.walletAddress.toLowerCase();
    const product = await Product.findOne({ productId: text(req.params.productId, 100) }).lean();
    if (!product?.invoiceFileId) return res.status(404).json({ message: 'No invoice is stored for this product.' });
    const isCurrentOwner = product.walletAddress === owner;
    const isIntendedBuyer = await Transfer.exists({
      productId: product.productId,
      buyerWallet: owner,
      status: { $in: ['pending', 'accepted'] },
    });
    if (!isCurrentOwner && !isIntendedBuyer) return res.status(403).json({ message: 'You are not authorized to view this product document.' });
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'invoices' });
    const files = await bucket.find({ _id: product.invoiceFileId }).toArray();
    if (!files.length) return res.status(404).json({ message: 'Stored invoice file was not found.' });
    res.set('Content-Type', product.invoiceMimeType || files[0].contentType || 'application/octet-stream');
    res.set('Content-Disposition', `inline; filename="${encodeURIComponent(product.invoiceFileName || files[0].filename)}"`);
    bucket.openDownloadStream(product.invoiceFileId).on('error', (error) => {
      console.error('Invoice download failed:', error.message);
      if (!res.headersSent) res.status(500).end();
      else res.end();
    }).pipe(res);
  } catch (error) {
    console.error('Invoice retrieval failed:', error.message);
    if (!res.headersSent) res.status(500).json({ message: 'The invoice could not be retrieved.' });
  }
});

router.get('/', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ message: 'The product database is not connected yet.' });
    }
    const caller = req.user.walletAddress.toLowerCase();
    const records = await Product.find({
      $or: [{ walletAddress: caller }, { 'ownershipHistory.to': caller }],
    })
      .sort({ createdAt: -1 })
      .lean();
    if (records.length === 0) return res.json([]);

    const contract = contractAt();
    const products = [];
    for (const product of records) {
      const key = productKey(product.productId);
      let isRegistered;
      let chainOwner = '';
      try {
        isRegistered = await contract.productExists(key);
        if (isRegistered) {
          const chainProduct = await contract.getProduct(key);
          chainOwner = chainProduct.currentOwner.toLowerCase();
        }
      } catch (chainError) {
        console.error(`Product ownership lookup failed for ${product.productId}:`, chainError.message);
        return res.status(503).json({ message: 'Product ownership could not be verified on the blockchain. Please retry.' });
      }

      if (isRegistered) {
        if (product.walletAddress !== chainOwner) {
          await Product.updateOne({ _id: product._id }, { $set: { walletAddress: chainOwner } });
          product.walletAddress = chainOwner;
        }
        if (chainOwner === caller) products.push(product);
      } else if (product.walletAddress === caller) {
        products.push(product);
      }
    }
    return res.json(products);
  } catch (error) {
    console.error('Product list failed:', error.message);
    return res.status(500).json({ message: 'Products could not be loaded. Please retry.' });
  }
});

router.get('/:productId', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ message: 'The product database is not connected yet.' });
    }
    const productId = text(req.params.productId, 100);
    const lookup = [{ productId }];
    if (mongoose.isValidObjectId(productId)) lookup.push({ _id: productId });
    // Look up by productId or publicId
    lookup.push({ publicId: productId });

    const product = await Product.findOne({
      $or: lookup
    }).lean();

    if (!product) return res.status(404).json({ message: 'Product not found.' });

    // Authorization: User must be either the current wallet address in DB,
    // or the on-chain currentOwner of this product!
    const caller = req.user.walletAddress.toLowerCase();
    let isOwner = product.walletAddress.toLowerCase() === caller;

    if (!isOwner) {
      // Check on-chain ownership authority
      try {
        const chainProduct = await contractAt().getProduct(productKey(product.productId));
        if (chainProduct.currentOwner.toLowerCase() === caller) {
          isOwner = true;
          // Synchronize DB record with on-chain authority
          await Product.updateOne({ _id: product._id }, { $set: { walletAddress: caller } });
          product.walletAddress = caller;
        }
      } catch (chainErr) {
        // Contract check failed or reverted
      }
    }

    if (!isOwner) {
      return res.status(403).json({ message: 'You do not own this product.' });
    }

    if (!product.publicId) {
      const publicId = crypto.randomBytes(24).toString('hex');
      await Product.updateOne({ _id: product._id }, { $set: { publicId } });
      product.publicId = publicId;
    }
    return res.json({ product });
  } catch (error) {
    console.error('Product retrieval failed:', error.message);
    return res.status(500).json({ message: 'Product details could not be loaded.' });
  }
});

module.exports = router;
