/**
 * reconciliation.js — Blockchain event sync service
 *
 * Polls the Sepolia node every 10 seconds and applies new contract events
 * to MongoDB records. Maintains a SyncCheckpoint document per contract
 * address to avoid re-processing already-seen blocks.
 */

const { ethers } = require('ethers');
const Product = require('../models/Product');
const ServiceRecord = require('../models/ServiceRecord');
const WarrantyClaim = require('../models/WarrantyClaim');
const SyncCheckpoint = require('../models/SyncCheckpoint');
const { getProvider, productKey, hashDetails, config } = require('./blockchain');
const { iface } = require('../routes/blockchainRoutes');

// Deployment block — never scan before this to avoid Alchemy Free tier batch limits
const DEPLOYMENT_BLOCK = Number(process.env.BLOCKCHAIN_DEPLOYMENT_BLOCK || 11845000);

// Alchemy Free tier allows max 10-block range per eth_getLogs request.
// PAYG/Growth tiers support up to 2000. Adjust here if you upgrade.
const BATCH_SIZE = Number(process.env.SYNC_BATCH_SIZE || 10);

const keyHash = (value) => ethers.keccak256(ethers.toUtf8Bytes(value));
let busy = false;

// ─────────────────────────────────────────────
// Event handlers
// ─────────────────────────────────────────────

async function handleProductRegistered(parsed, log) {
  const pkey = parsed.args.productKey.toLowerCase();
  const products = await Product.find(
    {},
    'productId walletAddress blockchainStatus blockchainTxHash blockchainBlock'
  );
  const product = products.find(
    (p) => productKey(p.productId).toLowerCase() === pkey
  );
  if (product && product.walletAddress.toLowerCase() === parsed.args.owner.toLowerCase()) {
    product.blockchainStatus = 'confirmed';
    product.blockchainTxHash = log.transactionHash;
    product.blockchainBlock = log.blockNumber;
    await product.save();
  }
}

async function handleOwnershipTransferred(parsed, log) {
  const pkey = parsed.args.productKey.toLowerCase();
  const products = await Product.find(
    {},
    'productId walletAddress status ownershipHistory blockchainStatus blockchainTxHash blockchainBlock'
  );
  const product = products.find(
    (p) => productKey(p.productId).toLowerCase() === pkey
  );
  if (
    product &&
    product.walletAddress.toLowerCase() === parsed.args.previousOwner.toLowerCase()
  ) {
    const alreadyRecorded = product.ownershipHistory.some(
      (x) => x.txHash === log.transactionHash
    );
    if (!alreadyRecorded) {
      product.ownershipHistory.push({
        from: parsed.args.previousOwner,
        to: parsed.args.newOwner,
        transferredAt: new Date(Number(parsed.args.timestamp) * 1000),
        txHash: log.transactionHash,
      });
    }
    product.walletAddress = parsed.args.newOwner;
    product.status = 'Transferred';
    product.blockchainStatus = 'confirmed';
    product.blockchainTxHash = log.transactionHash;
    product.blockchainBlock = log.blockNumber;
    await product.save();
  }
}

async function handleServiceOrClaim(parsed, log, isService) {
  const pkey = parsed.args.productKey.toLowerCase();
  const idField = isService ? 'serviceId' : 'warrantyClaimId';
  const Model = isService ? ServiceRecord : WarrantyClaim;
  const serviceKeyField = isService ? 'serviceKey' : 'claimKey';

  const records = await Model.find(
    { productId: { $exists: true }, blockchainStatus: { $in: ['pending', 'confirmed'] } }
  );

  const record = records.find(
    (item) =>
      productKey(item.productId).toLowerCase() === pkey &&
      keyHash(item[idField]).toLowerCase() === parsed.args[serviceKeyField].toLowerCase() &&
      `0x${item.documentHash}`.toLowerCase() === parsed.args.documentHash.toLowerCase() &&
      hashDetails(item.confirmedData).toLowerCase() === parsed.args.detailsHash.toLowerCase()
  );

  if (record) {
    const provider = getProvider();
    const block = await provider.getBlock(log.blockNumber);
    record.status = 'confirmed';
    record.blockchainStatus = 'confirmed';
    record.txHash = log.transactionHash;
    record.blockNumber = log.blockNumber;
    record.logIndex = log.index;
    record.blockchainTimestamp = new Date(Number(block.timestamp) * 1000);
    await record.save();
  }
}

async function applyEvent(log) {
  let parsed;
  try {
    parsed = iface.parseLog(log);
  } catch {
    return; // Unrecognised event — skip
  }

  if (!parsed) return;

  switch (parsed.name) {
    case 'ProductRegistered':
      await handleProductRegistered(parsed, log);
      break;
    case 'OwnershipTransferred':
      await handleOwnershipTransferred(parsed, log);
      break;
    case 'ServiceRecorded':
      await handleServiceOrClaim(parsed, log, true);
      break;
    case 'WarrantyClaimRecorded':
      await handleServiceOrClaim(parsed, log, false);
      break;
    default:
      break;
  }
}

// ─────────────────────────────────────────────
// Main sync loop
// ─────────────────────────────────────────────

async function reconcileOnce() {
  if (busy || !config.CONTRACT_ADDRESS) return;
  busy = true;

  try {
    const provider = getProvider();
    const network = await provider.getNetwork();

    if (Number(network.chainId) !== config.BLOCKCHAIN_CHAIN_ID) {
      throw new Error('Configured RPC chain ID does not match the contract chain.');
    }

    const latest = await provider.getBlockNumber();
    const checkpoint = await SyncCheckpoint.findOneAndUpdate(
      { name: config.CONTRACT_ADDRESS.toLowerCase() },
      { $setOnInsert: { blockNumber: DEPLOYMENT_BLOCK - 1 } },
      { upsert: true, returnDocument: 'after' }
    );

    // Never go below deployment block
    let from = Math.max(checkpoint.blockNumber + 1, DEPLOYMENT_BLOCK);

    // Process in BATCH_SIZE-block batches (10 for Alchemy Free, up to 2000 for PAYG)
    while (from <= latest) {
      const to = Math.min(from + BATCH_SIZE - 1, latest);
      const logs = await provider.getLogs({
        address: config.CONTRACT_ADDRESS,
        fromBlock: from,
        toBlock: to,
      });
      for (const log of logs) {
        await applyEvent(log);
      }
      checkpoint.blockNumber = to;
      await checkpoint.save();
      from = to + 1;
    }
  } catch (error) {
    console.error('Blockchain event synchronization failed:', error.message);
  } finally {
    busy = false;
  }
}

function startReconciliation() {
  reconcileOnce();
  const timer = setInterval(reconcileOnce, 10_000);
  timer.unref?.();
  return timer;
}

module.exports = { startReconciliation, reconcileOnce };
