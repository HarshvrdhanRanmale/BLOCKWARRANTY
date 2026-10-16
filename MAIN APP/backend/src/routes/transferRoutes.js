const express = require('express');
const mongoose = require('mongoose');
const { ethers } = require('ethers');
const Product = require('../models/Product');
const Transfer = require('../models/Transfer');
const { authenticate } = require('../middleware/auth');
const {
  contractAt,
  productKey,
  verifyTransactionEvent,
  config,
  iface,
} = require('../services/blockchain');
const razorpay = require('../services/razorpay');
const relayer = require('../services/relayer');

const router = express.Router();
router.use(authenticate);
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

function walletOf(req) {
  return String(req.user.walletAddress || '').toLowerCase();
}

function requireDatabase() {
  if (mongoose.connection.readyState !== 1) {
    throw Object.assign(new Error('The product database is not connected.'), { status: 503 });
  }
}

function passportProjection(product, includeImage = false) {
  return {
    productId: product.productId,
    publicId: product.publicId || '',
    productName: product.productName,
    brand: product.brand || '',
    category: product.category || '',
    description: product.description || '',
    ...(includeImage ? { productImage: product.productImage || '' } : {}),
    purchaseDate: product.purchaseDate || null,
    warrantyPeriod: product.warrantyPeriod ?? null,
    warrantyUnit: product.warrantyUnit || 'Years',
    hasInvoice: Boolean(product.invoiceFileId),
    currentOwner: product.walletAddress,
  };
}

async function serializeTransfer(transfer, includeImage = false) {
  const product = await Product.findOne({ productId: transfer.productId }).lean();
  return {
    id: String(transfer._id),
    product: product ? passportProjection(product, includeImage) : null,
    sellerWallet: transfer.sellerWallet,
    buyerWallet: transfer.buyerWallet,
    price: transfer.price,
    currency: transfer.currency,
    status: transfer.status,
    createdAt: transfer.createdAt,
    acceptedAt: transfer.acceptedAt,
    rejectedAt: transfer.rejectedAt,
    cancelledAt: transfer.cancelledAt,
    completedAt: transfer.completedAt,
    transactionHash: transfer.transactionHash || '',
    paymentStatus: transfer.paymentStatus || 'none',
    ownershipTransferStatus: transfer.ownershipTransferStatus || (transfer.status === 'completed' ? 'confirmed' : transfer.paymentStatus === 'paid' ? 'pending' : 'not_started'),
    ownershipTransferError: transfer.ownershipTransferError || '',
    paymentCurrency: transfer.paymentCurrency || '',
    paymentAmountMinor: transfer.paymentAmountMinor ?? null,
    razorpayOrderId: transfer.razorpayOrderId || '',
    razorpayPaymentId: transfer.razorpayPaymentId || '',
    paymentVerifiedAt: transfer.paymentVerifiedAt || null,
  };
}

// Persist a confirmed on-chain ownership change to MongoDB. This is the SINGLE
// place ownership data is written, and it only runs after the blockchain has
// confirmed the transfer. It re-verifies the final on-chain owner defensively
// so MongoDB is never updated for an unconfirmed/failed transaction.
// @param transfer        The accepted, paid Transfer document.
// @param verified         { txHash, blockNumber, timestampMs } from the confirmed receipt.
async function synchronizeCompletedTransfer(transfer, verified) {
  const { owner } = await currentOnChainOwner(transfer.productId);
  if (owner !== transfer.buyerWallet) {
    throw Object.assign(new Error('The confirmed transaction did not leave the product with the intended buyer.'), { status: 409 });
  }

  const product = await Product.findOne({ productId: transfer.productId });
  if (!product) throw Object.assign(new Error('Product not found.'), { status: 404 });

  const txHash = String(verified.txHash || '');
  const timestampMs = Number(verified.timestampMs) > 0
    ? Number(verified.timestampMs)
    : Date.now();

  product.walletAddress = transfer.buyerWallet;
  product.status = 'Transferred';
  product.blockchainTxHash = txHash;
  product.blockchainBlock = verified.blockNumber ?? product.blockchainBlock ?? null;
  product.blockchainStatus = 'confirmed';
  if (txHash && !product.ownershipHistory.some((item) => item.txHash === txHash && item.to === transfer.buyerWallet)) {
    product.ownershipHistory.push({
      from: transfer.sellerWallet,
      to: transfer.buyerWallet,
      transferredAt: new Date(timestampMs),
      txHash,
    });
  }
  await product.save();

  transfer.status = 'completed';
  transfer.ownershipTransferStatus = 'confirmed';
  transfer.ownershipTransferError = '';
  transfer.completedAt = new Date(timestampMs);
  if (txHash) transfer.transactionHash = txHash;
  await transfer.save();
  return product;
}

