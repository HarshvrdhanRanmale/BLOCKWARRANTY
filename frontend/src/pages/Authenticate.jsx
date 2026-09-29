import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Info,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import WalletAddress from "../components/WalletAddress";
import { useAuthFlow } from "../auth/useAuthFlow";
import { authenticateWallet } from "../auth/mockAuth";

const buttonClass =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-5 text-sm font-bold text-white transition hover:bg-[#1D4ED8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB] disabled:cursor-not-allowed disabled:opacity-50";

export default function Authenticate() {
  const navigate = useNavigate();
  const { walletAddress, walletConnected, authenticationStatus, setAuthenticationStatus } = useAuthFlow();
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (authenticationStatus !== "success" || !started.current) return undefined;
    const timer = window.setTimeout(() => navigate("/dashboard", { replace: true }), 1000);
    return () => window.clearTimeout(timer);
  }, [authenticationStatus, navigate]);

  if (!walletConnected || !walletAddress) {
    return <Navigate to="/connect-wallet" replace />;
  }

  const authenticate = async () => {
    if (["signing", "verifying"].includes(authenticationStatus)) return;
    started.current = true;
    setError("");
    setAuthenticationStatus("signing");
    try {
      const result = await authenticateWallet({ onStatus: setAuthenticationStatus });
      if (!result.authenticated) throw new Error("Wallet verification was unsuccessful.");
      setAuthenticationStatus("success");
    } catch {
      setError("Something went wrong while verifying your wallet.");
      setAuthenticationStatus("error");
    }
  };

  const busy = ["signing", "verifying"].includes(authenticationStatus);

  return (
    <AuthShell
      step={2}
      eyebrow="Wallet access"
      title="Verify Your Wallet"
      description="Sign a secure message to verify ownership of your wallet."
    >
      {authenticationStatus === "success" ? (
        <div className="py-5 text-center" role="status">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50 text-green-700">
            <CheckCircle2 size={30} />
          </span>
          <h3 className="mt-4 text-xl font-extrabold">Wallet Verified</h3>
          <p className="mt-2 text-sm text-[#64748B]">Welcome to BlockWarranty. Taking you to your dashboard...</p>
        </div>
      ) : authenticationStatus === "error" ? (
        <div className="text-center">
          <p className="font-bold text-red-700">Authentication failed</p>
          <p className="mt-2 text-sm text-[#64748B]">{error}</p>
          <button type="button" className={`${buttonClass} mt-5 w-full`} onClick={authenticate}>Try Again</button>
          <button type="button" className="mt-3 min-h-11 w-full rounded-xl border border-slate-200 text-sm font-semibold hover:bg-slate-50" onClick={() => navigate("/connect-wallet")}>
            Back to Connect Wallet
          </button>
        </div>
      ) : (
        <>
          <WalletAddress address={walletAddress} compact />
          <div className="mt-5 rounded-2xl border border-[#BFDBFE] bg-[#E0EFFF]/40 p-5">
            <div className="flex items-center gap-2 font-bold">
              <ShieldCheck size={19} className="text-[#2563EB]" />
              BlockWarranty Authentication
            </div>
            <p className="mt-3 text-sm leading-6 text-[#334155]">
              Sign this message to securely access your BlockWarranty account.
            </p>
            <p className="mt-2 text-xs font-medium text-[#64748B]">
              This signature does not cost any gas.
            </p>
          </div>
          {busy && (
            <div className="mt-5 space-y-3 rounded-2xl border border-slate-200 p-4" role="status" aria-live="polite">
              <p className={`flex items-center gap-2 text-sm ${authenticationStatus === "signing" ? "font-bold text-[#2563EB]" : "text-[#64748B]"}`}>
                {authenticationStatus === "signing" ? <LoaderCircle size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
                {authenticationStatus === "signing" ? "Waiting for wallet signature..." : "Wallet signature received"}
              </p>
              <p className={`flex items-center gap-2 text-sm ${authenticationStatus === "verifying" ? "font-bold text-[#2563EB]" : "text-[#64748B]"}`}>
                {authenticationStatus === "verifying" ? <LoaderCircle size={17} className="animate-spin" /> : <Info size={17} />}
                {authenticationStatus === "verifying" ? "Verifying wallet..." : "Ready to verify"}
              </p>
            </div>
          )}
          <button type="button" className={`${buttonClass} mt-5 w-full`} onClick={authenticate} disabled={busy}>
            {busy ? (
              <>
                <LoaderCircle size={18} className="animate-spin" />
                {authenticationStatus === "signing" ? "Preparing secure authentication..." : "Verifying wallet..."}
              </>
            ) : (
              <>
                Sign &amp; Continue
                <ArrowRight size={17} />
              </>
            )}
          </button>
        </>
      )}
      <Link to="/connect-wallet" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#64748B] hover:text-[#2563EB]">
        <ArrowLeft size={16} />
        Back to Connect Wallet
      </Link>
    </AuthShell>
  );
}
