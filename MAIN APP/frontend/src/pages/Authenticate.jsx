import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Info,
  LoaderCircle,
  ShieldCheck,
  User,
  Mail,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import WalletAddress from "../components/WalletAddress";
import { useWallet } from "../blockchain/useWallet";

const buttonClass =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-5 text-sm font-bold text-white transition hover:bg-[#1D4ED8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB] disabled:cursor-not-allowed disabled:opacity-50";

export default function Authenticate() {
  const navigate = useNavigate();
  const {
    walletAddress,
    isConnected,
    isCorrectNetwork,
    switchToSepolia,
    signer,
    user,
    token,
    authenticationStatus,
    setAuthenticationStatus,
    authenticateWithBackend,
    updateProfile,
  } = useWallet();

  const [error, setError] = useState("");
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (authenticationStatus === "success" && !showProfileSetup && started.current) {
      const timer = window.setTimeout(() => navigate("/dashboard", { replace: true }), 1000);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [authenticationStatus, showProfileSetup, navigate]);

  if (!isConnected || !walletAddress) {
    return <Navigate to="/connect-wallet" replace />;
  }

  const handleAuthenticate = async () => {
    if (["signing", "verifying"].includes(authenticationStatus)) return;
    started.current = true;
    setError("");

    try {
      if (!isCorrectNetwork) {
        await switchToSepolia();
      }
      const result = await authenticateWithBackend(signer);

      if (result.user?.profileComplete || result.user?.name) {
        setAuthenticationStatus("success");
      } else {
        setShowProfileSetup(true);
      }
    } catch (err) {
      setError(err.message || "Something went wrong while verifying your wallet.");
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!profileName.trim()) {
      setError("Please enter your name to complete your profile.");
      return;
    }

    setSavingProfile(true);
    setError("");

    try {
      await updateProfile(profileName.trim(), profileEmail.trim());
      setShowProfileSetup(false);
      setAuthenticationStatus("success");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Failed to save profile. Please try again.");
    } finally {
      setSavingProfile(false);
    }
  };

  const busy = ["signing", "verifying"].includes(authenticationStatus);

  return (
    <AuthShell
      step={2}
      eyebrow={showProfileSetup ? "Profile setup" : "Secure sign-in"}
      title={showProfileSetup ? "Complete Your Profile" : "Confirm your account"}
      description={
        showProfileSetup
          ? "Set up your personal display profile for your BlockWarranty account."
          : "Sign a gas-free security challenge with MetaMask to verify your wallet ownership."
      }
    >
      {showProfileSetup ? (
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <WalletAddress address={walletAddress} compact />

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#64748B] mb-1.5">
              Full Name
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-[#94A3B8]">
                <User size={18} />
              </span>
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="e.g. Harsh"
                required
                className="w-full rounded-xl border border-slate-200 bg-[#F8FAFC] py-3 pl-10 pr-4 text-sm font-semibold text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#64748B] mb-1.5">
              Email Address <span className="text-[#94A3B8] font-normal lowercase">(optional)</span>
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-[#94A3B8]">
                <Mail size={18} />
              </span>
              <input
                type="email"
                value={profileEmail}
                onChange={(e) => setProfileEmail(e.target.value)}
                placeholder="e.g. user@example.com"
                className="w-full rounded-xl border border-slate-200 bg-[#F8FAFC] py-3 pl-10 pr-4 text-sm font-semibold text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm font-medium text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            className={`${buttonClass} w-full mt-2`}
            disabled={savingProfile}
          >
            {savingProfile ? (
              <>
                <LoaderCircle size={18} className="animate-spin" />
                Saving profile...
              </>
            ) : (
              <>
                Save &amp; Enter Dashboard
                <ArrowRight size={17} />
              </>
            )}
          </button>
        </form>
      ) : authenticationStatus === "success" ? (
        <div className="py-5 text-center" role="status">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50 text-green-700">
            <CheckCircle2 size={30} />
          </span>
          <h3 className="mt-4 text-xl font-extrabold">
            {user?.name ? `Welcome back, ${user.name}!` : "Account confirmed"}
          </h3>
          <p className="mt-2 text-sm text-[#64748B]">
            Welcome to BlockWarranty. Taking you to your dashboard...
          </p>
        </div>
      ) : authenticationStatus === "error" ? (
        <div className="text-center">
          <p className="font-bold text-red-700">Authentication failed</p>
          <p className="mt-2 text-sm text-[#64748B]">{error}</p>
          <button type="button" className={`${buttonClass} mt-5 w-full`} onClick={handleAuthenticate}>
            Try Again
          </button>
          <button
            type="button"
            className="mt-3 min-h-11 w-full rounded-xl border border-slate-200 text-sm font-semibold hover:bg-slate-50"
            onClick={() => navigate("/connect-wallet")}
          >
            Back to Wallet Connection
          </button>
        </div>
      ) : (
        <>
          <WalletAddress address={walletAddress} compact />
          <div className="mt-5 rounded-2xl border border-[#BFDBFE] bg-[#E0EFFF]/40 p-5">
            <div className="flex items-center gap-2 font-bold">
              <ShieldCheck size={19} className="text-[#2563EB]" />
              Gas-free MetaMask signature
            </div>
            <p className="mt-3 text-sm leading-6 text-[#334155]">
              Confirm this wallet to finish signing in. This signature verifies your wallet identity cryptographically and creates your private session.
            </p>
            <p className="mt-2 text-xs font-medium text-[#64748B]">
              This signature does not cost any gas.
            </p>
          </div>

          {busy && (
            <div
              className="mt-5 space-y-3 rounded-2xl border border-slate-200 p-4"
              role="status"
              aria-live="polite"
            >
              <p
                className={`flex items-center gap-2 text-sm ${
                  authenticationStatus === "signing"
                    ? "font-bold text-[#2563EB]"
                    : "text-[#64748B]"
                }`}
              >
                {authenticationStatus === "signing" ? (
                  <LoaderCircle size={17} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={17} />
                )}
                {authenticationStatus === "signing"
                  ? "Waiting for MetaMask signature..."
                  : "Wallet signature received"}
              </p>
              <p
                className={`flex items-center gap-2 text-sm ${
                  authenticationStatus === "verifying"
                    ? "font-bold text-[#2563EB]"
                    : "text-[#64748B]"
                }`}
              >
                {authenticationStatus === "verifying" ? (
                  <LoaderCircle size={17} className="animate-spin" />
                ) : (
                  <Info size={17} />
                )}
                {authenticationStatus === "verifying" ? "Verifying signature with server..." : "Ready to verify"}
              </p>
            </div>
          )}

          <button
            type="button"
            className={`${buttonClass} mt-5 w-full`}
            onClick={handleAuthenticate}
            disabled={busy}
          >
            {busy ? (
              <>
                <LoaderCircle size={18} className="animate-spin" />
                {authenticationStatus === "signing"
                  ? "Waiting for signature..."
                  : "Verifying signature with server..."}
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

      <Link
        to="/connect-wallet"
        className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#64748B] hover:text-[#2563EB]"
      >
        <ArrowLeft size={16} />
        Back to wallet connection
      </Link>
    </AuthShell>
  );
}
