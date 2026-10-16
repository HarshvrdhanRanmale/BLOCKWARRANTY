import { useState } from "react";
import { Check, Copy, Fingerprint, Mail, ShieldCheck, UserRound, Wallet } from "lucide-react";
import WorkspaceLayout from "../components/WorkspaceLayout";
import { useAuthFlow } from "../auth/useAuthFlow";
import { CHAIN_ID, CHAIN_NAME } from "../blockchain/contractConfig";

function Profile() {
  const { user, walletAddress, chainId, walletType } = useAuthFlow();
  const [copiedWallet, setCopiedWallet] = useState(false);

  const displayName = user?.name || "BlockWarranty user";
  const displayEmail = user?.email || "—";
  const displayWallet = walletAddress || user?.walletAddress || "—";
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";
  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })
    : "Date unavailable";
  const networkName = chainId === CHAIN_ID ? CHAIN_NAME : chainId ? `Chain ${chainId}` : "Network unavailable";

  const shortWallet = displayWallet && displayWallet !== "—"
    ? `${displayWallet.slice(0, 10)}...${displayWallet.slice(-8)}`
    : "—";

  const copyWallet = () => {
    if (!displayWallet || displayWallet === "—") return;
    navigator.clipboard.writeText(displayWallet).then(() => {
      setCopiedWallet(true);
      window.setTimeout(() => setCopiedWallet(false), 1800);
    }).catch(() => setCopiedWallet(false));
  };

  return (
    <WorkspaceLayout>
      <header className="mb-7">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-blue-700">Account</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-slate-950">My Profile</h1>
        <p className="mt-2 text-base text-slate-600">Your identity and activity on BlockWarranty.</p>
      </header>

      <section className="relative max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.045)]">
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-32 bg-gradient-to-r from-blue-50 via-white to-indigo-50" />
        <div className="relative">
          <div className="flex min-h-56 items-center gap-6 px-6 py-8 sm:px-10 sm:py-10">
            <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-4 border-white bg-blue-100 text-3xl font-extrabold text-blue-700 shadow-[0_4px_18px_rgba(37,99,235,0.12)] sm:h-28 sm:w-28 sm:text-4xl">{initials}</span>
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-700">Account holder</p>
              <h2 className="mt-2 break-words text-2xl font-extrabold text-slate-950 sm:text-3xl">{displayName}</h2>
              <div className="mt-4 flex min-w-0 items-center gap-2 text-base text-slate-600"><Mail size={17} className="shrink-0 text-slate-400" /><span className="break-all">{displayEmail}</span></div>
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-500"><UserRound size={16} className="text-slate-400" /> Member since {memberSince}</div>
            </div>
          </div>

          <div className="border-t border-slate-200 px-6 py-7 sm:px-10 sm:py-8">
            <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Fingerprint size={22} /></span><div><h3 className="text-lg font-extrabold text-slate-950">Wallet information</h3><p className="mt-0.5 text-sm text-slate-500">Connected account and network status</p></div></div>
            <div className="mt-5 flex min-h-14 min-w-0 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <Wallet size={19} className="shrink-0 text-slate-500" />
              <p title={displayWallet} className="min-w-0 flex-1 break-all font-mono text-sm font-semibold text-slate-800"><span className="hidden sm:inline">{displayWallet}</span><span className="sm:hidden">{shortWallet}</span></p>
              {displayWallet !== "—" && <button type="button" onClick={copyWallet} title={copiedWallet ? "Copied" : "Copy wallet address"} aria-label={copiedWallet ? "Wallet address copied" : "Copy wallet address"} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:border-blue-300 hover:text-blue-700">{copiedWallet ? <Check size={18} className="text-emerald-600" /> : <Copy size={17} />}</button>}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <StatusPill icon={<span className={`h-3 w-3 rounded-full ${walletAddress ? "bg-emerald-500" : "bg-slate-400"}`} />} label={walletAddress ? "Wallet connected" : "Wallet disconnected"} detail={walletAddress ? "Identity available" : "Connect a wallet to continue"} tone={walletAddress ? "green" : "slate"} />
              <StatusPill icon={<ShieldCheck size={18} />} label={chainId === CHAIN_ID ? CHAIN_NAME : chainId ? "Wrong network" : "Network unavailable"} detail={chainId === CHAIN_ID ? "Current network" : networkName} tone={chainId === CHAIN_ID ? "blue" : chainId ? "amber" : "slate"} />
              <StatusPill icon={<Wallet size={18} />} label={walletType === "metamask" ? "MetaMask" : walletType || "Wallet"} detail={walletAddress ? "Connected account" : "No active account"} tone="slate" />
            </div>
          </div>
        </div>
      </section>
    </WorkspaceLayout>
  );
}

function StatusPill({ icon, label, detail, tone }) {
  const styles = {
    green: "border-emerald-100 bg-emerald-50 text-emerald-800",
    blue: "border-blue-100 bg-blue-50 text-blue-800",
    amber: "border-amber-100 bg-amber-50 text-amber-800",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  };
  return (
    <div className={`flex min-w-0 items-center gap-3 rounded-lg border px-4 py-3 ${styles[tone]}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/75">{icon}</span>
      <span className="min-w-0"><span className="block truncate text-sm font-bold">{label}</span><span className="mt-0.5 block truncate text-xs opacity-75">{detail}</span></span>
    </div>
  );
}

export default Profile;
