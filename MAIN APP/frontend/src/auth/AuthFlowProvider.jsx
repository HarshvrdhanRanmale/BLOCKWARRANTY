import { useMemo } from "react";
import { AuthFlowContext } from "./AuthFlowContext";
import { useWallet } from "../blockchain/useWallet";

/**
 * AuthFlowProvider — delegates to the authoritative WalletProvider
 * so all existing components seamlessly access MetaMask wallet identity
 * and signature-based backend session tokens.
 */
export function AuthFlowProvider({ children }) {
  const wallet = useWallet();

  const value = useMemo(
    () => ({
      walletAddress: wallet.walletAddress,
      walletConnected: wallet.isConnected,
      chainId: wallet.chainId,
      isCorrectNetwork: wallet.isCorrectNetwork,
      walletType: "metamask",
      walletCreated: false,
      authenticationStatus: wallet.authenticationStatus,
      setAuthenticationStatus: wallet.setAuthenticationStatus,
      token: wallet.token,
      user: wallet.user,
      userInfo: wallet.user ? { name: wallet.user.name, email: wallet.user.email } : null,
      signer: wallet.signer,
      provider: wallet.provider,
      connectWallet: wallet.connectWallet,
      switchToSepolia: wallet.switchToSepolia,
      setWallet: () => {},
      setAuthenticatedUser: (token, user) => {
        if (token) localStorage.setItem("blockwarranty_token", token);
        if (user) localStorage.setItem("blockwarranty_user", JSON.stringify(user));
      },
      updateProfile: wallet.updateProfile,
      logout: wallet.logout,
    }),
    [wallet]
  );

  return (
    <AuthFlowContext.Provider value={value}>
      {children}
    </AuthFlowContext.Provider>
  );
}

export default AuthFlowProvider;