// Attempt an automatic on-chain ownership transfer using the backend relayer,
// then synchronize MongoDB only after the on-chain owner is confirmed to be the
// buyer. Idempotent and duplicate-safe:
//  - If the product is already the buyer's on-chain, it only syncs MongoDB.
//  - Otherwise it submits one relayer transaction and verifies the event.
// Throws on failure so callers can keep the payment 'paid' and allow a retry.
async function attemptAutomaticTransfer(transferDoc) {
  // Re-read the transfer after entering the per-transfer lock so concurrent
  // callers always act on the latest persisted payment/status state.
  const transfer = (await Transfer.findById(transferDoc._id)) || transferDoc;
  if (transfer.status === 'completed') {
    // A concurrent request already completed this transfer while we waited.
    return { ownershipTransferred: true, txHash: transfer.transactionHash || '', blockNumber: null };
  }

  // ── Legacy (off-chain) product path ──────────────────────────────────────
  // Products registered before blockchain integration are not on-chain.
  // Skip all relayer/chain steps and complete the transfer via MongoDB only.
  const legacy = await isLegacyProduct(transfer.productId);
  if (legacy) {
    transfer.ownershipTransferStatus = 'pending';
    transfer.ownershipTransferError = '';
    await transfer.save();
    await synchronizeLegacyTransfer(transfer);
    return { ownershipTransferred: true, txHash: '', blockNumber: null };
  }

  // ── On-chain product path ─────────────────────────────────────────────────
  if (!relayer.isConfigured()) {
    transfer.ownershipTransferStatus = 'pending';
    transfer.ownershipTransferError = 'Automatic transfer needs a dedicated RELAYER_PRIVATE_KEY and a relayer-enabled contract deployment.';
    await transfer.save();
    throw Object.assign(new Error('Automatic transfer is not configured: add a dedicated RELAYER_PRIVATE_KEY, deploy the relayer-enabled contract, migrate products, and retry. Payment is verified; ownership remains with the seller until chain confirmation.'), { status: 503 });
  }
  transfer.ownershipTransferStatus = 'pending';
  transfer.ownershipTransferError = '';
  await transfer.save();

  // Already the buyer's on-chain (prior relayer tx confirmed but sync failed)?
  const { owner } = await currentOnChainOwner(transfer.productId);
  if (owner === transfer.buyerWallet) {
    await synchronizeCompletedTransfer(transfer, { txHash: transfer.transactionHash || '', blockNumber: null, timestampMs: 0 });
    return { ownershipTransferred: true, txHash: transfer.transactionHash || '', blockNumber: null };
  }
  if (owner !== transfer.sellerWallet) {
    throw Object.assign(new Error('The seller is no longer the current on-chain product owner.'), { status: 409 });
  }

  let submitted;
  try {
    submitted = await relayer.transferOwnershipByRelayer(transfer.productId, transfer.buyerWallet);
  } catch (error) {
    // A timeout may happen after the node accepted/broadcast the tx. Recheck
    // chain state before reporting failure, so a retry can safely repair Mongo.
    const { owner: latestOwner } = await currentOnChainOwner(transfer.productId);
    if (latestOwner === transfer.buyerWallet) {
      await synchronizeCompletedTransfer(transfer, { txHash: transfer.transactionHash || '', blockNumber: transfer.blockchainBlock ?? null, timestampMs: 0 });
      return { ownershipTransferred: true, txHash: transfer.transactionHash || '', blockNumber: transfer.blockchainBlock ?? null };
    }
    throw error;
  }
  const { txHash, receipt } = submitted;
  if (receipt === null) {
    const { owner } = await currentOnChainOwner(transfer.productId);
    if (owner !== transfer.buyerWallet) {
      throw Object.assign(new Error('The relayer reported an existing transfer but the buyer is not the current on-chain owner.'), { status: 409 });
    }
    await synchronizeCompletedTransfer(transfer, { txHash: '', blockNumber: null, timestampMs: 0 });
    return { ownershipTransferred: true, txHash: '', blockNumber: null };
  }
  if (!receipt || receipt.status !== 1) {
    throw Object.assign(new Error('The ownership transfer transaction did not succeed on-chain. The payment remains verified; you can retry.'), { status: 502 });
  }

  const verified = await verifyTransactionEvent({
    txHash,
    eventName: 'OwnershipTransferred',
    expectedProductKey: productKey(transfer.productId),
    validateArgs: (args) =>
      args.previousOwner?.toLowerCase() === transfer.sellerWallet &&
      args.newOwner?.toLowerCase() === transfer.buyerWallet,
  });

  await synchronizeCompletedTransfer(transfer, {
    txHash: verified.receipt.hash,
    blockNumber: verified.receipt.blockNumber,
    timestampMs: Number(verified.block?.timestamp || 0) * 1000,
  });

  return { ownershipTransferred: true, txHash: verified.receipt.hash, blockNumber: verified.receipt.blockNumber };
}

