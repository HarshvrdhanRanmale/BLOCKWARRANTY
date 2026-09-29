import {
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  Download,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import WalletAddress from "../components/WalletAddress";
import { useAuthFlow } from "../auth/useAuthFlow";
import { createWallet } from "../auth/mockAuth";

const buttonClass =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-5 text-sm font-bold text-white transition hover:bg-[#1D4ED8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB] disabled:cursor-not-allowed disabled:opacity-50";

export default function Register() {
  const navigate = useNavigate();
  const { setWallet } = useAuthFlow();
  const [creating, setCreating] = useState(false);
  const [wallet, setCreatedWallet] = useState(null);
  const [confirmedSaved, setConfirmedSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const handleCreateWallet = async () => {
    if (creating) return;
    setCreating(true);
    setError("");
    try {
      const result = await createWallet();
      setCreatedWallet(result);
      setWallet({
        walletAddress: result.address,
        recoveryPhrase: result.recoveryPhrase,
        walletCreated: true,
      });
    } catch {
      setError("Wallet setup could not be completed. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const copyPhrase = async () => {
    try {
      await navigator.clipboard.writeText(wallet.recoveryPhrase.join(" "));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Clipboard access was blocked. Please select and copy the phrase manually.");
    }
  };

  const downloadBackup = () => {
    const content = [
      "BlockWarranty mock wallet backup",
      "For UI demonstration only - this is not a real wallet or recovery phrase.",
      `Wallet address: ${wallet.address}`,
      `Mock recovery phrase: ${wallet.recoveryPhrase.join(" ")}`,
    ].join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "blockwarranty-mock-wallet-backup.txt";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <AuthShell
      step={0}
      eyebrow={wallet ? "Wallet setup · Recovery phrase" : "New user · Wallet setup"}
      title={wallet ? "Secure Your Recovery Phrase" : "Create Your Wallet"}
      description={
        wallet
          ? "This mock phrase is for the prototype UI only. Never use it to secure real assets."
          : "Create a secure wallet to manage your products, warranties, and ownership."
      }
    >
      {!wallet ? (
        <div>
          <div className="mb-6 flex gap-4 rounded-2xl border border-[#BFDBFE] bg-[#E0EFFF]/50 p-4">
            <ShieldCheck className="mt-0.5 shrink-0 text-[#2563EB]" size={21} />
            <p className="text-sm leading-6 text-[#334155]">
              Your wallet will be the key to your BlockWarranty account. This
              demo simulates creation and does not generate or store a real key.
            </p>
          </div>
          <button type="button" className={`${buttonClass} w-full`} onClick={handleCreateWallet} disabled={creating}>
            {creating ? (
              <>
                <LoaderCircle size={18} className="animate-spin" />
                Creating your secure wallet...
              </>
            ) : (
              <>
                <KeyRound size={18} />
                Create Wallet
                <ArrowRight size={17} />
              </>
            )}
          </button>
          {error && <p role="alert" className="mt-4 text-sm font-medium text-red-600">{error}</p>}
          <p className="mt-6 text-center text-sm text-[#64748B]">
            Already have a wallet?{" "}
            <Link to="/connect-wallet" className="font-bold text-[#2563EB] hover:underline">
              Connect Wallet
            </Link>
          </p>
        </div>
      ) : (
        <div>
          <p className="mb-5 text-sm leading-6 text-[#64748B]">
            This recovery phrase is the only way to restore access to your wallet.
            Never share it with anyone.
          </p>
          <WalletAddress address={wallet.address} />
          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {wallet.recoveryPhrase.map((word, index) => (
              <div key={`${index}-${word}`} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-[#F8FAFC] px-3">
                <span className="w-5 text-xs text-[#94A3B8]">{index + 1}.</span>
                <span className="select-text text-sm font-semibold">{word}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={copyPhrase} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-[#BFDBFE] bg-white px-4 text-sm font-semibold text-[#2563EB] hover:bg-[#E0EFFF]/50 focus-visible:outline-2 focus-visible:outline-[#2563EB]">
              {copied ? <Check size={17} /> : <Copy size={17} />}
              {copied ? "Copied!" : "Copy Phrase"}
            </button>
            <button type="button" onClick={downloadBackup} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-[#BFDBFE] bg-white px-4 text-sm font-semibold text-[#2563EB] hover:bg-[#E0EFFF]/50 focus-visible:outline-2 focus-visible:outline-[#2563EB]">
              <Download size={17} />
              Download Backup
            </button>
          </div>
          <div className="mt-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-5 text-amber-900">
            <AlertTriangle size={19} className="shrink-0" />
            <p>Never share your recovery phrase. BlockWarranty will never ask for it.</p>
          </div>
          <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm leading-5 text-[#334155]">
            <input
              type="checkbox"
              checked={confirmedSaved}
              onChange={(event) => setConfirmedSaved(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#2563EB] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
            />
            I have securely saved my recovery phrase.
          </label>
          {error && <p role="alert" className="mt-3 text-sm font-medium text-red-600">{error}</p>}
          <button
            type="button"
            className={`${buttonClass} mt-5 w-full`}
            disabled={!confirmedSaved}
            onClick={() => navigate("/connect-wallet")}
          >
            Continue to wallet connection
            <ArrowRight size={17} />
          </button>
        </div>
      )}
    </AuthShell>
  );
}
