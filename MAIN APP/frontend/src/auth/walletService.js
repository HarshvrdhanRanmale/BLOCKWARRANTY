/**
 * BlockWarranty Wallet Service
 *
 * Provides helper functions for:
 *  - Requesting auth nonce / signing / verifying with the backend
 *  - Sending signed transactions through the active MetaMask provider
 *
 * Identity is handled exclusively by MetaMask (WalletProvider.jsx).
 * All embedded-wallet / Web3Auth / browser-wallet code has been removed.
 */

import { ethers } from "ethers";
import { API_BASE_URL } from "../lib/api";

// ─────────────────────────────────────────────
// AUTH — Nonce / Sign / Verify
// ─────────────────────────────────────────────

/**
 * Requests a fresh authentication challenge nonce from the backend.
 * @param {string} walletAddress
 */
export async function requestAuthNonce(walletAddress) {
  const response = await fetch(`${API_BASE_URL}/api/auth/nonce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress }),
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || "Failed to retrieve authentication challenge from server.");
  }
  return data;
}

/**
 * Signs a message using the connected MetaMask wallet.
 * @param {string} walletAddress  Expected signer address
 * @param {string} message        The challenge message to sign
 * @returns {Promise<string>}     EIP-191 signature
 */
export async function signMessage(walletAddress, message) {
  const rawProvider = window.ethereum;
  if (!rawProvider) {
    throw new Error("MetaMask is not installed. Please install MetaMask and try again.");
  }

  const provider = new ethers.BrowserProvider(rawProvider);
  const signer = await provider.getSigner();
  const signerAddress = ethers.getAddress(await signer.getAddress());

  if (signerAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new Error(
      `Wallet address mismatch: MetaMask returned ${signerAddress}, expected ${walletAddress}.`
    );
  }

  try {
    return await signer.signMessage(message);
  } catch (err) {
    if (err.code === 4001 || String(err.message).includes("rejected")) {
      throw new Error("Signature request was cancelled.");
    }
    throw new Error(err.message || "Cryptographic signature failed.");
  }
}

/**
 * Verifies a wallet signature with the backend and retrieves a JWT session.
 * @param {string} walletAddress
 * @param {string} message
 * @param {string} signature
 * @param {{ name?: string, email?: string }} [userInfo]
 */
export async function verifySignatureWithBackend(walletAddress, message, signature, userInfo = {}) {
  const payload = { walletAddress, message, signature };
  if (userInfo?.name) payload.name = userInfo.name;
  if (userInfo?.email) payload.email = userInfo.email;

  const response = await fetch(`${API_BASE_URL}/api/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || "Server-side signature verification failed.");
  }
  return data;
}

// ─────────────────────────────────────────────
// TRANSACTION — Send via MetaMask
// ─────────────────────────────────────────────

/**
 * Sends a pre-built transaction through MetaMask and returns the tx hash.
 * Automatically switches to the correct chain if needed.
 *
 * @param {{ to: string, data: string }} transaction  Prepared tx from backend
 * @param {number} expectedChainId                    Required chain (e.g. 11155111 for Sepolia)
 * @returns {Promise<string>}                         Transaction hash
 */
export async function sendWalletTransaction(transaction, expectedChainId) {
  const rawProvider = window.ethereum;
  if (!rawProvider) {
    throw new Error("MetaMask is not connected. Please connect your wallet and retry.");
  }

  const provider = new ethers.BrowserProvider(rawProvider);
  const targetChainId = Number(expectedChainId);
  const network = await provider.getNetwork();

  if (Number(network.chainId) !== targetChainId) {
    const chainHex = `0x${targetChainId.toString(16)}`;
    try {
      await rawProvider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainHex }],
      });
    } catch (switchErr) {
      if (switchErr.code !== 4902) throw switchErr;
      // Chain not added to MetaMask — shouldn't happen for Sepolia, but handle gracefully
      throw new Error(
        "Please switch MetaMask to the Sepolia network and retry."
      );
    }
    // Re-validate after switch
    const updated = await provider.getNetwork();
    if (Number(updated.chainId) !== targetChainId) {
      throw new Error("Network switch failed. Please switch to Sepolia in MetaMask and retry.");
    }
  }

  const signer = await provider.getSigner();
  const tx = await signer.sendTransaction({ to: transaction.to, data: transaction.data });
  return tx.hash;
}

// ─────────────────────────────────────────────
// DIAGNOSTICS
// ─────────────────────────────────────────────

/** Returns basic diagnostic info — useful for support/debug panels. */
export function getWalletDiagnostics() {
  return {
    metaMaskDetected: typeof window !== "undefined" && Boolean(window.ethereum),
    apiBaseUrl: API_BASE_URL,
  };
}