// Currencies with two-decimal minor units supported by Razorpay for UPI (INR).
// All amounts are converted to the smallest currency unit (paise) here.
function toMinorUnits(amount, currency) {
  const code = String(currency || '').toUpperCase();
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw Object.assign(new Error('A valid positive amount is required to create a payment.'), { status: 400 });
  }
  // INR (and USD/EUR/GBP via Razorpay) use 2 decimal places -> 100 subunits.
  // A few zero-decimal currencies are handled explicitly for safety.
  const zeroDecimal = new Set(['JPY', 'KRW']);
  const factor = zeroDecimal.has(code) ? 1 : 100;
  return Math.round(value * factor);
}

// Guard: only the buyer may pay, the request must be accepted, and it must not
// already be paid. Returns the transfer document.
function paymentPreconditions(transfer, wallet) {
  if (transfer.buyerWallet !== wallet) {
    throw Object.assign(new Error('Only the buyer wallet can pay for this transfer.'), { status: 403 });
  }
  if (transfer.status !== 'accepted') {
    throw Object.assign(new Error('The buyer must accept the transfer request before paying.'), { status: 409 });
  }
  if (transfer.paymentStatus === 'paid') {
    throw Object.assign(new Error('This transfer has already been paid.'), { status: 409 });
  }
}

async function findAuthorizedTransfer(req, transferId) {
  if (!mongoose.isValidObjectId(transferId)) {
    throw Object.assign(new Error('Transfer request not found.'), { status: 404 });
  }
  const transfer = await Transfer.findById(transferId);
  if (!transfer) throw Object.assign(new Error('Transfer request not found.'), { status: 404 });
  const wallet = walletOf(req);
  if (transfer.sellerWallet !== wallet && transfer.buyerWallet !== wallet) {
    throw Object.assign(new Error('You are not authorized to view this transfer request.'), { status: 403 });
  }
  return transfer;
}

async function currentOnChainOwner(productId) {
  try {
    const contract = contractAt();
    const key = productKey(productId);
    if (!(await contract.productExists(key))) {
      throw Object.assign(new Error('This product is not registered on the configured smart contract.'), { status: 409 });
    }
    const state = await contract.getProduct(key);
    return { contract, key, owner: state.currentOwner.toLowerCase() };
  } catch (error) {
    if (error.status) throw error;
    throw Object.assign(new Error('Could not verify product ownership on the configured blockchain.'), { status: 503 });
  }
}

// Returns true when a product exists only in MongoDB and was never registered
// on the smart contract (legacy / imported records). These products use a
// database-only ownership transfer path without any blockchain interaction.
async function isLegacyProduct(productId) {
  try {
    const contract = contractAt();
    const key = productKey(productId);
    return !(await contract.productExists(key));
  } catch {
    // If we cannot reach the chain at all, treat as legacy so the transfer
    // can still proceed via the DB-only path rather than failing entirely.
    return true;
  }
}

// Complete a legacy (off-chain) transfer by updating MongoDB directly.
// No blockchain interaction is performed. Ownership is updated in the DB
// and the transfer is marked completed with a synthetic confirmation.
async function synchronizeLegacyTransfer(transfer) {
  const product = await Product.findOne({ productId: transfer.productId });
  if (!product) throw Object.assign(new Error('Product not found.'), { status: 404 });

  // Verify the seller still owns the product in DB before updating.
  if (product.walletAddress !== transfer.sellerWallet) {
    throw Object.assign(new Error('The seller no longer owns this product in the database.'), { status: 409 });
  }

  const now = new Date();
  product.walletAddress = transfer.buyerWallet;
  product.status = 'Transferred';
  product.blockchainStatus = 'not_registered'; // Keep it clearly marked as legacy
  product.ownershipHistory.push({
    from: transfer.sellerWallet,
    to: transfer.buyerWallet,
    transferredAt: now,
    txHash: '', // No blockchain transaction
  });
  await product.save();

  transfer.status = 'completed';
  transfer.ownershipTransferStatus = 'confirmed';
  transfer.ownershipTransferError = '';
  transfer.completedAt = now;
  transfer.transactionHash = '';
  await transfer.save();
  return product;
}

