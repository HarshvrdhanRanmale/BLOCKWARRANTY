import { Check, Copy, Wallet } from "lucide-react";
import { useState } from "react";

export default function WalletAddress({ address, compact = false }) {
  const [copyStatus, setCopyStatus] = useState("");
  const displayedAddress =
    compact && address
      ? `${address.slice(0, 6)}...${address.slice(-4)}`
      : address;

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopyStatus("Copied!");
      window.setTimeout(() => setCopyStatus(""), 1800);
    } catch {
      setCopyStatus("Unable to copy");
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E0EFFF] text-[#2563EB]">
        <Wallet size={19} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
          Wallet address
        </p>
        <p className="mt-1 truncate font-mono text-sm font-semibold text-[#0F172A]" title={address}>
          {displayedAddress}
        </p>
      </div>
      <button
        type="button"
        onClick={copyAddress}
        className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-2 text-xs font-semibold text-[#2563EB] hover:bg-[#E0EFFF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
        aria-label="Copy full wallet address"
      >
        {copyStatus ? <Check size={16} /> : <Copy size={16} />}
        <span className="hidden sm:inline">{copyStatus || "Copy"}</span>
      </button>
      {copyStatus === "Unable to copy" && (
        <span role="status" className="sr-only">{copyStatus}</span>
      )}
    </div>
  );
}
