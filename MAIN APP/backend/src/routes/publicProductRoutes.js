const express = require('express');
const mongoose = require('mongoose');
const { ethers } = require('ethers');
const Product = require('../models/Product');
const ServiceRecord = require('../models/ServiceRecord');
const WarrantyClaim = require('../models/WarrantyClaim');
const { contractAt, productKey, hashDetails, getProvider, config, iface } = require('../services/blockchain');

const router = express.Router();
const requests = new Map();

router.use((req, res, next) => {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const entry = requests.get(key);
  if (!entry || now - entry.startedAt >= 60000) requests.set(key, { startedAt: now, count: 1 });
  else if (++entry.count > 120) return res.status(429).json({ message: 'Too many verification requests. Please try again shortly.' });
  if (requests.size > 5000) {
    for (const [ip, item] of requests) if (now - item.startedAt >= 60000) requests.delete(ip);
  }
  res.set('Cache-Control', 'no-store');
  next();
});

async function chainProjection(product) {
  try {
    const contract = contractAt();
    const pKey = productKey(product.productId);
    const exists = await contract.productExists(pKey);
    if (!exists) {
      return { status: 'not-registered', startDate: null, expiryDate: null, active: false, verified: false, registeredAt: null };
    }
    const chain = await contract.getProduct(pKey);
    if (chain.currentOwner === ethers.ZeroAddress) {
      return { status: 'not-registered', startDate: null, expiryDate: null, active: false, verified: false, registeredAt: null };
    }

    const startDate = Number(chain.warrantyStart) ? new Date(Number(chain.warrantyStart) * 1000).toISOString() : null;
    const expiryDate = Number(chain.warrantyExpiry) ? new Date(Number(chain.warrantyExpiry) * 1000).toISOString() : null;
    const active = await contract.isWarrantyActive(pKey).catch(() => {
      return !expiryDate || Date.now() <= new Date(expiryDate).getTime();
    });

    return {
      status: active ? 'active' : 'expired',
      startDate,
      expiryDate,
      active,
      verified: true,
      registeredAt: Number(chain.registeredAt) ? new Date(Number(chain.registeredAt) * 1000).toISOString() : null,
      currentOwner: chain.currentOwner,
    };
  } catch (err) {
    console.warn('chainProjection error:', err.message);
    return { status: 'verification-unavailable', startDate: null, expiryDate: null, active: false, verified: false, registeredAt: null };
  }
}

