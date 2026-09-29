import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  LoaderCircle,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import WalletAddress from "../components/WalletAddress";
import { useAuthFlow } from "../auth/useAuthFlow";
import { connectWallet as mockConnectWallet } from "../auth/mockAuth";

const buttonClass =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-5 text-sm font-bold text-white transition hover:bg-[#1D4ED8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB] disabled:cursor-not-allowed disabled:opacity-50";

export default function ConnectWallet() {
  const navigate = useNavigate();
  const { walletAddress, walletConnected, setWallet } = useAuthFlow();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  const handleConnect = async () => {
    if (connecting) return;
    setConnecting(true);
    setError("");
    try {
      const address = await mockConnectWallet();
      setWallet({ walletAddress: address, walletCreated: false });
      navigate("/authenticate");
    } catch {
      setError("Wallet connection failed. Please try again.");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <AuthShell
      step={1}
      eyebrow="Wallet access"
      title="Connect Your Wallet"
      description="Connect your wallet to securely access your BlockWarranty account."
    >
      {walletConnected ? (
        <div>
          <div className="mb-5 flex items-center gap-3 text-sm font-bold text-green-700">
            <CheckCircle2 size={20} />
            Wallet Connected
          </div>
          <WalletAddress address={walletAddress} compact />
          <button type="button" className={`${buttonClass} mt-5 w-full`} onClick={() => navigate("/authenticate")}>
            Continue to verification
            <ArrowRight size={17} />
          </button>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-200 p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#E0EFFF] text-[#2563EB]">
                <Wallet size={23} />
              </span>
              <div className="flex-1">
                <h3 className="font-bold">MetaMask</h3>
                <p className="mt-1 text-sm leading-5 text-[#64748B]">
                  Connect using your MetaMask wallet.
                </p>
              </div>
            </div>
            <button type="button" className={`${buttonClass} mt-5 w-full`} onClick={handleConnect} disabled={connecting}>
              {connecting ? (
                <>
                  <LoaderCircle size={18} className="animate-spin" />
                  Connecting wallet...
                </>
              ) : (
                <>
                  <Wallet size={18} />
                  Connect MetaMask
                </>
              )}
            </button>
          </div>
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-[#F8FAFC] p-4 text-sm">
            <span className="font-semibold text-[#64748B]">Other Wallet</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-[#64748B]">
              Coming soon
            </span>
          </div>
          {error && <p role="alert" className="mt-4 text-sm font-medium text-red-600">{error}</p>}
        </>
      )}
      <Link to="/register" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#64748B] hover:text-[#2563EB]">
        <ArrowLeft size={16} />
        Create a new wallet
      </Link>
    </AuthShell>
  );
}
