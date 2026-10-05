import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { BrowserProvider } from "ethers";
import { CHAIN_ID, CHAIN_HEX, CHAIN_NAME, SEPOLIA_RPC_URL } from "./contractConfig";

export const WalletContext = createContext(null);

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export function WalletProvider({ children }) {
  const [walletAddress, setWalletAddress] = useState("");
  const [chainId, setChainId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState("");
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [token, setToken] = useState(() => (typeof window !== "undefined" ? localStorage.getItem("blockwarranty_token") : null));
  const [user, setUser] = useState(() => {
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem("blockwarranty_user") : null;
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [authenticationStatus, setAuthenticationStatus] = useState(token ? "success" : "ready");

  const isCorrectNetwork = chainId === CHAIN_ID;
  const isConnected = Boolean(walletAddress);

  // Update provider & signer whenever an account is connected
  const updateProviderAndSigner = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) return null;
    try {
      const browserProvider = new BrowserProvider(window.ethereum);
      setProvider(browserProvider);
      const network = await browserProvider.getNetwork();
      const currentChainId = Number(network.chainId);
      setChainId(currentChainId);

      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      if (accounts && accounts.length > 0) {
        const currentSigner = await browserProvider.getSigner();
        const address = await currentSigner.getAddress();
        setWalletAddress(address);
        setSigner(currentSigner);
        return { browserProvider, currentSigner, address, currentChainId };
      }
      return { browserProvider, currentSigner: null, address: "", currentChainId };
    } catch (err) {
      console.warn("Error updating provider:", err);
      return null;
    }
  }, []);

  // Check initial connection silently without triggering a prompt
  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;
    updateProviderAndSigner();
  }, [updateProviderAndSigner]);

  // Validate existing backend session on load
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.user) {
          setUser(data.user);
          setAuthenticationStatus("success");
          localStorage.setItem("blockwarranty_user", JSON.stringify(data.user));
        } else {
          // Invalidate expired token
          localStorage.removeItem("blockwarranty_token");
          localStorage.removeItem("blockwarranty_user");
          setToken(null);
          setUser(null);
          setAuthenticationStatus("ready");
        }
      })
      .catch(() => {
        // Backend temporarily down: retain cached state
      });
  }, [token]);

  // Listen for accountsChanged and chainChanged
  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;

    const handleAccountsChanged = async (accounts) => {
      if (!accounts || accounts.length === 0) {
        setWalletAddress("");
        setSigner(null);
        setToken(null);
        setUser(null);
        setAuthenticationStatus("ready");
        localStorage.removeItem("blockwarranty_token");
        localStorage.removeItem("blockwarranty_user");
      } else {
        const newAddress = accounts[0];
        setWalletAddress(newAddress);
        // If address changed from cached user, invalidate session
        if (user?.walletAddress && user.walletAddress.toLowerCase() !== newAddress.toLowerCase()) {
          setToken(null);
          setUser(null);
          setAuthenticationStatus("ready");
          localStorage.removeItem("blockwarranty_token");
          localStorage.removeItem("blockwarranty_user");
        }
        await updateProviderAndSigner();
      }
    };

    const handleChainChanged = async (hexChainId) => {
      const numericChainId = parseInt(hexChainId, 16);
      setChainId(numericChainId);
      await updateProviderAndSigner();
    };

    window.ethereum.on?.("accountsChanged", handleAccountsChanged);
    window.ethereum.on?.("chainChanged", handleChainChanged);

    return () => {
      window.ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [user, updateProviderAndSigner]);

  // Connect wallet on explicit user click
  const connectWallet = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      throw new Error("MetaMask is not installed. Please install MetaMask to continue.");
    }
    setIsConnecting(true);
    setError("");

    try {
      const browserProvider = new BrowserProvider(window.ethereum);
      setProvider(browserProvider);

      // Request accounts on click
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const currentSigner = await browserProvider.getSigner();
      const address = await currentSigner.getAddress();
      const network = await browserProvider.getNetwork();
      const currentChainId = Number(network.chainId);

      setWalletAddress(address);
      setSigner(currentSigner);
      setChainId(currentChainId);

      return { address, chainId: currentChainId, signer: currentSigner, provider: browserProvider };
    } catch (err) {
      const msg = err.message || "Failed to connect MetaMask.";
      setError(msg);
      throw err;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  // Switch to Sepolia testnet
  const switchToSepolia = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      throw new Error("MetaMask is not installed.");
    }
    setError("");

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_HEX }],
      });
      await updateProviderAndSigner();
    } catch (switchError) {
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: CHAIN_HEX,
              chainName: CHAIN_NAME,
              nativeCurrency: { name: "Sepolia Ether", symbol: "SEP", decimals: 18 },
              rpcUrls: [SEPOLIA_RPC_URL],
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
            },
          ],
        });
        await updateProviderAndSigner();
      } else {
        throw new Error(switchError.message || "Failed to switch network to Sepolia.");
      }
    }
  }, [updateProviderAndSigner]);

  // EIP-191 Personal Sign Authentication with Backend
  const authenticateWithBackend = useCallback(async (activeSigner = signer) => {
    const s = activeSigner || signer;
    if (!s) throw new Error("Please connect your wallet first.");
    const address = walletAddress || (await s.getAddress());

    setAuthenticationStatus("signing");
    setError("");

    try {
      // 1. Get nonce / challenge
      const nonceRes = await fetch(`${API_BASE_URL}/api/auth/nonce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      });
      const nonceData = await nonceRes.json();
      if (!nonceRes.ok || !nonceData.success) {
        throw new Error(nonceData.error || "Failed to request authentication challenge.");
      }

      // 2. Sign message in MetaMask (gas-free)
      const signature = await s.signMessage(nonceData.message);

      setAuthenticationStatus("verifying");

      // 3. Verify signature on backend
      const verifyRes = await fetch(`${API_BASE_URL}/api/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          message: nonceData.message,
          signature,
        }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.success) {
        throw new Error(verifyData.error || "Wallet signature verification failed.");
      }

      // 4. Save session
      setToken(verifyData.token);
      setUser(verifyData.user);
      setAuthenticationStatus("success");
      localStorage.setItem("blockwarranty_token", verifyData.token);
      localStorage.setItem("blockwarranty_user", JSON.stringify(verifyData.user));

      return { token: verifyData.token, user: verifyData.user, isNewUser: verifyData.isNewUser };
    } catch (err) {
      setAuthenticationStatus("error");
      setError(err.message || "Authentication failed.");
      throw err;
    }
  }, [signer, walletAddress]);

  const updateProfile = useCallback(async (name, email) => {
    const currentToken = token || localStorage.getItem("blockwarranty_token");
    if (!currentToken) throw new Error("Not authenticated");

    const res = await fetch(`${API_BASE_URL}/api/auth/profile`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentToken}`,
      },
      body: JSON.stringify({ name, email }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Failed to update profile.");
    }

    setUser(data.user);
    localStorage.setItem("blockwarranty_user", JSON.stringify(data.user));
    return data.user;
  }, [token]);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setAuthenticationStatus("ready");
    localStorage.removeItem("blockwarranty_token");
    localStorage.removeItem("blockwarranty_user");
  }, []);

  const value = useMemo(
    () => ({
      walletAddress,
      chainId,
      isCorrectNetwork,
      isConnected,
      isConnecting,
      error,
      provider,
      signer,
      token,
      user,
      authenticationStatus,
      connectWallet,
      switchToSepolia,
      authenticateWithBackend,
      updateProfile,
      logout,
      setAuthenticationStatus,
    }),
    [
      walletAddress,
      chainId,
      isCorrectNetwork,
      isConnected,
      isConnecting,
      error,
      provider,
      signer,
      token,
      user,
      authenticationStatus,
      connectWallet,
      switchToSepolia,
      authenticateWithBackend,
      updateProfile,
      logout,
    ]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export default WalletProvider;
