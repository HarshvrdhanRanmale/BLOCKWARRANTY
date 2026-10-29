import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Info,
  LoaderCircle,
  ShieldCheck,
  LockKeyhole,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import WalletAddress from "../components/WalletAddress";
import { useWallet } from "../blockchain/useWallet";

const buttonClass =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-5 text-sm font-bold text-white transition hover:bg-[#1D4ED8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB] disabled:cursor-not-allowed disabled:opacity-50";

let googleIdentityScriptPromise;

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!googleIdentityScriptPromise) {
    googleIdentityScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => (window.google?.accounts?.id
        ? resolve()
        : reject(new Error("Google sign-in could not be initialized.")));
      script.onerror = () => reject(new Error("Google sign-in could not be loaded. Check your connection and try again."));
      document.head.appendChild(script);
    });
  }
  return googleIdentityScriptPromise;
}

export default function Authenticate() {
  const navigate = useNavigate();
  const {
    walletAddress,
    isConnected,
    isCorrectNetwork,
    switchToSepolia,
    signer,
    user,
    authenticationStatus,
    setAuthenticationStatus,
    authenticateWithBackend,
    linkGoogleProfile,
  } = useWallet();

  const [error, setError] = useState("");
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const googleButtonRef = useRef(null);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

  const handleGoogleSuccess = useCallback(async (response) => {
    if (!response?.credential) {
      setError("Google did not return a sign-in credential. Please try again.");
      return;
    }

    setSavingProfile(true);
    setError("");
    try {
      await linkGoogleProfile(response.credential);
      setShowProfileSetup(false);
      setAuthenticationStatus("success");
      navigate("/products", { replace: true });
    } catch (err) {
      setError(err.message || "Failed to link Google with your wallet profile.");
    } finally {
      setSavingProfile(false);
    }
  }, [linkGoogleProfile, navigate, setAuthenticationStatus]);

  useEffect(() => {
    if (!showProfileSetup || !googleClientId) return undefined;
    let cancelled = false;

    loadGoogleIdentityScript()
      .then(() => {
        if (cancelled || !googleButtonRef.current) return;
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGoogleSuccess,
          auto_select: false,
          ux_mode: "popup",
        });
        googleButtonRef.current.replaceChildren();
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: "outline",
          size: "large",
          type: "standard",
          shape: "pill",
          text: "signin_with",
          logo_alignment: "left",
          width: Math.min(360, googleButtonRef.current.clientWidth || 360),
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Google sign-in could not be loaded.");
      });

    return () => { cancelled = true; };
  }, [showProfileSetup, googleClientId, handleGoogleSuccess]);
  useEffect(() => {
    if (authenticationStatus === "success" && !showProfileSetup) {
      const destination = user?.role === "supplier" ? "/supplier/dashboard" : "/products";
      const timer = window.setTimeout(() => navigate(destination, { replace: true }), 1000);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [authenticationStatus, showProfileSetup, user, navigate]);

  if (!isConnected || !walletAddress) {
    return <Navigate to="/connect-wallet" replace />;
  }

  const handleAuthenticate = async () => {
    if (["signing", "verifying"].includes(authenticationStatus)) return;
    setError("");

    try {
      if (!isCorrectNetwork) {
        await switchToSepolia();
      }
      const result = await authenticateWithBackend(signer);

      if (result.user?.role === "supplier") {
        setAuthenticationStatus("success");
        navigate("/supplier/dashboard", { replace: true });
        return;
      }

      if (result.user?.googleLinked) {
        setAuthenticationStatus("success");
      } else {
        setShowProfileSetup(true);
      }
    } catch (err) {
      setError(err.message || "Something went wrong while verifying your wallet.");
    }
  };

  const busy = ["signing", "verifying"].includes(authenticationStatus);

  return (
    <AuthShell
      step={2}
      eyebrow={showProfileSetup ? "Profile setup" : "Secure sign-in"}
      title={showProfileSetup ? "Connect your Google account" : "Confirm your account"}
      description={
        showProfileSetup
          ? "Use Google to securely add your name and email. Your wallet remains the account identity."
          : "Sign a gas-free security challenge with MetaMask to verify your wallet ownership."
      }
    >
      {showProfileSetup ? (
        <div className="space-y-5">
          <WalletAddress address={walletAddress} compact />

          <section className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-white text-center shadow-sm transition-all duration-200 hover:border-slate-300 hover:shadow-md">
            <div className="px-6 py-7">
              {/* Icon with theme color */}
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#2563EB] text-white shadow-sm">
                <LockKeyhole size={24} strokeWidth={2} />
              </div>

              <h3 className="mt-5 text-base font-extrabold text-slate-900">One secure step left</h3>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
                Connect a verified Google account to add your profile name and email. No profile details are entered manually.
              </p>

              {googleClientId ? (
                <div className="mt-6">
                  {/* Divider */}
                  <div className="mb-5 flex items-center gap-3">
                    <div className="h-px flex-1 bg-slate-100" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">sign in with</span>
                    <div className="h-px flex-1 bg-slate-100" />
                  </div>
                  {/* Pill button */}
                  <div className="flex justify-center">
                    <div ref={googleButtonRef} />
                  </div>
                </div>
              ) : (
                <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-left text-xs leading-5 text-amber-900">
                  Google sign-in is not configured. Set the Google client ID in the frontend and backend environment, then restart both servers.
                </p>
              )}
            </div>
          </section>

          {error && (
            <p role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium leading-5 text-red-700">
              {error}
            </p>
          )}

          {savingProfile && (
            <p className="flex items-center justify-center gap-2 text-sm font-semibold text-[#2563EB]" role="status">
              <LoaderCircle size={17} className="animate-spin" /> Verifying Google account...
            </p>
          )}
          <p className="text-center text-xs text-slate-500">Your wallet stays in control of product ownership and account access.</p>
        </div>
      ) : authenticationStatus === "success" ? (
        <div className="py-5 text-center" role="status">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50 text-green-700">
            <CheckCircle2 size={30} />
          </span>
          <h3 className="mt-4 text-xl font-extrabold">
            {user?.name ? `Welcome back, ${user.name}!` : "Account confirmed"}
          </h3>
          <p className="mt-2 text-sm text-[#64748B]">
            Welcome to BlockWarranty. Taking you to your products...
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
                className={`flex items-center gap-2 text-sm ${authenticationStatus === "signing"
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
                className={`flex items-center gap-2 text-sm ${authenticationStatus === "verifying"
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

      <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-100 pt-4 text-xs">
        <Link
          to="/connect-wallet"
          className="inline-flex items-center gap-1.5 font-semibold text-[#64748B] hover:text-[#2563EB]"
        >
          <ArrowLeft size={15} /> Back to wallet connection
        </Link>
        <Link
          to="/supplier/register"
          className="font-bold text-blue-600 hover:text-blue-800 transition"
        >
          Brand or Supplier? Register here →
        </Link>
      </div>
    </AuthShell>
  );
}
