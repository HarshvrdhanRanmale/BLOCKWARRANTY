import { ArrowLeft, ArrowRight, CheckCircle2, Globe, LoaderCircle, ShieldAlert, ShieldCheck, Wallet, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import WalletAddress from "../components/WalletAddress";
import { useWallet } from "../blockchain/useWallet";
import { CHAIN_NAME } from "../blockchain/contractConfig";

function MetaMaskFoxIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M29.07 3.32a1.08 1.08 0 0 0-1-.07L18.4 8.78l-3.23-7.51a1.08 1.08 0 0 0-1.84-.2L8.52 7.2 2.5 10.45a1.08 1.08 0 0 0-.58.82l-1.9 14.54a1.08 1.08 0 0 0 .5.98l14.4 9.1a1.08 1.08 0 0 0 1.16 0l14.4-9.1a1.08 1.08 0 0 0 .5-.98L29.08 11.27a1.08 1.08 0 0 0-.01-.79v.04l-3.69-7.2h3.69z" fill="#E17726"/>
      <path d="M10.87 14.65l-4.5-3.38 5.76-3.1 3.2 7.42-4.46-.94zm10.26 0l4.46-.94 3.2-7.42 5.76 3.1-4.5 3.38-8.92 1.88z" fill="#E27625"/>
      <path d="M5.53 23.35l-2.7-2.07 1.34-10.27 4.5 3.38-3.14 8.96zm20.94 0l-3.14-8.96 4.5-3.38 1.34 10.27-2.7 2.07z" fill="#D5BFB2"/>
      <path d="M10.3 22.84l-4.77.51 3.14-8.96 4.46.94-2.83 7.51zm11.4 0l-2.83-7.51 4.46-.94 3.14 8.96-4.77-.51z" fill="#233447"/>
      <path d="M16 27.27l-5.7-4.43 2.83-7.51 2.87 2.86 2.87-2.86 2.83 7.51-5.7 4.43z" fill="#CC6228"/>
    </svg>
  );
}

export default function ConnectWallet() {
  const navigate = useNavigate();
  const {
    walletAddress,
    chainId,
    isCorrectNetwork,
    isConnected,
    isConnecting,
    error,
    connectWallet,
    switchToSepolia,
    authenticateWithBackend,
    token,
  } = useWallet();

  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  const handleConnect = async () => {
    setLocalError("");
    setBusy(true);
    try {
      const res = await connectWallet();
      if (res && res.address) {
        if (res.chainId === 11155111) {
          // If already on Sepolia and has valid token, go to dashboard or authenticate
          if (token) {
            navigate("/dashboard");
          } else {
            navigate("/authenticate");
          }
        }
      }
    } catch (err) {
      setLocalError(err.message || "Failed to connect MetaMask.");
    } finally {
      setBusy(false);
    }
  };

  const handleSwitchNetwork = async () => {
    setLocalError("");
    setBusy(true);
    try {
      await switchToSepolia();
    } catch (err) {
      setLocalError(err.message || "Failed to switch network.");
    } finally {
      setBusy(false);
    }
  };

  const handleProceedToAuth = async () => {
    navigate("/authenticate");
  };

  return (
    <AuthShell
      eyebrow="BLOCKCHAIN WALLET ACCESS"
      title="Connect your MetaMask wallet"
      description="Connect your Ethereum wallet to verify product ownership, register warranties, and sign off on lifecycle events directly on Sepolia."
    >
      <div className="space-y-6">
        {/* Network & Contract Banner */}
        <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-slate-50 p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm ring-1 ring-blue-100">
              <Wallet size={23} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">Sepolia Smart Contract Authority</h2>
                <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
                  {CHAIN_NAME}
                </span>
              </div>
              <p className="mt-1.5 text-sm leading-6 text-slate-600">
                Product registration, ownership, and warranty lifecycle are verified directly on the Sepolia testnet.
              </p>
            </div>
          </div>
          <ul className="mt-5 grid gap-3 border-t border-blue-100 pt-4 text-sm text-slate-700 sm:grid-cols-2">
            <li className="flex items-center gap-2">
              <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
              MetaMask as primary identity
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
              Decentralized ownership authority
            </li>
          </ul>
        </div>

        {/* Connected state */}
        {isConnected ? (
          <div className="space-y-4">
            <WalletAddress address={walletAddress} compact />

            {/* Network check banner */}
            {!isCorrectNetwork ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <div className="flex items-start gap-3">
                  <ShieldAlert size={20} className="shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    <p className="font-semibold">Wrong Network Detected</p>
                    <p className="mt-1 text-xs text-amber-700">
                      You are connected to Chain ID {chainId || "Unknown"}. BlockWarranty operates on Sepolia (Chain ID 11155111).
                    </p>
                    <button
                      type="button"
                      onClick={handleSwitchNetwork}
                      disabled={busy}
                      className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-700 transition disabled:opacity-50"
                    >
                      {busy ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      Switch to Sepolia in MetaMask
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 size={18} className="text-emerald-600" />
                  <span className="font-semibold">Connected to Sepolia Testnet</span>
                </div>
              </div>
            )}

            {/* Button to proceed to signature auth or dashboard */}
            {isCorrectNetwork && (
              <button
                type="button"
                id="btn-proceed-auth"
                onClick={handleProceedToAuth}
                className="inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-[#2563EB] px-5 text-base font-bold text-white shadow-[0_8px_18px_rgba(37,99,235,0.2)] transition hover:bg-[#1D4ED8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
              >
                Continue with this Wallet
                <ArrowRight size={18} />
              </button>
            )}
          </div>
        ) : (
          /* Disconnected state */
          <div className="space-y-4">
            <button
              type="button"
              id="btn-connect-metamask"
              className="inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-[#2563EB] px-5 text-base font-bold text-white shadow-[0_8px_18px_rgba(37,99,235,0.2)] transition hover:bg-[#1D4ED8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB] disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleConnect}
              disabled={busy || isConnecting}
            >
              {busy || isConnecting ? (
                <>
                  <LoaderCircle size={20} className="animate-spin" />
                  Connecting MetaMask…
                </>
              ) : (
                <>
                  <MetaMaskFoxIcon />
                  Connect MetaMask
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        )}

        {/* Error message */}
        {(localError || error) && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">
            {localError || error}
          </p>
        )}

        <div className="flex items-start gap-3 border-t border-slate-100 pt-5">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-blue-700" />
          <p className="text-xs leading-5 text-slate-500">
            MetaMask holds your private keys locally. BlockWarranty requests standard transaction signatures only and never accesses your private key.
          </p>
        </div>

        <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-blue-700">
          <ArrowLeft size={16} /> Back to home
        </Link>
      </div>
    </AuthShell>
  );
}