// Per-transfer mutex: serializes automatic ownership-transfer attempts for the
// same transfer within this process (double-click, verify+finalize races).
// The locked task re-reads the transfer from MongoDB first, so the second
// caller either sees the completed state (idempotent no-op) or submits exactly
// one relayer transaction. The contract additionally guards correctness
// (transfer-to-current-owner reverts); this only prevents wasted gas and
// confusing errors from racing submissions.
const transferLocks = new Map();
function withTransferLock(transferId, task) {
  const key = String(transferId);
  const previous = transferLocks.get(key) || Promise.resolve();
  const run = previous.then(() => task(), () => task());
  const entry = run.then(() => undefined, () => undefined);
  transferLocks.set(key, entry);
  entry.then(() => {
    if (transferLocks.get(key) === entry) transferLocks.delete(key);
  });
  return run;
}

router.get('/products', async (req, res) => {
  try {
    requireDatabase();
    const wallet = walletOf(req);
    const [records, incomingTransfers] = await Promise.all([
      Product.find({
        $or: [{ walletAddress: wallet }, { 'ownershipHistory.to': wallet }],
      }).sort({ createdAt: -1 }).lean(),
      Transfer.find({ buyerWallet: wallet, status: { $in: ['accepted', 'completed'] } }, 'productId').lean(),
    ]);
    const knownIds = new Set(records.map((product) => product.productId));
    const missingIds = [...new Set(incomingTransfers.map((item) => item.productId))].filter((id) => !knownIds.has(id));
    if (missingIds.length) records.push(...await Product.find({ productId: { $in: missingIds } }).lean());
    const contract = contractAt();
    const products = [];

    for (const product of records) {
      const key = productKey(product.productId);
      try {
        const isRegistered = await contract.productExists(key);
        if (!isRegistered) {
          // Backward compatibility for legacy/imported records created before
          // on-chain registration was required. They remain visible only to
          // their recorded Mongo owner; never infer ownership for another user.
          if (product.walletAddress?.toLowerCase() === wallet) {
            products.push(passportProjection(product, true));
          }
          continue;
        }
        const state = await contract.getProduct(key);
        const chainOwner = state.currentOwner.toLowerCase();
        if (product.walletAddress !== chainOwner) {
          await Product.updateOne({ _id: product._id }, { $set: { walletAddress: chainOwner } });
        }
        if (chainOwner === wallet) products.push(passportProjection({ ...product, walletAddress: chainOwner }, true));
      } catch (error) {
        throw Object.assign(
          new Error(`Ownership for product ${product.productId} could not be checked on-chain. Please retry.`),
          { status: 503, cause: error }
        );
      }
    }
    return res.json({ products });
  } catch (error) {
    return res.status(error.status || 503).json({ message: error.message || 'Owned products could not be verified.' });
  }
});

router.post('/', async (req, res) => {
  try {
    requireDatabase();
    const sellerWallet = walletOf(req);
    const productId = String(req.body?.productId || '').trim().slice(0, 100);
    const buyerInput = String(req.body?.buyerWallet || '').trim();
    const buyerWallet = buyerInput.toLowerCase();
    const price = Number(req.body?.price);
    const currency = String(req.body?.currency || '').trim().toUpperCase();

    if (!productId) return res.status(400).json({ message: 'Select a product to transfer.' });
    if (!ethers.isAddress(buyerInput)) return res.status(400).json({ message: 'Enter a valid buyer wallet address.' });
    if (buyerWallet === sellerWallet) return res.status(400).json({ message: 'You cannot transfer a product to your own wallet.' });
    if (!Number.isFinite(price) || price <= 0) return res.status(400).json({ message: 'Transfer price must be greater than zero.' });
    if (!/^[A-Z]{3}$/.test(currency)) return res.status(400).json({ message: 'Currency must be a three-letter code, such as USD.' });

    const product = await Product.findOne({ productId });
    if (!product) return res.status(404).json({ message: 'Product not found.' });

    // Legacy (off-chain) products: verify ownership via MongoDB only.
    const legacy = await isLegacyProduct(productId);
    if (legacy) {
      if (product.walletAddress !== sellerWallet) {
        return res.status(403).json({ message: 'Your connected wallet is not the recorded owner of this product.' });
      }
    } else {
      // On-chain product: authoritative ownership from the smart contract.
      const { owner } = await currentOnChainOwner(productId);
      if (owner !== sellerWallet) return res.status(403).json({ message: 'Your connected wallet is not the current on-chain product owner.' });
      if (product.walletAddress !== owner) {
        product.walletAddress = owner;
        await product.save();
      }
    }

    const transfer = await Transfer.create({ productId, sellerWallet, buyerWallet, price, currency, status: 'pending' });
    return res.status(201).json({
      message: 'Transfer request sent. The buyer must review it before ownership can be transferred.',
      transfer: await serializeTransfer(transfer, true),
      paymentSupportedOnChain: false,
      isLegacyProduct: legacy,
    });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'This product already has a pending transfer request.' });
    return res.status(error.status || 500).json({ message: error.message || 'Transfer request could not be created.' });
  }
});

