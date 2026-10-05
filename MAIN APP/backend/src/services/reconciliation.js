const { ethers } = require('ethers');
const Product = require('../models/Product');
const ServiceRecord = require('../models/ServiceRecord');
const WarrantyClaim = require('../models/WarrantyClaim');
const SyncCheckpoint = require('../models/SyncCheckpoint');
const { getProvider, productKey, hashDetails, config } = require('./blockchain');
const { iface } = require('../routes/blockchainRoutes');
const keyHash = (value) => ethers.keccak256(ethers.toUtf8Bytes(value));
const ZERO = ethers.ZeroAddress;
let busy = false;
async function applyEvent(log) {
  let parsed; try { parsed = iface.parseLog(log); } catch { return; }
  const pkey = parsed.args.productKey.toLowerCase();
  const provider = getProvider(); const block = await provider.getBlock(log.blockNumber);
  if (parsed.name === 'ProductRegistered') {
    const products = await Product.find({}, 'productId walletAddress blockchainStatus blockchainTxHash blockchainBlock');
    const product = products.find((p) => productKey(p.productId).toLowerCase() === pkey);
    if (product && product.walletAddress.toLowerCase() === parsed.args.owner.toLowerCase()) {
      product.blockchainStatus = 'confirmed'; product.blockchainTxHash = log.transactionHash; product.blockchainBlock = log.blockNumber; await product.save();
    }
  } else if (parsed.name === 'OwnershipTransferred') {
    const products = await Product.find({}, 'productId walletAddress status ownershipHistory blockchainStatus blockchainTxHash blockchainBlock');
    const product = products.find((p) => productKey(p.productId).toLowerCase() === pkey);
    if (product && product.walletAddress.toLowerCase() === parsed.args.previousOwner.toLowerCase()) {
      const exists = product.ownershipHistory.some((x) => x.txHash === log.transactionHash);
      if (!exists) product.ownershipHistory.push({ from: parsed.args.previousOwner, to: parsed.args.newOwner, transferredAt: new Date(Number(parsed.args.timestamp) * 1000), txHash: log.transactionHash });
      product.walletAddress = parsed.args.newOwner; product.status = 'Transferred'; product.blockchainStatus = 'confirmed'; product.blockchainTxHash = log.transactionHash; product.blockchainBlock = log.blockNumber; await product.save();
    }
  } else if (parsed.name === 'ServiceRecorded' || parsed.name === 'WarrantyClaimRecorded') {
    const isService = parsed.name === 'ServiceRecorded';
    const id = isService ? 'serviceId' : 'warrantyClaimId';
    const model = isService ? ServiceRecord : WarrantyClaim;
    const records = await model.find({ productId: { $exists: true }, blockchainStatus: { $in: ['pending', 'confirmed'] } });
    const record = records.find((item) => productKey(item.productId).toLowerCase() === pkey && keyHash(item[id]).toLowerCase() === parsed.args[isService ? 'serviceKey' : 'claimKey'].toLowerCase() && `0x${item.documentHash}`.toLowerCase() === parsed.args.documentHash.toLowerCase() && hashDetails(item.confirmedData).toLowerCase() === parsed.args.detailsHash.toLowerCase());
    if (record) { record.status = 'confirmed'; record.blockchainStatus = 'confirmed'; record.txHash = log.transactionHash; record.blockNumber = log.blockNumber; record.logIndex = log.index; record.blockchainTimestamp = new Date(Number(block.timestamp) * 1000); await record.save(); }
  }
}
async function reconcileOnce() {
  if (busy || !config.CONTRACT_ADDRESS) return;
  busy = true;
  try {
    const provider = getProvider(); const network = await provider.getNetwork();
    if (Number(network.chainId) !== config.BLOCKCHAIN_CHAIN_ID) throw new Error('Configured RPC chain ID mismatch.');
    const latest = await provider.getBlockNumber();
    const checkpoint = await SyncCheckpoint.findOneAndUpdate({ name: config.CONTRACT_ADDRESS.toLowerCase() }, { $setOnInsert: { blockNumber: 0 } }, { upsert: true, returnDocument: 'after' });
    let from = checkpoint.blockNumber + 1;
    while (from <= latest) {
      const to = Math.min(from + 1999, latest);
      const logs = await provider.getLogs({ address: config.CONTRACT_ADDRESS, fromBlock: from, toBlock: to });
      for (const log of logs) await applyEvent(log);
      checkpoint.blockNumber = to; await checkpoint.save(); from = to + 1;
    }
  } catch (error) { console.error('Blockchain event synchronization failed:', error.message); }
  finally { busy = false; }
}
function startReconciliation() { reconcileOnce(); const timer = setInterval(reconcileOnce, 10000); timer.unref?.(); return timer; }
module.exports = { startReconciliation, reconcileOnce };
