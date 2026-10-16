const { ethers } = require('ethers');
const config = require('../config/env');
const { artifact, productKey, getProvider } = require('./blockchain');

/**
 * Relayer service — submits `transferOwnershipByRelayer` on behalf of the
 * seller AFTER the backend has verified a Razorpay payment.
 *
 * Security rules enforced here:
 *  - The relayer private key lives only in backend/.env and is never exposed
 *    to the frontend or any API response.
 *  - This service is only ever called from the transfer route AFTER server-side
 *    payment verification. It does NOT verify payments itself.
 *  - The on-chain contract independently re-checks that msg.sender is the
 *    authorized relayer, so even this service cannot transfer ownership for an
 *    unregistered product or to the zero address.
 */

let wallet = null;
let contract = null;

function isConfigured() {
  return Boolean(
    config.RELAYER_PRIVATE_KEY &&
    config.CONTRACT_ADDRESS &&
    config.CONTRACT_ADDRESS !== ethers.ZeroAddress
  );
}

function getRelayerWallet() {
  if (!isConfigured()) {
    throw Object.assign(
      new Error('Automatic ownership transfer is not configured. Set RELAYER_PRIVATE_KEY in backend/.env (a dedicated Sepolia wallet authorized via setRelayer) and restart the backend.'),
      { status: 503 }
    );
  }
  if (!wallet) {
    try {
      wallet = new ethers.Wallet(config.RELAYER_PRIVATE_KEY, getProvider());
    } catch (error) {
      throw Object.assign(new Error('The configured RELAYER_PRIVATE_KEY is not a valid key.'), { status: 500 });
    }
  }
  return wallet;
}

function getRelayerContract() {
  if (!config.CONTRACT_ADDRESS || config.CONTRACT_ADDRESS === ethers.ZeroAddress) {
    throw Object.assign(new Error('BlockWarranty contract address has not been configured.'), { status: 503 });
  }
  if (!contract) {
    contract = new ethers.Contract(config.CONTRACT_ADDRESS, artifact.abi, getRelayerWallet());
  }
  return contract;
}

/** Returns the relayer wallet address (safe to log/compare, not a secret). */
function relayerAddress() {
  try {
    return getRelayerWallet().address;
  } catch {
    return '';
  }
}

/**
 * Executes an on-chain ownership transfer as the authorized relayer.
 * @param {string} productId  Product id (hashed to the contract productKey).
 * @param {string} newOwner   Verified buyer wallet address.
 * @returns {Promise<{txHash: string, receipt: object, key: string}>}
 */
async function transferOwnershipByRelayer(productId, newOwner) {
  const contractInstance = getRelayerContract();
  let authorizedRelayer;
  try {
    authorizedRelayer = await contractInstance.relayer();
  } catch {
    throw Object.assign(
      new Error('The configured contract does not support authorized relayer transfers. Deploy and configure the relayer-enabled contract, then migrate products before retrying.'),
      { status: 503 }
    );
  }
  const signerAddress = getRelayerWallet().address.toLowerCase();
  if (String(authorizedRelayer).toLowerCase() !== signerAddress) {
    throw Object.assign(new Error('The backend relayer wallet is not authorized by the configured contract.'), { status: 503 });
  }
  const key = productKey(productId);
  const product = await contractInstance.getProduct(key);
  if (product.currentOwner.toLowerCase() === String(newOwner).toLowerCase()) {
    return { txHash: '', receipt: null, key, alreadyTransferred: true };
  }
  const tx = await contractInstance.transferOwnershipByRelayer(key, newOwner);
  const receipt = await tx.wait(1);
  return { txHash: receipt.hash, receipt, key };
}

module.exports = {
  isConfigured,
  relayerAddress,
  transferOwnershipByRelayer,
};