router.get('/sent', async (req, res) => {
  try {
    requireDatabase();
    const transfers = await Transfer.find({ sellerWallet: walletOf(req) }).sort({ createdAt: -1 }).lean();
    return res.json({ transfers: await Promise.all(transfers.map((item) => serializeTransfer(item, true))) });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Sent requests could not be loaded.' });
  }
});

router.get('/received', async (req, res) => {
  try {
    requireDatabase();
    const transfers = await Transfer.find({ buyerWallet: walletOf(req) }).sort({ createdAt: -1 }).lean();
    return res.json({ transfers: await Promise.all(transfers.map((item) => serializeTransfer(item, true))) });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Received requests could not be loaded.' });
  }
});

router.get('/history', async (req, res) => {
  try {
    requireDatabase();
    const wallet = walletOf(req);
    const transfers = await Transfer.find({
      status: 'completed',
      $or: [{ sellerWallet: wallet }, { buyerWallet: wallet }],
    }).sort({ completedAt: -1 }).lean();
    return res.json({ transfers: await Promise.all(transfers.map((item) => serializeTransfer(item, true))) });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Transfer history could not be loaded.' });
  }
});

router.get('/pending-counts', async (req, res) => {
  try {
    requireDatabase();
    const wallet = walletOf(req);
    const [sentRequests, receivedRequests] = await Promise.all([
      Transfer.find({ sellerWallet: wallet, status: { $in: ['pending', 'accepted'] } }).lean(),
      Transfer.find({ buyerWallet: wallet, status: 'pending' }).lean(),
    ]);
    const hasOutstandingOwner = async (transfer) => {
      try {
        // Legacy products: verify ownership via MongoDB (not on-chain).
        const legacy = await isLegacyProduct(transfer.productId);
        if (legacy) {
          const product = await Product.findOne({ productId: transfer.productId }, 'walletAddress').lean();
          return product?.walletAddress === transfer.sellerWallet;
        }
        const { owner } = await currentOnChainOwner(transfer.productId);
        return owner === transfer.sellerWallet;
      } catch {
        return false;
      }
    };
    const [sentFlags, receivedFlags] = await Promise.all([
      Promise.all(sentRequests.map(hasOutstandingOwner)),
      Promise.all(receivedRequests.map(hasOutstandingOwner)),
    ]);
    const sent = sentFlags.filter(Boolean).length;
    const received = receivedFlags.filter(Boolean).length;
    return res.json({ sent, received });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Transfer request counts could not be loaded.' });
  }
});

router.get('/:transferId', async (req, res) => {
  try {
    requireDatabase();
    const transfer = await findAuthorizedTransfer(req, req.params.transferId);
    return res.json({ transfer: await serializeTransfer(transfer, true) });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Transfer request could not be loaded.' });
  }
});

router.post('/:transferId/accept', async (req, res) => {
  try {
    requireDatabase();
    const wallet = walletOf(req);
    const pending = await Transfer.findOne({
      _id: req.params.transferId,
      buyerWallet: wallet,
      status: 'pending',
    });
    if (!pending) return res.status(409).json({ message: 'This request is no longer pending or does not belong to your wallet.' });

    // For legacy (off-chain) products, verify seller ownership via MongoDB only.
    const legacy = await isLegacyProduct(pending.productId);
    if (!legacy) {
      const { owner } = await currentOnChainOwner(pending.productId);
      if (owner !== pending.sellerWallet) {
        return res.status(409).json({ message: 'The seller is no longer the current on-chain product owner.' });
      }
    } else {
      const product = await Product.findOne({ productId: pending.productId }).lean();
      if (!product || product.walletAddress !== pending.sellerWallet) {
        return res.status(409).json({ message: 'The seller is no longer the recorded owner of this product.' });
      }
    }

    const transfer = await Transfer.findOneAndUpdate(
      { _id: req.params.transferId, buyerWallet: wallet, status: 'pending' },
      { $set: { status: 'accepted', acceptedAt: new Date() } },
      { new: true, runValidators: true }
    );
    if (!transfer) return res.status(409).json({ message: 'This request is no longer pending or does not belong to your wallet.' });
    return res.json({
      message: 'Request accepted. Complete the Razorpay test payment to trigger automatic ownership transfer.',
      transfer: await serializeTransfer(transfer, true),
      ownershipTransferred: false,
      paymentSupportedOnChain: false,
    });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Request could not be accepted.' });
  }
});

