const express = require('express');
const mongoose = require('mongoose');
const { ethers } = require('ethers');
const Product = require('../models/Product');
const { authenticate } = require('../middleware/auth');
const { contractAt, productKey, getProvider, verifyTransactionEvent, config, iface } = require('../services/blockchain');

const router = express.Router({ mergeParams: true });
router.use(authenticate);

async function findProduct(productId, userWallet) {
  if (mongoose.connection.readyState !== 1) {
    throw Object.assign(new Error('Product database is not connected.'), { status: 503 });
  }
  const item = await Product.findOne({ productId: String(productId) });
  if (!item) {
    throw Object.assign(new Error('Product not found.'), { status: 404 });
  }
  return item;
}

/**
 * Confirm product registration on-chain after user submitted registerProduct via MetaMask.
 */
router.post('/register/confirm', async (req, res) => {
  try {
    const caller = req.user.walletAddress.toLowerCase();
    const product = await findProduct(req.params.productId, caller);
    const txHash = String(req.body?.txHash || '').trim();

    const pKey = productKey(product.productId);

    // Authoritative Sepolia event verification
    const verified = await verifyTransactionEvent({
      txHash,
      eventName: 'ProductRegistered',
      expectedProductKey: pKey,
      expectedCaller: caller,
    });

    product.blockchainTxHash = verified.receipt.hash;
    product.blockchainBlock = verified.receipt.blockNumber;
    product.blockchainStatus = 'confirmed';
    product.status = 'Active';
    await product.save();

    return res.json({
      success: true,
      message: 'Product registration verified on Sepolia smart contract.',
      transactionHash: verified.receipt.hash,
      blockNumber: verified.receipt.blockNumber,
    });
  } catch (e) {
    console.error('Registration verification failed:', e.message);
    return res.status(e.status || 400).json({ message: e.message || 'Could not verify product transaction.' });
  }
});

/**
 * Confirm warranty update on-chain after user submitted updateWarranty via MetaMask.
 */
router.post('/warranty/confirm', async (req, res) => {
  try {
    const caller = req.user.walletAddress.toLowerCase();
    const product = await findProduct(req.params.productId, caller);
    const txHash = String(req.body?.txHash || '').trim();

    const pKey = productKey(product.productId);

    const verified = await verifyTransactionEvent({
      txHash,
      eventName: 'WarrantyUpdated',
      expectedProductKey: pKey,
    });

    const startSec = Number(verified.parsed.args.warrantyStart);
    const expirySec = Number(verified.parsed.args.warrantyExpiry);

    if (startSec) product.purchaseDate = new Date(startSec * 1000);
    if (expirySec && startSec) {
      const diffYears = Math.round((expirySec - startSec) / (365.25 * 86400));
      product.warrantyPeriod = diffYears > 0 ? diffYears : 1;
      product.warrantyUnit = 'Years';
    }

    product.blockchainTxHash = verified.receipt.hash;
    product.blockchainBlock = verified.receipt.blockNumber;
    await product.save();

    return res.json({
      success: true,
      message: 'Warranty update verified on Sepolia smart contract.',
      transactionHash: verified.receipt.hash,
      blockNumber: verified.receipt.blockNumber,
    });
  } catch (e) {
    console.error('Warranty verification failed:', e.message);
    return res.status(e.status || 400).json({ message: e.message || 'Could not verify warranty update.' });
  }
});

module.exports = { router, verifyTransactionEvent, productKey, iface };
