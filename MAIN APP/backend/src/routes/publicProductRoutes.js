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
    brand: product.brand || '',
    model: product.productName || '',
    category: product.category || '',
    description: product.description || '',
    image,
    registrationStatus: 'registered',
    registeredAt: registeredAt || null,
  };
}

async function ownershipEvents(product) {
  try {
    const contract = contractAt();
    const pKey = productKey(product.productId);
    const filter = contract.filters.OwnershipTransferred(pKey);
    const fromBlock = 11845000;
    const logs = await contract.queryFilter(filter, fromBlock, 'latest').catch(() => []);

    return await Promise.all(
      logs.map(async (log) => {
        const block = await log.getBlock().catch(() => null);
        return {
          date: block?.timestamp ? new Date(block.timestamp * 1000).toISOString() : null,
          title: 'Ownership transferred',
          txHash: log.transactionHash,
        };
      })
    );
  } catch {
    return [];
  }
}

async function publicProjection(product, type = 'passport') {
  const warranty = await chainProjection(product);
  const identity = identityProjection(product, warranty.registeredAt);
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

  if (type === 'warranty') {
    return { product: identity, warranty, registrationStatus: 'registered', verification };
  }

  const [services, claims, history] = await Promise.all([
    ServiceRecord.find({ productId: product.productId, blockchainStatus: 'confirmed' }).sort({ serviceDate: -1 }).lean(),
    WarrantyClaim.find({ productId: product.productId, blockchainStatus: 'confirmed' }).sort({ claimDate: -1 }).lean(),
    warranty.verified ? ownershipEvents(product) : Promise.resolve([])
  ]);

  const serviceHistory = [
    ...services.map((x) => ({
      type: 'service',
      date: x.serviceDate || x.createdAt,
      serviceType: x.serviceType,
      serviceCenter: x.serviceCenterName || 'Authorized Service Provider',
      issue: x.issueReported,
      workPerformed: x.workPerformed,
      blockchainStatus: 'confirmed',
      txHash: x.txHash,
    })),
    ...claims.map((x) => ({
      type: 'warranty-claim',
      date: x.claimDate || x.createdAt,
      issue: x.issue || x.claimDescription,
      resolution: x.resolution,
      claimStatus: x.claimStatus,
      blockchainStatus: 'confirmed',
      txHash: x.txHash,
    })),
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  const timeline = [
    ...history,
    ...(identity.registeredAt ? [{ date: identity.registeredAt, title: 'Product registered on blockchain' }] : [])
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  return { product: identity, purchase, warranty, ownership: { history }, serviceHistory, timeline, verification };
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
