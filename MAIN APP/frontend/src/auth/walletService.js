/**
 * BlockWarranty Wallet Service — v11 (Web3Auth Modal v11)
 *
 * Canonical identity: walletAddress (EVM address)
 *
 * Embedded wallet (no extension):
 *   Google → Web3Auth embedded wallet → deterministic EVM address
 *   Same Google account always restores the same wallet address.
 *
 * External wallet:
 *   MetaMask browser extension → eth_requestAccounts → walletAddress
 *
 * REMOVED: getOrCreateClientWallet() — that was a fake browser-local-only
 * wallet that generated a different address in every browser.
 */

import { ethers } from "ethers";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const BLOCKCHAIN_CHAIN_ID = Number(import.meta.env.VITE_BLOCKCHAIN_CHAIN_ID || 31337);
const DIRECT_BLOCKCHAIN_RPC_URL = import.meta.env.VITE_BLOCKCHAIN_RPC_URL || "http://127.0.0.1:8545";
const LOCAL_DEMO_RPC_URL = typeof window !== "undefined"
  ? new URL("/api/blockchain/rpc", window.location.origin).toString()
  : "/api/blockchain/rpc";
const WEB3AUTH_RPC_URL = import.meta.env.VITE_WEB3AUTH_RPC_URL || (BLOCKCHAIN_CHAIN_ID === 31337
  ? LOCAL_DEMO_RPC_URL
  : DIRECT_BLOCKCHAIN_RPC_URL);
const METAMASK_CLIENT_ID = import.meta.env.VITE_METAMASK_EMBEDDED_CLIENT_ID || "";
const METAMASK_NETWORK = import.meta.env.VITE_METAMASK_NETWORK || "sapphire_devnet";

// Module-level singletons — one instance per session
let _web3authInstance = null;
let _activeProvider = null;  // ethers-compatible provider (EIP-1193)
let _activeWalletType = null; // "embedded" | "external" | "browser"
let _browserWallet = null; // In-browser ethers.Wallet instance

// ─────────────────────────────────────────────
// DIAGNOSTICS (never exposes private keys)
// ─────────────────────────────────────────────

export function getWalletDiagnostics() {
  return {
    clientIdConfigured: Boolean(METAMASK_CLIENT_ID && METAMASK_CLIENT_ID.trim().length > 0),
    network: METAMASK_NETWORK,
    apiBaseUrl: API_BASE_URL,
    metaMaskExtensionDetected: typeof window !== "undefined" && Boolean(window.ethereum),
    activeWalletType: _activeWalletType,
    hasActiveProvider: Boolean(_activeProvider),
    web3authInitialized: Boolean(_web3authInstance),
  };
}

// ─────────────────────────────────────────────
// WEB3AUTH v11 INITIALISATION
// ─────────────────────────────────────────────

async function _getOrInitWeb3Auth() {
  if (_web3authInstance) return _web3authInstance;

  if (!METAMASK_CLIENT_ID || !METAMASK_CLIENT_ID.trim()) {
    throw new Error(
      "SETUP_REQUIRED: VITE_METAMASK_EMBEDDED_CLIENT_ID is not configured. " +
      "Get your Client ID from https://developer.metamask.io and add it to frontend/.env"
    );
  }

  try {
    const { Web3Auth, WEB3AUTH_NETWORK } = await import("@web3auth/modal");

    const chainConfig = {
      chainNamespace: "eip155",
      chainId: `0x${BLOCKCHAIN_CHAIN_ID.toString(16)}`,
      rpcTarget: WEB3AUTH_RPC_URL,
      displayName: "BlockWarranty Demo Chain",
      blockExplorerUrl: "",
      ticker: "ETH",
      tickerName: "Ethereum",
    };

    const networkMap = {
      sapphire_devnet: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
      sapphire_mainnet: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
      testnet: WEB3AUTH_NETWORK.TESTNET,
    };

    const instance = new Web3Auth({
      clientId: METAMASK_CLIENT_ID.trim(),
      web3AuthNetwork: networkMap[METAMASK_NETWORK] ?? WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
      chains: [chainConfig],
      chainConfig,
    });

    await instance.init();
    _web3authInstance = instance;
    return instance;
  } catch (err) {
    _web3authInstance = null;
    if (err.message && err.message.startsWith("SETUP_REQUIRED:")) throw err;
    console.error("[BlockWarranty] Web3Auth init error:", err);
    throw new Error(err.message || "Wallet setup is temporarily unavailable. Please try again.");
  }
}

// ─────────────────────────────────────────────
// GOOGLE EMBEDDED WALLET (no browser extension)
// ─────────────────────────────────────────────

/**
 * Connect via Google → embedded wallet (cross-browser, same Google = same address).
 * Uses Web3Auth v11 connectTo API with WALLET_CONNECTORS.AUTH.
 */