router.post('/:transferId/reject', async (req, res) => {
  try {
    requireDatabase();
    const transfer = await Transfer.findOneAndUpdate(
      { _id: req.params.transferId, buyerWallet: walletOf(req), status: 'pending' },
      { $set: { status: 'rejected', rejectedAt: new Date() } },
      { new: true, runValidators: true }
    );
    if (!transfer) return res.status(409).json({ message: 'This request is no longer pending or does not belong to your wallet.' });
    return res.json({ message: 'Transfer request rejected.', transfer: await serializeTransfer(transfer, true) });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Request could not be rejected.' });
  }
});

router.post('/:transferId/cancel', async (req, res) => {
  try {
    requireDatabase();
    const transfer = await Transfer.findOneAndUpdate(
      { _id: req.params.transferId, sellerWallet: walletOf(req), status: 'pending' },
      { $set: { status: 'cancelled', cancelledAt: new Date() } },
      { new: true, runValidators: true }
    );
    if (!transfer) return res.status(409).json({ message: 'Only your pending transfer requests can be cancelled.' });
    return res.json({ message: 'Transfer request cancelled.', transfer: await serializeTransfer(transfer, true) });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Request could not be cancelled.' });
  }
});

// ── Razorpay Test Mode (UPI) payment ─────────────────────────────
// Creates a Razorpay order for an accepted transfer. Buyer-only.
router.post('/:transferId/payment/create-order', async (req, res) => {
  try {
    requireDatabase();
    const transfer = await findAuthorizedTransfer(req, req.params.transferId);
    const buyer = walletOf(req);
    paymentPreconditions(transfer, buyer);

    if (!razorpay.isConfigured()) {
      throw Object.assign(new Error('Razorpay Test Mode is not configured on the backend. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backend/.env and restart the backend.'), { status: 503 });
    }

    const amountMinor = toMinorUnits(transfer.price, transfer.currency);
    const order = await razorpay.createOrder({
      amountMinor,
      currency: transfer.currency,
      receipt: String(transfer._id),
      notes: {
        transferId: String(transfer._id),
        productId: transfer.productId,
        sellerWallet: transfer.sellerWallet,
        buyerWallet: transfer.buyerWallet,
      },
    });

    transfer.paymentStatus = 'created';
    transfer.paymentCurrency = transfer.currency;
    transfer.paymentAmountMinor = amountMinor;
    transfer.razorpayOrderId = order.id;
    transfer.razorpayPaymentId = '';
    transfer.paymentVerifiedAt = null;
    await transfer.save();

    return res.json({
      message: 'Razorpay test order created. Complete the UPI payment to proceed.',
      paymentSupported: true,
      keyId: config.RAZORPAY_KEY_ID,
      orderId: order.id,
      amount: amountMinor,
      currency: transfer.currency,
      transfer: await serializeTransfer(transfer, true),
    });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Razorpay test order could not be created.' });
  }
});