function identityProjection(product, registeredAt) {
  const image = typeof product.productImage === 'string' && (/^https:\/\//i.test(product.productImage) || /^data:image\/(?:png|jpeg|webp);base64,/i.test(product.productImage))
    ? product.productImage
    : '';

  return {
    productId: product.productId,
    publicId: product.publicId || product.productId,
    brand: product.brand || '',
    model: product.productName || '',
    category: product.category || '',
    description: product.description || '',
    image,
    serialNumber: product.serialNumber || '',
    registrationStatus: 'registered',
    registeredAt: registeredAt || null,
    blockchainTxHash: product.blockchainTxHash || null,
    blockchainBlock: product.blockchainBlock || null,
    supplierWalletAddress: product.supplierWalletAddress || null,
  };
}

function isoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function validWarrantyDate(value) {
  const parsed = isoDate(value);
  return parsed && new Date(parsed).getUTCFullYear() > 1970 ? parsed : null;
}

function addWarrantyPeriod(start, period, unit) {
  const expiry = new Date(start);
  if (unit === 'Days') expiry.setUTCDate(expiry.getUTCDate() + period);
  else if (unit === 'Months') {
    expiry.setTime(expiry.getTime() + period * 30 * 86400 * 1000);
  } else if (unit === 'Years') {
    expiry.setTime(expiry.getTime() + period * 365 * 86400 * 1000);
  }
  return Number.isNaN(expiry.getTime()) ? null : expiry.toISOString();
}

function warrantyProjection(product, chainWarranty, now = Date.now()) {
  const invoiceData = product.invoiceExtractedData || {};
  const hasRegisteredPeriod = product.warrantyPeriod !== null && product.warrantyPeriod !== undefined && product.warrantyPeriod !== '';
  const rawPeriod = hasRegisteredPeriod ? product.warrantyPeriod : invoiceData.warrantyPeriod;
  const period = rawPeriod === null || rawPeriod === undefined || rawPeriod === '' ? null : Number(rawPeriod);
  const periodIsValid = period !== null && Number.isFinite(period) && period > 0;
  const rawUnit = hasRegisteredPeriod ? product.warrantyUnit : (invoiceData.warrantyUnit || product.warrantyUnit);
  const unit = ['Days', 'Months', 'Years'].find((option) => option.toLowerCase() === String(rawUnit || '').toLowerCase()) || null;
  
  // If product doesn't have an explicit period in invoice but has supplier-verified warranty details
  const hasSupplierWarranty = Boolean(product.warrantyDetails && (product.warrantyDetails.durationMonths || product.warrantyDetails.endDate));
  const effectivePeriod = periodIsValid ? period : (hasSupplierWarranty ? product.warrantyDetails.durationMonths : null);
  const effectiveUnit = periodIsValid ? unit : (hasSupplierWarranty ? 'Months' : null);
  
  const startDate = (periodIsValid || hasSupplierWarranty)
    ? (validWarrantyDate(product.purchaseDate || invoiceData.purchaseDate) || validWarrantyDate(product.warrantyDetails?.startDate) || validWarrantyDate(chainWarranty.startDate))
    : null;
  
  let expiryDate = null;
  if (startDate && periodIsValid && unit) expiryDate = addWarrantyPeriod(startDate, period, unit);
  if (!expiryDate && hasSupplierWarranty && product.warrantyDetails?.endDate) expiryDate = validWarrantyDate(product.warrantyDetails.endDate);
  if (!expiryDate && periodIsValid) expiryDate = validWarrantyDate(chainWarranty.expiryDate);

  const detailsAvailable = Boolean(startDate && expiryDate);
  const active = detailsAvailable ? now <= new Date(expiryDate).getTime() : Boolean(chainWarranty.verified && chainWarranty.active && (periodIsValid || hasSupplierWarranty));
  
  return {
    ...chainWarranty,
    status: (periodIsValid || hasSupplierWarranty) && (detailsAvailable || chainWarranty.verified) ? (active ? 'active' : 'expired') : 'not-configured',
    startDate,
    expiryDate,
    active,
    warrantyPeriod: effectivePeriod,
    warrantyUnit: effectiveUnit,
    coverageType: product.warrantyDetails?.coverageType || null,
  };
}

function publicOwnershipHistory(product) {
  return (product.ownershipHistory || [])
    .filter((entry) => entry && entry.txHash)
    .map((entry) => ({
      date: isoDate(entry.transferredAt),
      title: 'Ownership transferred on-chain',
      txHash: entry.txHash,
    }))
    .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
}

function publicTimeline(product, warranty, serviceHistory = []) {
  const registeredAt = isoDate(warranty.registeredAt) || isoDate(product.createdAt);
  return [
    ...publicOwnershipHistory(product),
    ...serviceHistory.filter((item) => item.blockchainStatus === 'confirmed' || item.txHash).map((item) => ({
      type: item.type,
      date: isoDate(item.date),
      title: item.type === 'warranty-claim'
        ? 'Warranty claim recorded on blockchain'
        : `Service recorded on blockchain${item.serviceType ? ` · ${item.serviceType}` : ''}`,
      txHash: item.txHash,
    })),
    ...(registeredAt ? [{ date: registeredAt, title: warranty.verified ? 'Product registered on blockchain' : 'Product registered in BlockWarranty' }] : []),
  ].filter((item) => item.date).sort((a, b) => new Date(a.date) - new Date(b.date));
}

async function publicProjection(product, type = 'passport') {
  const chainWarranty = await chainProjection(product);
  const warranty = warrantyProjection(product, chainWarranty);
  const registeredAt = isoDate(warranty.registeredAt) || isoDate(product.createdAt);
  const identity = identityProjection(product, registeredAt);
  const purchase = {
    purchaseDate: product.purchaseDate || null,
    price: null // Never expose private price or invoice publicly
  };
  const verification = {
    blockchainVerified: warranty.verified,
    status: warranty.verified ? 'verified' : 'unavailable',
    network: warranty.verified ? 'Sepolia Testnet' : null,
    contractAddress: config.CONTRACT_ADDRESS,
    message: warranty.verified
      ? 'Product lifecycle truth verified directly on the Sepolia smart contract.'
      : 'On-chain verification is not yet available for this product.',
  };

  const User = require('../models/User');
  let supplierName = '';
  if (product.supplierWalletAddress) {
    try {
      const supplierUser = await User.findOne({ walletAddress: product.supplierWalletAddress.toLowerCase() }, 'name').lean();
      supplierName = supplierUser?.name?.trim() || '';
    } catch {
      // ignore
    }
  }

  const brandName = product.brand || 'Authorized';
  const defaultSupplierName = supplierName || `${brandName} Authorized Supplier`;
  const supplierVerifiedLabel = `${brandName} Supplier Verified`;

  const warrantyVerification = {
    source: product.verificationSource || 'supplier',
    provider: defaultSupplierName,
    supplierName: defaultSupplierName,
    supplierVerifiedLabel,
    isSupplierVerified: true,
    status: product.verificationStatus || 'VERIFIED',
    verifiedAt: isoDate(product.verifiedAt) || isoDate(product.createdAt),
    warrantyDetails: product.warrantyDetails
      ? {
          status: product.warrantyDetails.status || 'active',
          coverageType: product.warrantyDetails.coverageType || `${brandName} Authorized Supplier Warranty`,
          startDate: isoDate(product.warrantyDetails.startDate),
          endDate: isoDate(product.warrantyDetails.endDate),
          durationMonths: product.warrantyDetails.durationMonths || 12,
        }
      : null,
  };

  identity.supplierName = defaultSupplierName;
  identity.supplierVerifiedLabel = supplierVerifiedLabel;
  identity.isSupplierVerified = true;

  if (type === 'warranty') {
    return { product: identity, warranty, registrationStatus: 'registered', verification, warrantyVerification };
  }

  const [services, claims] = await Promise.all([
    ServiceRecord.find({
      productId: product.productId,
      $or: [{ blockchainStatus: 'confirmed' }, { documentId: { $ne: null } }],
    }).sort({ serviceDate: -1, createdAt: -1 }).lean(),
    WarrantyClaim.find({ productId: product.productId, blockchainStatus: 'confirmed' }).sort({ claimDate: -1 }).lean(),
  ]);

  const history = publicOwnershipHistory(product);

  const serviceHistory = [
    ...services.map((x) => ({
      type: 'service',
      serviceId: x.serviceId,
      date: x.serviceDate || x.createdAt,
      serviceType: x.serviceType,
      serviceCenter: x.serviceCenterName || 'Authorized Service Provider',
      issue: x.issueReported,
      diagnosis: x.diagnosis,
      workPerformed: x.workPerformed,
      partsReplaced: x.partsReplaced || [],
      totalCost: x.totalCost,
      currency: x.currency,
      blockchainStatus: x.blockchainStatus,
      verified: x.blockchainStatus === 'confirmed' && Boolean(x.txHash),
      txHash: x.txHash,
      documentName: x.documentName || '',
      documentHash: x.documentHash || '',
      documentUrl: x.documentId && x.serviceId
        ? `/api/public/products/${encodeURIComponent(product.publicId || product.productId)}/services/${encodeURIComponent(x.serviceId)}/document`
        : null,
    })),
    ...claims.map((x) => ({
      type: 'warranty-claim',
      date: x.claimDate || x.createdAt,
      issue: x.issue || x.claimDescription,
      resolution: x.resolution,
      claimStatus: x.claimStatus,
      blockchainStatus: 'confirmed',
      verified: true,
      txHash: x.txHash,
    })),
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  const timeline = publicTimeline(product, warranty, serviceHistory);

  return { product: identity, purchase, warranty, ownership: { history }, serviceHistory, timeline, verification, warrantyVerification };
}

async function loadProduct(req, res) {
  const identifier = String(req.params.publicId || '').trim();
  if (!identifier) {
    res.status(404).json({ message: 'Product Passport unavailable.' });
    return null;
  }
  if (mongoose.connection.readyState !== 1) {
    res.status(503).json({ message: 'Product verification is temporarily unavailable.' });
    return null;
  }

  const lookup = [{ publicId: identifier }, { productId: identifier }];
  if (mongoose.isValidObjectId(identifier)) lookup.push({ _id: identifier });

  const product = await Product.findOne({ $or: lookup }).lean();
  if (!product) {
    res.status(404).json({ message: 'Product Passport unavailable.' });
    return null;
  }
  return product;
}

router.get('/:publicId/warranty', async (req, res) => {
  try {
    const product = await loadProduct(req, res);
    if (product) res.json(await publicProjection(product, 'warranty'));
  } catch (e) {
    console.error('Public warranty lookup failed:', e.message);
    if (!res.headersSent) res.status(500).json({ message: 'Warranty verification is temporarily unavailable.' });
  }
});

router.get('/:publicId/invoice', (_req, res) => {
  res.status(404).json({ message: 'Invoices are private and are not available through public passport links.' });
});

router.get('/:publicId/services/:serviceId/document', async (req, res) => {
  try {
    const product = await loadProduct(req, res);
    if (!product) return;
    const record = await ServiceRecord.findOne({
      productId: product.productId,
      serviceId: String(req.params.serviceId || '').trim(),
    }).lean();
    if (!record?.documentId) return res.status(404).json({ message: 'No public service document is available.' });

    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'serviceDocuments' });
    const files = await bucket.find({
      _id: record.documentId,
      'metadata.productId': product.productId,
      'metadata.serviceId': record.serviceId,
    }).toArray();
    if (!files.length) return res.status(404).json({ message: 'Service document not found.' });

    const mimeType = record.documentMimeType || files[0].contentType || 'application/octet-stream';
    const viewable = mimeType === 'application/pdf' || (mimeType.startsWith('image/') && mimeType !== 'image/svg+xml');
    const disposition = req.query.download === '1' || !viewable ? 'attachment' : 'inline';
    res.set('Content-Type', mimeType);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Security-Policy', "default-src 'none'; sandbox");
    res.set('Content-Disposition', `${disposition}; filename="${encodeURIComponent(record.documentName || files[0].filename)}"`);
    return bucket.openDownloadStream(record.documentId).pipe(res);
  } catch (error) {
    console.error('Public service document download failed:', error.message);
    if (!res.headersSent) return res.status(500).json({ message: 'The service document could not be retrieved.' });
  }
});

router.get('/:publicId', async (req, res) => {
  try {
    const product = await loadProduct(req, res);
    if (product) res.json(await publicProjection(product));
  } catch (e) {
    console.error('Public product lookup failed:', e.message);
    if (!res.headersSent) res.status(500).json({ message: 'Product Passport is temporarily unavailable.' });
  }
});

module.exports = router;
module.exports.publicOwnershipHistory = publicOwnershipHistory;
module.exports.publicTimeline = publicTimeline;
module.exports.warrantyProjection = warrantyProjection;
