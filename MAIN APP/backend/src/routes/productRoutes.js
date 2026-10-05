const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const { ethers } = require('ethers');
const Product = require('../models/Product');
const { authenticate } = require('../middleware/auth');
const { productKey, verifyTransactionEvent, contractAt, getProvider } = require('../services/blockchain');

const router = express.Router();
const text = (value, maxLength = 5000) => String(value ?? '').trim().slice(0, maxLength);
const invoiceFields = [
  'productName', 'brand', 'category', 'purchaseDate', 'warrantyPeriod', 'warrantyUnit',
  'invoiceNumber', 'currency', 'unitPrice', 'quantity', 'lineItemAmount', 'subtotal',
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
      const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (invoiceInput.mimeType === 'image/jpg') invoiceInput.mimeType = 'image/jpeg';
      const encoded = String(invoiceInput.data);
      if (!allowedMimeTypes.includes(invoiceInput.mimeType) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
        return res.status(400).json({ message: 'The invoice file must be a valid JPG, PNG, or WEBP image.' });
      }
      invoiceBuffer = Buffer.from(encoded, 'base64');
      if (invoiceBuffer.length > 10 * 1024 * 1024) return res.status(413).json({ message: 'Invoice size must be 10 MB or smaller.' });
      uploadedInvoice = await uploadInvoice({
        name: text(invoiceInput.name, 255) || 'invoice',
        mimeType: invoiceInput.mimeType,
        buffer: invoiceBuffer
      }, owner, productId);
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
      status: 'Active'
    });

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

router.get('/:productId/invoice', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'The product database is not connected yet.' });
    const owner = req.user.walletAddress.toLowerCase();
    const product = await Product.findOne({ productId: text(req.params.productId, 100), walletAddress: owner }).lean();
    if (!product?.invoiceFileId) return res.status(404).json({ message: 'No invoice is stored for this product.' });
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'invoices' });
    const files = await bucket.find({ _id: product.invoiceFileId, 'metadata.walletAddress': owner }).toArray();
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
    const products = await Product.find({ walletAddress: req.user.walletAddress.toLowerCase() })
      .sort({ createdAt: -1 })
      .lean();
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