// Verifies a Razorpay UPI payment server-side. Buyer-only. This is the ONLY
// place a payment is ever marked as successful — never trusted from the client.
router.post('/:transferId/payment/verify', async (req, res) => {
  try {
    requireDatabase();
    const transfer = await findAuthorizedTransfer(req, req.params.transferId);
    const buyer = walletOf(req);
    if (transfer.buyerWallet !== buyer) {
      return res.status(403).json({ message: 'Only the buyer wallet can verify this payment.' });
    }

    const orderId = String(req.body?.razorpay_order_id || '').trim();
    const paymentId = String(req.body?.razorpay_payment_id || '').trim();
    const signature = String(req.body?.razorpay_signature || '').trim();
    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ message: 'razorpay_order_id, razorpay_payment_id and razorpay_signature are all required.' });
    }

    // Idempotency / replay protection: already-verified transfers either return
    // the same success (same payment) or are rejected (a different payment).
    if (transfer.paymentStatus === 'paid') {
      if (transfer.razorpayPaymentId === paymentId) {
        if (transfer.status === 'completed') {
          return res.json({
            message: 'This payment was already verified and ownership transfer is confirmed.',
            transfer: await serializeTransfer(transfer, true),
            paymentVerified: true,
            ownershipTransferred: true,
            automatic: true,
            transactionHash: transfer.transactionHash || '',
          });
        }
        const result = transfer.status === 'completed'
          ? { ownershipTransferred: true, txHash: transfer.transactionHash || '', blockNumber: null }
          : await withTransferLock(transfer._id, () => attemptAutomaticTransfer(transfer));
        const freshTransfer = (await Transfer.findById(transfer._id)) || transfer;
        return res.json({
          message: result.ownershipTransferred
            ? 'Payment successful! The product has been transferred to your ownership.'
            : 'Payment verified. Ownership transfer is still pending.',
          transfer: await serializeTransfer(freshTransfer, true),
          paymentVerified: true,
          ownershipTransferred: result.ownershipTransferred,
          automatic: result.ownershipTransferred,
          transactionHash: result.txHash || '',
          blockNumber: result.blockNumber,
        });
      }
      return res.status(409).json({ message: 'This transfer has already been paid with a different payment.' });
    }

    if (!razorpay.isConfigured()) {
      throw Object.assign(new Error('Razorpay Test Mode is not configured on the backend.'), { status: 503 });
    }

    // The order must be the one this transfer created (prevents cross-transfer replay).
    if (!transfer.razorpayOrderId || transfer.razorpayOrderId !== orderId) {
      return res.status(409).json({ message: 'This payment does not belong to the expected order for this transfer.' });
    }

    // 1) Verify the checkout signature with the server-held secret.
    if (!razorpay.verifyCheckoutSignature({ orderId, paymentId, signature })) {
      return res.status(400).json({ message: 'Payment signature verification failed. This payment was not accepted.' });
    }

    // 2) Authoritatively re-fetch the payment from Razorpay and confirm it was
    //    captured for the expected order, amount and currency.
    const payment = await razorpay.fetchPayment(paymentId);
    if (String(payment.order_id) !== orderId) {
      return res.status(409).json({ message: 'The payment does not match the expected Razorpay order.' });
    }
    const expectedMinor = Number(transfer.paymentAmountMinor);
    if (Number(payment.amount) !== expectedMinor || String(payment.currency).toUpperCase() !== String(transfer.paymentCurrency).toUpperCase()) {
      return res.status(409).json({ message: 'The verified payment amount or currency does not match the agreed transfer.' });
    }

    if (payment.status === 'captured') {
      transfer.paymentStatus = 'paid';
      transfer.razorpayPaymentId = paymentId;
      transfer.paymentVerifiedAt = new Date();
      await transfer.save();

      // Automatically attempt the on-chain ownership transfer via the relayer.
      // Payment is already marked 'paid' and persisted, so even if the on-chain
      // step fails the paid state is never lost — the buyer can retry via
      // /finalize. The response tells the client whether it can proceed.
      let result = { ownershipTransferred: false, txHash: null, blockNumber: null };
      let finalizeError = '';
      try {
        result = await withTransferLock(transfer._id, () => attemptAutomaticTransfer(transfer));
      } catch (relayerError) {
        // Keep payment paid and visible as pending; allow safe relayer retry.
        finalizeError = relayerError.message || 'The on-chain ownership transfer could not be completed automatically.';
        transfer.ownershipTransferStatus = 'pending';
        transfer.ownershipTransferError = finalizeError.slice(0, 500);
        await transfer.save();
      }

      const freshTransfer = (await Transfer.findById(transfer._id)) || transfer;
      return res.json({
        message: result.ownershipTransferred
          ? 'Payment successful! The product has been transferred to your ownership.'
          : 'Payment verified, but ownership is not transferred yet. Retry the automatic transfer when it is available.',
        transfer: await serializeTransfer(freshTransfer, true),
        paymentVerified: true,
        ownershipTransferred: result.ownershipTransferred,
        automatic: result.ownershipTransferred,
        transactionHash: result.txHash || '',
        blockNumber: result.blockNumber,
        finalizeError: finalizeError || undefined,
      });
    }

    if (payment.status === 'failed') {
      transfer.paymentStatus = 'failed';
      await transfer.save();
      return res.status(409).json({ message: 'The UPI payment failed. Please try again.', transfer: await serializeTransfer(transfer, true), paymentVerified: false });
    }

    // authorized / created / refunded / anything else — do not treat as paid.
    return res.status(409).json({ message: `The payment is not complete yet (status: ${payment.status}).`, transfer: await serializeTransfer(transfer, true), paymentVerified: false });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message || 'Razorpay payment verification failed.' });
  }
});

router.post('/:transferId/prepare-completion', async (req, res) => {
  try {
    requireDatabase();
    const transfer = await findAuthorizedTransfer(req, req.params.transferId);
    const seller = walletOf(req);
    if (transfer.sellerWallet !== seller) return res.status(403).json({ message: 'Only the seller wallet can submit the ownership transfer.' });
    if (transfer.status !== 'accepted') return res.status(409).json({ message: 'The buyer must accept this request before ownership can be transferred.' });
    if (transfer.paymentStatus !== 'paid') return res.status(409).json({ message: 'The buyer must complete and verify the Razorpay test payment before ownership can be transferred.' });
    const product = await Product.findOne({ productId: transfer.productId }).lean();
    if (!product) return res.status(404).json({ message: 'Product not found.' });

    // Legacy products complete via the DB-only path; no contract calldata needed.
    const legacy = await isLegacyProduct(transfer.productId);
    if (legacy) {
      return res.json({
        isLegacyProduct: true,
        ownershipMethod: 'database',
        paymentSupportedOnChain: false,
      });
    }

    const { contract, key, owner } = await currentOnChainOwner(transfer.productId);
    if (owner !== seller) return res.status(409).json({ message: 'The seller is no longer the current on-chain product owner.' });
    return res.json({
      to: await contract.getAddress(),
      data: iface.encodeFunctionData('transferOwnership', [key, transfer.buyerWallet]),
      chainId: config.BLOCKCHAIN_CHAIN_ID,
      ownershipMethod: 'transferOwnership',
      paymentSupportedOnChain: false,
    });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Ownership transfer could not be prepared.' });
  }
});

