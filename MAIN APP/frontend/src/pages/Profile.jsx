import { useState } from "react";
import { UserRound, Mail, Wallet, Copy, Check, ShieldCheck } from "lucide-react";
import Sidebar from "../components/Sidebar";
import { useAuthFlow } from "../auth/useAuthFlow";

function Profile() {
  const { user, walletAddress } = useAuthFlow();
  const [sidebarPinnedOpen, setSidebarPinnedOpen] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [copiedWallet, setCopiedWallet] = useState(false);

  const sidebarOpen = sidebarPinnedOpen || sidebarHovered;

  const displayName  = user?.name  || "—";
  const displayEmail = user?.email || "—";
  const displayWallet = walletAddress || user?.walletAddress || "—";

  const shortWallet = displayWallet && displayWallet !== "—"
    ? `${displayWallet.slice(0, 6)}...${displayWallet.slice(-4)}`
    : "—";

  const copyWallet = () => {
    if (!displayWallet || displayWallet === "—") return;
    navigator.clipboard.writeText(displayWallet).then(() => {
      setCopiedWallet(true);
      setTimeout(() => setCopiedWallet(false), 2000);
    });
  };

  return (
    <div className="min-h-screen bg-[#F5F1EC] text-[#171717]">

      {/* ── SIDEBAR ────────────────────────────────────────── */}
      <Sidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarPinnedOpen}
        pinnedOpen={sidebarPinnedOpen}
        pinnedMode
        showBrand
        topOffset={0}
        onHoverChange={setSidebarHovered}
      />

      {/* ── MAIN CONTENT ───────────────────────────────────── */}
      <main
        className="transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ marginLeft: sidebarOpen ? 280 : 88 }}
      >
        <div className="min-h-screen px-8 py-10 max-w-2xl">

          {/* Page title */}
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#8B1E3F] mb-1">
              Account
            </p>
            <h1 className="text-3xl font-extrabold tracking-tight text-[#0F172A]">
              My Profile
            </h1>
            <p className="mt-1 text-sm text-[#6B7280]">
              Your identity on BlockWarranty
            </p>
          </div>

          {/* Profile card */}
          <div className="rounded-3xl border border-[#E5E0DA] bg-white shadow-[0_8px_40px_rgba(23,25,28,0.06)] overflow-hidden">

            {/* Coloured header strip */}
            <div className="h-24 bg-gradient-to-r from-[#8B1E3F] to-[#C2185B] relative">
              {/* Avatar circle */}
              <div className="absolute -bottom-8 left-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-[0_8px_24px_rgba(139,30,63,0.18)] border-2 border-[#F3DDE4]">
                <UserRound size={32} strokeWidth={1.8} className="text-[#8B1E3F]" />
              </div>
            </div>

            {/* Body */}
            <div className="pt-12 pb-8 px-8 flex flex-col gap-6">

              {/* Name */}
              <InfoRow
                icon={<UserRound size={18} className="text-[#8B1E3F]" />}
                label="Full Name"
                value={displayName}
              />

              {/* Email */}
              <InfoRow
                icon={<Mail size={18} className="text-[#8B1E3F]" />}
                label="Email Address"
                value={displayEmail}
              />

              {/* Wallet */}
              <div className="flex items-start gap-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F3DDE4]">
                  <Wallet size={18} className="text-[#8B1E3F]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-[#6B7280] mb-0.5">
                    Wallet Address
                  </p>
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Show short on small, full on md+ */}
                    <p className="text-sm font-mono font-semibold text-[#0F172A] truncate">
                      <span className="hidden sm:inline">{displayWallet}</span>
                      <span className="sm:hidden">{shortWallet}</span>
                    </p>
                    {displayWallet !== "—" && (
                      <button
                        onClick={copyWallet}
                        title="Copy full address"
                        className="shrink-0 flex items-center justify-center h-7 w-7 rounded-lg bg-[#F5F1EC] hover:bg-[#F3DDE4] transition-colors"
                      >
                        {copiedWallet
                          ? <Check size={14} className="text-green-600" />
                          : <Copy size={14} className="text-[#6B7280]" />
                        }
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-[#E5E0DA]" />

              {/* Blockchain badge */}
              <div className="flex items-center gap-2">
                <ShieldCheck size={15} className="text-[#16A34A]" />
                <p className="text-xs text-[#16A34A] font-semibold">
                  Wallet verified on blockchain
                </p>
              </div>

            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F3DDE4]">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#6B7280] mb-0.5">
          {label}
        </p>
        <p className="text-sm font-semibold text-[#0F172A] truncate">{value}</p>
      </div>
    </div>
  );
}

export default Profile;
