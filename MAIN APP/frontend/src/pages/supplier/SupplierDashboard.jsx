import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  Boxes,
  FileCheck,
  ClipboardList,
  ShieldCheck,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Clock,
  CheckCircle2,
} from "lucide-react";
import WorkspaceLayout from "../../components/WorkspaceLayout";
import { useWallet } from "../../blockchain/useWallet";
import { apiGet } from "../../lib/api";

export default function SupplierDashboard() {
  const { user, token, walletAddress } = useWallet();
  const profile = user?.supplierProfile || {};

  const [stats, setStats] = useState({
    inventoryTotal: 0,
    invoicesTotal: 0,
    invoicesNeedsReview: 0,
    invoicesAutoPassed: 0,
    claimsTotal: 0,
    claimsNeedsReview: 0,
    claimsAutoRejected: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardStats = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [invRes, invSubRes, claimsRes] = await Promise.allSettled([
        apiGet("/api/supplier/inventory", token),
        apiGet("/api/supplier/verification/invoices", token),
        apiGet("/api/supplier/verification/claims", token),
      ]);

      const inventoryTotal =
        invRes.status === "fulfilled"
          ? invRes.value?.pagination?.total ?? invRes.value?.total ?? (invRes.value?.items?.length || 0)
          : 0;

      const invoiceCounts =
        invSubRes.status === "fulfilled" && invSubRes.value?.counts
          ? invSubRes.value.counts
          : { total: 0, needs_review: 0, auto_passed: 0 };

      const claimCounts =
        claimsRes.status === "fulfilled" && claimsRes.value?.counts
          ? claimsRes.value.counts
          : { total: 0, needs_review: 0, auto_rejected: 0 };

      setStats({
        inventoryTotal,
        invoicesTotal: invoiceCounts.total || 0,
        invoicesNeedsReview: invoiceCounts.needs_review || 0,
        invoicesAutoPassed: invoiceCounts.auto_passed || 0,
        claimsTotal: claimCounts.total || 0,
        claimsNeedsReview: claimCounts.needs_review || 0,
        claimsAutoRejected: claimCounts.auto_rejected || 0,
      });
    } catch (err) {
      console.error("Failed to load supplier dashboard metrics:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardStats();
  }, [token]);

  return (
    <WorkspaceLayout>
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Header Banner */}
        <div className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50/80 via-white to-slate-50 p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-700 text-white shadow-lg shadow-blue-600/20">
                <Building2 size={28} />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-bold text-emerald-800">
                    <ShieldCheck size={14} /> Verified Supplier
                  </span>
                  <span className="text-xs font-medium text-slate-500">
                    GSTIN/Tax ID: {profile.taxId || "US-AAPL-839210-GST"}
                  </span>
                </div>
                <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                  {profile.companyName || user?.name || "Supplier Command Center"}
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  Brand: <span className="font-semibold text-slate-900">{profile.brandName || "Apple"}</span> | Signer Wallet:{" "}
                  <span className="font-mono text-xs text-slate-700">{walletAddress}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => fetchDashboardStats(true)}
                disabled={refreshing}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition disabled:opacity-50"
                title="Refresh metrics"
              >
                <RefreshCw size={14} className={refreshing ? "animate-spin text-blue-600" : ""} />
                <span>{refreshing ? "Syncing…" : "Refresh"}</span>
              </button>

              <Link
                to="/supplier/inventory"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 transition"
              >
                <Boxes size={18} /> Manage Inventory
              </Link>
            </div>
          </div>
        </div>

        {/* Quick Stats Overview Cards (Live Loaded & Clickable) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Card 1: Inventory Tracked */}
          <Link
            to="/supplier/inventory"
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-blue-300 hover:shadow-md transition block"
          >
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-bold uppercase tracking-wider group-hover:text-blue-600 transition">
                Inventory Tracked
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition">
                <Boxes size={18} />
              </span>
            </div>
            <p className="mt-3 text-3xl font-black text-slate-900">
              {loading ? (
                <span className="inline-block h-8 w-16 animate-pulse rounded bg-slate-200" />
              ) : (
                stats.inventoryTotal
              )}
            </p>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span>Pre-seeded serial numbers & warranties</span>
              <ArrowRight size={13} className="text-slate-300 group-hover:translate-x-1 group-hover:text-blue-600 transition" />
            </div>
          </Link>

          {/* Card 2: Pending Invoices */}
          <Link
            to="/supplier/invoices"
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-amber-300 hover:shadow-md transition block"
          >
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-bold uppercase tracking-wider group-hover:text-amber-600 transition">
                Pending Invoices
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition">
                <FileCheck size={18} />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <p className="text-3xl font-black text-slate-900">
                {loading ? (
                  <span className="inline-block h-8 w-16 animate-pulse rounded bg-slate-200" />
                ) : (
                  stats.invoicesNeedsReview
                )}
              </p>
              {!loading && stats.invoicesTotal > 0 && (
                <span className="text-xs font-semibold text-slate-400">
                  of {stats.invoicesTotal} total
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span className={stats.invoicesNeedsReview > 0 ? "text-amber-600 font-semibold" : ""}>
                {stats.invoicesNeedsReview > 0
                  ? `${stats.invoicesNeedsReview} customer bill${stats.invoicesNeedsReview > 1 ? "s" : ""} awaiting review`
                  : "All customer bills audited"}
              </span>
              <ArrowRight size={13} className="text-slate-300 group-hover:translate-x-1 group-hover:text-amber-600 transition" />
            </div>
          </Link>

          {/* Card 3: Active Warranty Claims */}
          <Link
            to="/supplier/claims"
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-indigo-300 hover:shadow-md transition block"
          >
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-bold uppercase tracking-wider group-hover:text-indigo-600 transition">
                Warranty Claims Queue
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition">
                <ClipboardList size={18} />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <p className="text-3xl font-black text-slate-900">
                {loading ? (
                  <span className="inline-block h-8 w-16 animate-pulse rounded bg-slate-200" />
                ) : (
                  stats.claimsTotal
                )}
              </p>
              {!loading && stats.claimsNeedsReview > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                  {stats.claimsNeedsReview} Needs Review
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span>Customer service & repair requests</span>
              <ArrowRight size={13} className="text-slate-300 group-hover:translate-x-1 group-hover:text-indigo-600 transition" />
            </div>
          </Link>
        </div>

        {/* Navigation Action Cards */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {/* Card 1: Inventory Management */}
          <Link
            to="/supplier/inventory"
            className="group flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-sm hover:border-blue-300 hover:shadow-md transition"
          >
            <div>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition">
                <Boxes size={24} />
              </span>
              <h3 className="mt-4 text-lg font-bold text-slate-900">Inventory Management</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                Register genuine product batches, serial numbers, and warranty durations to enable instant customer validation.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1 text-sm font-bold text-blue-600">
              Open Inventory <ArrowRight size={16} className="transition group-hover:translate-x-1" />
            </div>
          </Link>

          {/* Card 2: Invoice Verifications */}
          <Link
            to="/supplier/invoices"
            className="group flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-sm hover:border-amber-300 hover:shadow-md transition"
          >
            <div>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition">
                <FileCheck size={24} />
              </span>
              <h3 className="mt-4 text-lg font-bold text-slate-900">Invoice Verifications</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                Review and audit customer-uploaded bills that need manual validation before blockchain registration is unlocked.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1 text-sm font-bold text-amber-600">
              Review Invoices <ArrowRight size={16} className="transition group-hover:translate-x-1" />
            </div>
          </Link>

          {/* Card 3: Warranty Claims */}
          <Link
            to="/supplier/claims"
            className="group flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-sm hover:border-indigo-300 hover:shadow-md transition"
          >
            <div>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition">
                <ClipboardList size={24} />
              </span>
              <h3 className="mt-4 text-lg font-bold text-slate-900">Warranty Claims Queue</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                Process customer warranty repair tickets with automated pre-validations and authorize on-chain claims.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1 text-sm font-bold text-indigo-600">
              Inspect Claims <ArrowRight size={16} className="transition group-hover:translate-x-1" />
            </div>
          </Link>
        </div>
      </div>
    </WorkspaceLayout>
  );
}