export async function connectWithGoogle() {
  const web3auth = await _getOrInitWeb3Auth();

  let connection = null;
  try {
    const { WALLET_CONNECTORS, AUTH_CONNECTION } = await import("@web3auth/modal");

    // connectTo triggers the Google OAuth popup directly — no modal UI shown
    connection = await web3auth.connectTo(WALLET_CONNECTORS.AUTH, {
      authConnection: (AUTH_CONNECTION && AUTH_CONNECTION.GOOGLE) || "google",
      loginProvider: "google",
    });
  } catch (err) {
    if (!err) throw new Error("Google sign-in was cancelled.");
    const msg = err.message || "";
    if (
      msg.includes("User closed") ||
      msg.includes("popup has been closed") ||
      msg.includes("cancelled") ||
      msg.includes("popup_closed") ||
      msg.includes("user_cancelled") ||
      err.code === 4001
    ) {
      throw new Error("Google sign-in was cancelled.");
    }
    if (/could not validate redirect|whitelist your domain|allowed origin/i.test(msg)) {
      const origin = typeof window !== "undefined" ? window.location.origin : "this site";
      throw new Error(
        `Google sign-in needs one owner setup step: add ${origin} to the allowed origins for this app's MetaMask Embedded Wallet project, then try again.`
      );
    }
    console.error("[BlockWarranty] Google connect error:", err);
    throw new Error(err.message || "We couldn't connect your wallet. Please try again.");
  }

  const provider = connection?.ethereumProvider || web3auth.provider;
  if (!provider) {
    throw new Error("We couldn't connect your wallet. Please try again.");
  }

  let userInfo = null;
  try {
    userInfo = await web3auth.getUserInfo();
  } catch (e) {
    console.warn("[BlockWarranty] Could not fetch Google user info:", e);
  }

  try {
    const ethersProvider = new ethers.BrowserProvider(provider);
    const signer = await ethersProvider.getSigner();
    const rawAddress = await signer.getAddress();
    const walletAddress = ethers.getAddress(rawAddress);

    _activeProvider = provider;
    _activeWalletType = "embedded";

    return {
      walletAddress,
      walletType: "embedded",
      provider,
      userInfo: {
        name: userInfo?.name || "",
        email: userInfo?.email || "",
      },
    };
  } catch (err) {
    console.error("[BlockWarranty] Address resolution error:", err);
    throw new Error("We couldn't connect your wallet. Please try again.");
  }
}

/**
 * Fetch user info from the active embedded Web3Auth session if available
 */
