import { useMemo, useState } from "react";
import { AuthFlowContext } from "./AuthFlowContext";

export function AuthFlowProvider({ children }) {
  const [walletState, setWalletState] = useState({
    walletAddress: "",
    walletConnected: false,
    walletCreated: false,
    recoveryPhrase: [],
    authenticationStatus: "ready",
  });

  const value = useMemo(
    () => ({
      ...walletState,
      setWallet: ({ walletAddress, recoveryPhrase = [], walletCreated = false }) => {
        setWalletState((previous) => ({
          ...previous,
          walletAddress,
          recoveryPhrase,
          walletCreated,
          walletConnected: walletCreated ? false : Boolean(walletAddress),
          authenticationStatus: "ready",
        }));
      },
      setAuthenticationStatus: (authenticationStatus) => {
        setWalletState((previous) => ({ ...previous, authenticationStatus }));
      },
    }),
    [walletState],
  );

  return (
    <AuthFlowContext.Provider value={value}>
      {children}
    </AuthFlowContext.Provider>
  );
}
