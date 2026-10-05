const { ethers } = require('ethers');
const config = require('../config/env');
const artifact = require('../contracts/BlockWarranty.json');

const iface = new ethers.Interface(artifact.abi);

const productKey = (id) => ethers.keccak256(ethers.toUtf8Bytes(String(id)));
const hashDocument = (hash) => {
  if (!hash) return ethers.ZeroHash;
  return hash.startsWith('0x') ? hash : `0x${hash}`;
};
const hashDetails = (value) => ethers.keccak256(ethers.toUtf8Bytes(typeof value === 'string' ? value : JSON.stringify(value || {})));

const getProvider = () => new ethers.JsonRpcProvider(config.RPC_URL, config.BLOCKCHAIN_CHAIN_ID);

function contractAt(provider = getProvider()) {
  if (!ethers.isAddress(config.CONTRACT_ADDRESS) || config.CONTRACT_ADDRESS === ethers.ZeroAddress) {
    throw new Error('BlockWarranty contract address has not been configured.');
  }
  return new ethers.Contract(config.CONTRACT_ADDRESS, artifact.abi, provider);
}

/**
 * Authoritative server-side verification of a Sepolia transaction receipt and contract event.
 */
async function verifyTransactionEvent({
  txHash,
  eventName,
  expectedProductKey,
  expectedCaller,
  validateArgs,
}) {
  if (!ethers.isHexString(txHash, 32)) {
    throw Object.assign(new Error('A valid 32-byte transaction hash is required.'), { status: 400 });
  }

  const provider = getProvider();
  const receipt = await provider.waitForTransaction(txHash, 1, 45000);
  if (!receipt || receipt.status !== 1) {
    throw Object.assign(new Error('The blockchain transaction did not succeed or was reverted.'), { status: 400 });
  }

  const contractAddressLower = config.CONTRACT_ADDRESS.toLowerCase();

  // Search logs for the contract event
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== contractAddressLower) continue;
    try {
      const parsed = iface.parseLog(log);
      if (!parsed || parsed.name !== eventName) continue;

      // Verify productKey if expected
      if (expectedProductKey) {
        const eventKey = parsed.args.productKey;
        if (eventKey.toLowerCase() !== expectedProductKey.toLowerCase()) continue;
      }

      // Verify caller/owner if expected
      if (expectedCaller) {
        const callerMatch =
          parsed.args.owner?.toLowerCase() === expectedCaller.toLowerCase() ||
          parsed.args.previousOwner?.toLowerCase() === expectedCaller.toLowerCase() ||
          parsed.args.serviceProvider?.toLowerCase() === expectedCaller.toLowerCase() ||
          parsed.args.claimant?.toLowerCase() === expectedCaller.toLowerCase();
        if (!callerMatch) continue;
      }

      // Run custom arguments validation callback if provided
      if (typeof validateArgs === 'function') {
        const valid = validateArgs(parsed.args);
        if (!valid) continue;
      }

      const block = await provider.getBlock(receipt.blockNumber);
      return {
        receipt,
        parsed,
        block,
        log,
      };
    } catch {
      // Unrelated event log
    }
  }

  throw Object.assign(
    new Error(`The transaction receipt does not contain a matching ${eventName} event on the BCCC contract.`),
    { status: 400 }
  );
}

module.exports = {
  artifact,
  iface,
  productKey,
  hashDocument,
  hashDetails,
  getProvider,
  contractAt,
  verifyTransactionEvent,
  config,
};
