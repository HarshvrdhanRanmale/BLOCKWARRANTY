import { ArrowLeft, ArrowRight, Check, LoaderCircle, ShieldCheck, WalletCards } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import { useAuthFlow } from "../auth/useAuthFlow";
import { connectWithGoogle, getWalletDiagnostics } from "../auth/walletService";

const googleConfigured = getWalletDiagnostics().clientIdConfigured;

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5h6.6c3.9-3.6 6.1-8.8 6.1-14.9Z" />
      <path fill="#34A853" d="M24 44c5.5 0 10.2-1.8 13.5-4.9l-6.6-5c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.2A20 20 0 0 0 24 44Z" />
      <path fill="#FBBC05" d="M12.6 27.7a12 12 0 0 1 0-7.4v-5.2H5.8a20 20 0 0 0 0 17.8l6.8-5.2Z" />
      <path fill="#EA4335" d="M24 11.9c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 5.9 29.5 4 24 4A20 20 0 0 0 5.8 15.1l6.8 5.2c1.6-4.8 6.1-8.4 11.4-8.4Z" />
    </svg>
  );
}

function GoogleAccountAccess() {
  const navigate = useNavigate();
  const { setWallet } = useAuthFlow();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleGoogle = async () => {
    if (loading || !googleConfigured) return;
    setLoading(true);
    setError("");

    try {
      const result = await connectWithGoogle();
      setWallet({
        walletAddress: result.walletAddress,
        walletType: "embedded",
        walletCreated: false,
        userInfo: result.userInfo,
      });
      navigate("/authenticate");
    } catch (err) {
      const message = err.message || "We couldn’t connect your Google account. Please try again.";
      setError(
        /popup.*closed|closed.*popup|cancelled|canceled/i.test(message)
          ? "Google sign-in was closed before it finished. Please try again and keep the sign-in window open."
          : message
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="SECURE ACCOUNT ACCESS"
      title="Your warranty account, one sign-in away."
      description="Create an account or return to yours with Google. BlockWarranty will restore the wallet linked to your Google account, or create one automatically the first time."
    >
      <div className="space-y-6">
        <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-slate-50 p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm ring-1 ring-blue-100">
              <WalletCards size={23} />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">Your wallet stays with your account</h2>
              <p className="mt-1.5 text-sm leading-6 text-slate-600">
                Sign in with the same Google account any time. Your wallet address is saved to your BlockWarranty profile so your products stay connected.
              </p>
            </div>
          </div>
          <ul className="mt-5 grid gap-3 border-t border-blue-100 pt-4 text-sm text-slate-700 sm:grid-cols-2">
            <li className="flex items-center gap-2"><Check size={16} className="shrink-0 text-emerald-600" /> No separate wallet setup</li>
            <li className="flex items-center gap-2"><Check size={16} className="shrink-0 text-emerald-600" /> Same wallet on each sign-in</li>
          </ul>
        </div>

        {!googleConfigured && (
          <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            Google sign-in isn’t configured for this app yet. Add a Web3Auth client ID to the frontend environment to enable it.
          </div>
        )}

        <button
          type="button"
          id="btn-google-account-access"
          className="inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-[#2563EB] px-5 text-base font-bold text-white shadow-[0_8px_18px_rgba(37,99,235,0.2)] transition hover:bg-[#1D4ED8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB] disabled:cursor-not-allowed disabled:opacity-60"
          onClick={handleGoogle}
          disabled={loading || !googleConfigured}
        >
          {loading ? (
            <>
              <LoaderCircle size={20} className="animate-spin" />
              Connecting securely…
            </>
          ) : (
            <>
              <GoogleIcon />
              Continue with Google
              <ArrowRight size={18} />
            </>
          )}
        </button>

        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">
            {error}
          </p>
        )}

        <div className="flex items-start gap-3 border-t border-slate-100 pt-5">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-blue-700" />
          <p className="text-xs leading-5 text-slate-500">
            Google verifies your account. Web3Auth securely restores or creates its embedded wallet; BlockWarranty stores your wallet address, never your private key.
          </p>
        </div>

        <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-blue-700">
          <ArrowLeft size={16} /> Back to home
        </Link>
      </div>
    </AuthShell>
  );
}

export default GoogleAccountAccess;