export async function getEmbeddedUserInfo() {
  if (_web3authInstance && _web3authInstance.connected) {
    try {
      const info = await _web3authInstance.getUserInfo();
      return {
        name: info?.name || "",
        email: info?.email || "",
      };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Re-connect/restore existing Web3Auth session without a new popup.
 * Returns { walletAddress, walletType } if session is live, null otherwise.
 */
export async function tryRestoreEmbeddedSession() {
  if (!METAMASK_CLIENT_ID || !METAMASK_CLIENT_ID.trim()) return null;

  try {
    const web3auth = await _getOrInitWeb3Auth();

    // Web3Auth v11: check if provider is available
    const provider = web3auth.connection?.ethereumProvider || web3auth.provider;
    if (web3auth.connected && provider) {
      const ethersProvider = new ethers.BrowserProvider(provider);
      const signer = await ethersProvider.getSigner();
      const walletAddress = ethers.getAddress(await signer.getAddress());

      _activeProvider = provider;
      _activeWalletType = "embedded";

      return { walletAddress, walletType: "embedded" };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Disconnect/logout the embedded Web3Auth session.
 * Does NOT delete the wallet or keys — only clears the active session.
 */
export async function disconnectEmbeddedWallet() {
  if (_web3authInstance) {
    try {
      if (_web3authInstance.connected) {
        await _web3authInstance.logout();
      }
    } catch {
      // Ignore logout errors — session may already be gone
    }
  }
  _activeProvider = null;
  _activeWalletType = null;
}

// ─────────────────────────────────────────────
// METAMASK EXTENSION (external wallet)
// ─────────────────────────────────────────────

export async function connectMetaMaskExtension() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error(
      "MetaMask is not installed. Please install the MetaMask extension or use Continue with Google."
    );
  }

  try {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });

    if (!accounts || accounts.length === 0) {
      throw new Error("No Ethereum account selected in MetaMask.");
    }

    const walletAddress = ethers.getAddress(accounts[0]);
    _activeProvider = window.ethereum;
    _activeWalletType = "external";

    return { walletAddress, walletType: "external", provider: window.ethereum };
  } catch (err) {
    if (err.code === 4001 || (err.message && err.message.includes("rejected"))) {
      throw new Error("Wallet verification was cancelled.");
    }
    throw new Error(err.message || "We couldn't connect your wallet. Please try again.");
  }
}

// ─────────────────────────────────────────────
// BROWSER / DEMO WALLET (instant, reliable EVM wallet)
// ─────────────────────────────────────────────

export function getOrCreateBrowserWallet() {
  const STORAGE_KEY = "blockwarranty_browser_wallet_key";
  let privateKey = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  let isNew = false;
  if (!privateKey) {
    const randomWallet = ethers.Wallet.createRandom();
    privateKey = randomWallet.privateKey;
    localStorage.setItem(STORAGE_KEY, privateKey);
    isNew = true;
  }
  _browserWallet = new ethers.Wallet(privateKey);
  _activeWalletType = "browser";
  _activeProvider = null;

  return {
    walletAddress: ethers.getAddress(_browserWallet.address),
    walletType: "browser",
    walletCreated: isNew,
    userInfo: { name: "", email: "" },
  };
}

// ─────────────────────────────────────────────
// SIGN & AUTHENTICATE
// ─────────────────────────────────────────────

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

export async function signMessage(walletAddress, message) {
  // 1. Browser/Demo Wallet signing
  if (_activeWalletType === "browser" || (!_activeProvider && typeof window !== "undefined" && localStorage.getItem("blockwarranty_browser_wallet_key"))) {
    if (!_browserWallet) {
      const privateKey = localStorage.getItem("blockwarranty_browser_wallet_key");
      if (privateKey) {
        _browserWallet = new ethers.Wallet(privateKey);
      }
    }
    if (_browserWallet && _browserWallet.address.toLowerCase() === walletAddress.toLowerCase()) {
      return await _browserWallet.signMessage(message);
    }
  }

  // 2. MetaMask or Web3Auth Provider signing
  const provider = _activeProvider ?? (typeof window !== "undefined" ? window.ethereum : null);

  if (!provider) {
    throw new Error("No active wallet provider. Please connect your wallet first.");
  }

  try {
    const ethersProvider = new ethers.BrowserProvider(provider);
    const signer = await ethersProvider.getSigner();

    // Verify signer address matches expected address
    const signerAddress = ethers.getAddress(await signer.getAddress());
    if (signerAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      throw new Error(
        `Wallet address mismatch: provider returned ${signerAddress}, expected ${walletAddress}.`
      );
    }

    return await signer.signMessage(message);
  } catch (err) {
    if (err.code === 4001 || (err.message && err.message.includes("rejected"))) {
      throw new Error("Wallet verification was cancelled.");
    }
    throw new Error(err.message || "Cryptographic signature generation failed.");
  }
}

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
    throw new Error(data.error || "Cryptographic verification failed on server.");
  }

  if (data.token) {
    localStorage.setItem("blockwarranty_token", data.token);
    localStorage.setItem("blockwarranty_user", JSON.stringify(data.user));
  }

  return data;
}

/**
 * Full authentication flow: Nonce → Sign → Verify → JWT
 */
export async function authenticateWallet({ walletAddress, walletType, onStatus, userInfo = {} }) {
  if (onStatus) onStatus("signing");

  const { message } = await requestAuthNonce(walletAddress);
  const signature = await signMessage(walletAddress, message);

  if (onStatus) onStatus("verifying");

  const verifyResult = await verifySignatureWithBackend(walletAddress, message, signature, userInfo);

  return {
    authenticated: true,
    token: verifyResult.token,
    user: verifyResult.user,
    isNewUser: verifyResult.isNewUser,
  };
}

// ─────────────────────────────────────────────
// PROVIDER ACCESS
// ─────────────────────────────────────────────

export function getActiveProvider() {
  return _activeProvider;
}

export function setActiveProvider(provider, type = null) {
  _activeProvider = provider;
  _activeWalletType = type;
}

export async function sendWalletTransaction(transaction, expectedChainId) {
  if (!_activeProvider) throw new Error('Your wallet session is not connected. Sign in again, then retry.');
  const provider = new ethers.BrowserProvider(_activeProvider);
  const targetChainId = Number(expectedChainId);
  let network = await provider.getNetwork();
  if (Number(network.chainId) !== targetChainId) {
    const chainHex = `0x${targetChainId.toString(16)}`;
    try {
      await _activeProvider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainHex }] });
    } catch (error) {
      if (error.code !== 4902) throw error;
      await _activeProvider.request({ method: 'wallet_addEthereumChain', params: [{
        chainId: chainHex,
        chainName: 'BlockWarranty Demo Chain',
        rpcUrls: [WEB3AUTH_RPC_URL],
        nativeCurrency: { name: 'Demo Ether', symbol: 'ETH', decimals: 18 },
      }] });
    }
    network = await provider.getNetwork();
    if (Number(network.chainId) !== targetChainId) throw new Error('Switch your wallet to the BlockWarranty demo network and retry.');
  }
  const signer = await provider.getSigner();
  const response = await signer.sendTransaction({ to: transaction.to, data: transaction.data });
  return response.hash;
}