router.post('/:transferId/complete', async (req, res) => {
  try {
    requireDatabase();
    const transfer = await findAuthorizedTransfer(req, req.params.transferId);
    const seller = walletOf(req);
    if (transfer.sellerWallet !== seller) return res.status(403).json({ message: 'Only the seller wallet can complete this transfer.' });
    if (transfer.status === 'completed' && transfer.transactionHash === req.body?.txHash) {
      return res.json({ message: 'This ownership transfer is already synchronized.', transfer: await serializeTransfer(transfer, true) });
    }
    if (transfer.status !== 'accepted') return res.status(409).json({ message: 'The request must be accepted and not previously completed.' });
    if (transfer.paymentStatus !== 'paid') return res.status(409).json({ message: 'The buyer must complete and verify the Razorpay test payment before ownership can be transferred.' });

    const verified = await verifyTransactionEvent({
      txHash: String(req.body?.txHash || '').trim(),
      eventName: 'OwnershipTransferred',
      expectedProductKey: productKey(transfer.productId),
      validateArgs: (args) =>
        args.previousOwner?.toLowerCase() === transfer.sellerWallet &&
        args.newOwner?.toLowerCase() === transfer.buyerWallet,
    });

    await synchronizeCompletedTransfer(transfer, {
      txHash: verified.receipt.hash,
      blockNumber: verified.receipt.blockNumber,
      timestampMs: Number(verified.block?.timestamp || 0) * 1000,
    });
    return res.json({
      message: 'Ownership change confirmed on-chain and synchronized with the product record.',
      transfer: await serializeTransfer(transfer, true),
      ownershipTransferred: true,
      transactionHash: verified.receipt.hash,
      blockNumber: verified.receipt.blockNumber,
      paymentSupportedOnChain: false,
    });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message || 'Confirmed ownership transfer could not be synchronized.' });
  }
});

// Automatic ownership transfer after a verified payment. The backend relayer
// submits `transferOwnershipByRelayer` on-chain (no seller MetaMask required),
// then synchronizes MongoDB ONLY after the on-chain owner is confirmed to be
// the buyer. Idempotent: repeated calls with an already-completed transfer do
// not create duplicate on-chain transfers or MongoDB records.
router.post('/:transferId/finalize', async (req, res) => {
  try {
    requireDatabase();
    const transfer = await findAuthorizedTransfer(req, req.params.transferId);
    const caller = walletOf(req);
    if (transfer.sellerWallet !== caller && transfer.buyerWallet !== caller) {
      return res.status(403).json({ message: 'You are not authorized to finalize this transfer.' });
    }

    // Idempotent success if already completed.
    if (transfer.status === 'completed') {
      return res.json({
        message: 'Ownership has already been transferred automatically.',
        transfer: await serializeTransfer(transfer, true),
        ownershipTransferred: true,
        automatic: true,
      });
    }

    if (transfer.status !== 'accepted') return res.status(409).json({ message: 'The request must be accepted before ownership can be transferred.' });
    if (transfer.paymentStatus !== 'paid') return res.status(409).json({ message: 'The buyer must complete and verify the Razorpay test payment before ownership can be transferred.' });

    // attemptAutomaticTransfer is duplicate-safe: it syncs-only if the product
    // is already the buyer's on-chain, otherwise it sends exactly one relayer
    // tx and verifies the OwnershipTransferred event before touching MongoDB.
    const transferKey = req.params.transferId;
    const result = await withTransferLock(transferKey, () => attemptAutomaticTransfer(transfer));
    const freshTransfer = (await Transfer.findById(transferKey)) || transfer;

    return res.json({
      message: 'Payment successful! Product transferred to the new owner.',
      transfer: await serializeTransfer(freshTransfer, true),
      ownershipTransferred: true,
      automatic: true,
      transactionHash: result.txHash || '',
      blockNumber: result.blockNumber,
    });
  } catch (error) {
    // Do not lose track of a paid transfer: payment stays 'paid' even if the
    // on-chain transfer failed, so the buyer/seller can retry /finalize.
    return res.status(error.status || 502).json({ message: error.message || 'Automatic ownership transfer failed. The payment remains verified; please retry.' });
  }
});

module.exports = router;
