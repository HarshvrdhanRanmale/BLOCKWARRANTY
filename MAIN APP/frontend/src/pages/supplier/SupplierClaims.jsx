import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ClipboardList,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Clock,
  Ban,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  Search,
  X,
  Wrench,
  Repeat,
  Activity,
  Layers,
  FileCheck
} from "lucide-react";
import WorkspaceLayout from "../../components/WorkspaceLayout";
import { useWallet } from "../../blockchain/useWallet";
import { apiGet, apiPost } from "../../lib/api";

export default function SupplierClaims() {
  const { user, token } = useWallet();
  const brand = user?.supplierProfile?.brandName || "Authorized Brand";

  const [tickets, setTickets] = useState([]);
  const [counts, setCounts] = useState({ total: 0, auto_passed: 0, needs_review: 0, auto_rejected: 0, overridden: 0 });
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [inspectingTicket, setInspectingTicket] = useState(null);
  const [evaluatingId, setEvaluatingId] = useState(null);
  const [overrideNotes, setOverrideNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchClaims = async () => {
    setLoading(true);
    try {
      const q = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const res = await apiGet(`/api/supplier/verification/claims${q}`, token);
      if (res && res.success) {
        setTickets(res.tickets || []);
        if (res.counts) setCounts(res.counts);
      }
    } catch (err) {
      console.error("Failed to load warranty claims:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClaims();
  }, [statusFilter]);

  useEffect(() => {
    if (!inspectingTicket) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setInspectingTicket(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [inspectingTicket]);

  const handleSeedDemo = async () => {
    try {
      setActionLoading(true);
      await apiPost("/api/supplier/verification/claims/seed-demo", {}, token);
      await fetchClaims();
    } catch (err) {
      alert(err.message || "Failed to generate demo claim tickets.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRunEvaluation = async (ticketId) => {
    try {
      setEvaluatingId(ticketId);
      const res = await apiPost(`/api/supplier/verification/claims/${ticketId}/evaluate`, {}, token);
      if (res && res.success) {
        await fetchClaims();
        if (inspectingTicket?.ticketId === ticketId) {
          setInspectingTicket(res.ticket);
        }
      }
    } catch (err) {
      alert(err.message || "Automated warranty claim evaluation failed.");
    } finally {
      setEvaluatingId(null);
    }
  };

  const handleOverride = async (action) => {
    if (!inspectingTicket) return;
    try {
      setActionLoading(true);
      const res = await apiPost(
        `/api/supplier/verification/claims/${inspectingTicket.ticketId}/override`,
        { action, notes: overrideNotes },
        token
      );
      if (res && res.success) {
        setInspectingTicket(res.ticket);
        setOverrideNotes("");
        await fetchClaims();
      }
    } catch (err) {
      alert(err.message || "Failed to apply manual override.");
    } finally {
      setActionLoading(false);
    }
  };

  const filteredTickets = tickets.filter((t) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      t.ticketId?.toLowerCase().includes(term) ||
      t.customerName?.toLowerCase().includes(term) ||
      t.manufacturerSerialNumber?.toLowerCase().includes(term) ||
      t.issueDescription?.toLowerCase().includes(term)
    );
  });

  return (
    <WorkspaceLayout>
      <div className="mx-auto max-w-7xl space-y-6 pb-20">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
          <Link to="/supplier/dashboard" className="hover:text-slate-700 transition">
            Supplier Portal
          </Link>
          <span>/</span>
          <span className="text-slate-800 font-semibold">Warranty Claims Queue</span>
        </div>

        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                Warranty Claims Queue
              </h1>
              <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700 border border-indigo-100">
                {brand}
              </span>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-slate-500 max-w-2xl">
              Automated claims adjudication engine. Checks active warranty timeframes, evaluates diagnostic telemetry, and manages replacement inventory allocations.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={fetchClaims}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4.5 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Claims</span>
              <ClipboardList size={16} className="text-indigo-600" />
            </div>
            <p className="mt-2 text-2xl font-black tracking-tight text-slate-900">{counts.total || 0}</p>
            <span className="mt-1 inline-block text-[11px] font-medium text-slate-400">Customer repair tickets</span>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-4.5 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Auto-Approved</span>
              <CheckCircle2 size={16} className="text-emerald-600" />
            </div>
            <p className="mt-2 text-2xl font-black tracking-tight text-emerald-700">{counts.auto_passed || 0}</p>
            <span className="mt-1 inline-block text-[11px] font-medium text-emerald-600/80">Diagnostic confirmed</span>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-4.5 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Needs Review</span>
              <Clock size={16} className="text-amber-600" />
            </div>
            <p className="mt-2 text-2xl font-black tracking-tight text-amber-700">{counts.needs_review || 0}</p>
            <span className="mt-1 inline-block text-[11px] font-medium text-amber-600/80">Physical/liquid checks</span>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-4.5 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Auto-Rejected</span>
              <Ban size={16} className="text-rose-600" />
            </div>
            <p className="mt-2 text-2xl font-black tracking-tight text-rose-700">{counts.auto_rejected || 0}</p>
            <span className="mt-1 inline-block text-[11px] font-medium text-rose-600/80">Lapsed/voided units</span>
          </div>
        </div>

        {/* Filter Controls & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
          <div className="inline-flex rounded-xl border border-slate-200/90 bg-slate-100/80 p-1">
            {[
              { id: "all", label: "All Claims", count: counts.total },
              { id: "needs_review", label: "Needs Review", count: counts.needs_review },
              { id: "auto_passed", label: "Auto-Approved", count: counts.auto_passed },
              { id: "auto_rejected", label: "Auto-Rejected", count: counts.auto_rejected },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  statusFilter === tab.id
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <span>{tab.label}</span>
                <span className={`rounded-md px-1.5 py-0.2 text-[10px] font-bold ${
                  statusFilter === tab.id ? "bg-slate-100 text-slate-700" : "text-slate-400"
                }`}>
                  {tab.count || 0}
                </span>
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search serial, issue, or ticket ID…"
              className="w-full rounded-xl border border-slate-200/90 bg-white pl-8 pr-7 py-2 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 shadow-2xs"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Claims Table */}
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
          {filteredTickets.length === 0 ? (
            <div className="p-14 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
                <ClipboardList size={24} />
              </div>
              <h3 className="mt-3 text-sm font-bold text-slate-800">No Claim Tickets Found</h3>
              <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
                {searchTerm || statusFilter !== "all"
                  ? "No claims match your selected filter or search query."
                  : "Click 'Generate Demo Claims' above to populate sample claims."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-3">Ticket / Customer</th>
                    <th className="px-5 py-3">Hardware Serial & Model</th>
                    <th className="px-5 py-3">Issue Category</th>
                    <th className="px-5 py-3">Type & Evidence</th>
                    <th className="px-5 py-3">Adjudication State</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredTickets.map((t) => {
                    const isPassed = t.validationState === "auto_passed" || t.validationState === "manually_approved";
                    const isRejected = t.validationState === "auto_rejected" || t.validationState === "manually_rejected";
                    const isReview = t.validationState === "needs_review";

                    return (
                      <tr key={t.ticketId} className="hover:bg-slate-50/60 transition-colors">
                        {/* Ticket / Customer */}
                        <td className="px-5 py-3.5">
                          <div className="font-bold text-slate-900">{t.ticketId}</div>
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            <span className="font-medium text-slate-700">{t.customerName}</span>
                            <span className="text-slate-400"> • {new Date(t.claimDate).toLocaleDateString()}</span>
                          </div>
                        </td>

                        {/* Serial & Model */}
                        <td className="px-5 py-3.5">
                          <div className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold text-slate-800 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                            {t.manufacturerSerialNumber}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-600 font-medium">
                            {t.productName || "Hardware Device"}
                          </div>
                        </td>

                        {/* Issue Category & Description */}
                        <td className="px-5 py-3.5 max-w-[240px]">
                          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold border ${
                            t.issueCategory === 'liquid_damage' || t.issueCategory === 'physical_damage'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}>
                            {t.issueCategory?.replace('_', ' ')}
                          </span>
                          <p className="mt-1 text-[11px] text-slate-600 truncate" title={t.issueDescription}>
                            {t.issueDescription}
                          </p>
                        </td>

                        {/* Type & Evidence */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 uppercase">
                              {t.claimType}
                            </span>
                            {t.diagnosticEvidence?.hasDiagnosticLog ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                <Activity size={10} /> {t.diagnosticEvidence.diagnosticConfidence}% Telemetry
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">No telemetry</span>
                            )}
                          </div>
                          {t.replacementUnitSerial && (
                            <div className="mt-1 text-[10px] font-mono text-indigo-700 font-bold">
                              ↳ Repl: {t.replacementUnitSerial}
                            </div>
                          )}
                        </td>

                        {/* Validation State Badge */}
                        <td className="px-5 py-3.5">
                          {isPassed && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                              <CheckCircle2 size={12} />
                              {t.validationState === "manually_approved" ? "Approved (Manual)" : "Auto-Approved"}
                            </span>
                          )}
                          {isReview && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 border border-amber-200">
                              <Clock size={12} />
                              Needs Review
                            </span>
                          )}
                          {isRejected && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-700 border border-rose-200">
                              <Ban size={12} />
                              {t.validationState === "manually_rejected" ? "Rejected (Manual)" : "Auto-Rejected"}
                            </span>
                          )}
                          {t.validationState === "pending" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600 border border-slate-200">
                              Pending Evaluation
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => setInspectingTicket(t)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                          >
                            Audit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* =========================================================================
            CLAIM AUDIT & EXCEPTION RESOLUTION MODAL
        ========================================================================= */}
        {inspectingTicket && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/60 backdrop-blur-xs overflow-hidden"
            onClick={() => setInspectingTicket(null)}
          >
            <div
              className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Sticky Header with Always-Visible Close Button */}
              <div className="flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4 shrink-0 z-10">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                    <ClipboardList size={18} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-black text-slate-900 tracking-tight truncate">
                        Warranty Claim Audit: {inspectingTicket.ticketId}
                      </h2>
                      <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-100 uppercase shrink-0">
                        {inspectingTicket.claimType}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">
                      Policy window validation, diagnostic telemetry check, and replacement stock allocation.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setInspectingTicket(null)}
                  title="Close (Esc)"
                  aria-label="Close modal"
                  className="ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition shadow-2xs"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Scrollable Content Body with a Single Internal Scrollbar */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Hardware & Evidence Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Claimed Hardware Unit</span>
                  <div className="font-mono text-xs font-bold text-slate-900">
                    {inspectingTicket.manufacturerSerialNumber}
                  </div>
                  <div className="text-[11px] text-slate-600 font-medium">
                    {inspectingTicket.productName || "Hardware Device"}
                  </div>
                </div>

                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Diagnostic Telemetry</span>
                  <div className="font-semibold text-slate-900">
                    {inspectingTicket.diagnosticEvidence?.diagnosticCode || "No error code"}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Confidence: <span className="font-bold text-emerald-700">{inspectingTicket.diagnosticEvidence?.diagnosticConfidence || 0}%</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Reported Defect Category</span>
                  <div className="font-bold text-slate-800 capitalize">
                    {inspectingTicket.issueCategory?.replace('_', ' ')}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate" title={inspectingTicket.issueDescription}>
                    {inspectingTicket.issueDescription}
                  </div>
                </div>

                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Replacement Unit Allocation</span>
                  {inspectingTicket.replacementUnitSerial ? (
                    <div className="font-mono text-xs font-bold text-indigo-700">
                      {inspectingTicket.replacementUnitSerial}
                      <span className="block text-[10px] text-indigo-500 font-sans font-medium">
                        Remaining {inspectingTicket.remainingWarrantyDaysTransferred} days transferred
                      </span>
                    </div>
                  ) : (
                    <div className="text-slate-400 text-[11px]">
                      {inspectingTicket.claimType === 'replacement' ? "Pending stock allocation" : "Not applicable (Standard repair)"}
                    </div>
                  )}
                </div>
              </div>

              {/* ─── Supplier Release & Inventory Verification Matrix ─── */}
              {inspectingTicket.inventoryComparison && (
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Layers size={13} className="text-indigo-600" />
                    Supplier Inventory Verification Matrix
                  </label>
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-3 py-2 text-left font-bold text-slate-500 uppercase tracking-wider">Field</th>
                          <th className="px-3 py-2 text-left font-bold text-slate-500 uppercase tracking-wider">Claim (Submitted)</th>
                          <th className="px-3 py-2 text-left font-bold text-slate-500 uppercase tracking-wider">Supplier Ledger</th>
                          <th className="px-3 py-2 text-center font-bold text-slate-500 uppercase tracking-wider w-16">Match</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {[
                          { label: 'Serial Number', data: inspectingTicket.inventoryComparison.serialNumberMatch },
                          { label: 'Product ID', data: inspectingTicket.inventoryComparison.productIdMatch },
                          { label: 'Product Name', data: inspectingTicket.inventoryComparison.productNameMatch },
                          { label: 'Brand', data: inspectingTicket.inventoryComparison.brandMatch },
                          { label: 'Model Number', data: inspectingTicket.inventoryComparison.modelMatch },
                        ].map((row) => (
                          <tr key={row.label} className="hover:bg-slate-50/50">
                            <td className="px-3 py-1.5 font-semibold text-slate-700">{row.label}</td>
                            <td className="px-3 py-1.5 font-mono text-slate-600 truncate max-w-[140px]">{row.data?.claimed || 'N/A'}</td>
                            <td className="px-3 py-1.5 font-mono text-slate-600 truncate max-w-[140px]">{row.data?.supplier || 'N/A'}</td>
                            <td className="px-3 py-1.5 text-center">
                              {row.data?.match ? (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                                  <CheckCircle2 size={11} />
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-50 text-rose-600 border border-rose-200">
                                  <Ban size={11} />
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {/* Release Status Row */}
                        <tr className="hover:bg-slate-50/50 bg-indigo-50/30">
                          <td className="px-3 py-1.5 font-semibold text-slate-700">On-Chain Release</td>
                          <td className="px-3 py-1.5 text-slate-600" colSpan={2}>
                            {inspectingTicket.inventoryComparison.releaseStatus?.isAnchoredOnChain ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                                <CheckCircle2 size={12} /> Anchored — Batch {inspectingTicket.inventoryComparison.releaseStatus.importBatchId || 'N/A'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-rose-700 font-medium">
                                <Ban size={12} /> Not Released (Merkle batch not committed)
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            {inspectingTicket.inventoryComparison.releaseStatus?.isAnchoredOnChain ? (
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200"><CheckCircle2 size={11} /></span>
                            ) : (
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-50 text-rose-600 border border-rose-200"><Ban size={11} /></span>
                            )}
                          </td>
                        </tr>
                        {/* Warranty Info */}
                        <tr className="hover:bg-slate-50/50">
                          <td className="px-3 py-1.5 font-semibold text-slate-700">Warranty Policy</td>
                          <td className="px-3 py-1.5 text-slate-600" colSpan={2}>
                            <span className="font-medium">{inspectingTicket.inventoryComparison.warrantyInfo?.supplierWarrantyMonths || '—'} months</span>
                            <span className="text-slate-400 ml-1.5">(start: {inspectingTicket.inventoryComparison.warrantyInfo?.supplierWarrantyStartRule || '—'})</span>
                            {inspectingTicket.inventoryComparison.warrantyInfo?.activatedExpiry && (
                              <span className="ml-1.5 text-emerald-700 font-medium">→ expires {inspectingTicket.inventoryComparison.warrantyInfo.activatedExpiry}</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200"><Activity size={11} /></span>
                          </td>
                        </tr>
                        {/* Registration Details */}
                        {inspectingTicket.inventoryComparison.warrantyInfo?.registeredByCustomer && (
                          <tr className="hover:bg-slate-50/50">
                            <td className="px-3 py-1.5 font-semibold text-slate-700">Registered By</td>
                            <td className="px-3 py-1.5 font-mono text-slate-600 truncate max-w-[200px]" colSpan={2}>
                              {inspectingTicket.inventoryComparison.warrantyInfo.registeredByCustomer}
                              {inspectingTicket.inventoryComparison.warrantyInfo.registeredAt && (
                                <span className="ml-1.5 text-slate-400 font-sans">on {inspectingTicket.inventoryComparison.warrantyInfo.registeredAt}</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200"><Activity size={11} /></span>
                            </td>
                          </tr>
                        )}
                        {/* Inventory Status */}
                        <tr className="hover:bg-slate-50/50">
                          <td className="px-3 py-1.5 font-semibold text-slate-700">Inventory Status</td>
                          <td className="px-3 py-1.5" colSpan={2}>
                            <span className={`inline-flex items-center gap-1 font-bold text-[10px] uppercase px-2 py-0.5 rounded-md ${
                              inspectingTicket.inventoryComparison.inventoryStatus === 'registered' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                              inspectingTicket.inventoryComparison.inventoryStatus === 'unclaimed' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                              'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}>
                              {inspectingTicket.inventoryComparison.inventoryStatus}
                            </span>
                            {inspectingTicket.inventoryComparison.productId && (
                              <span className="ml-2 text-slate-400 font-mono text-[10px]">Product: {inspectingTicket.inventoryComparison.productId}</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200"><Activity size={11} /></span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Reason Codes Breakdown */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Adjudication Verdict & Policy Reason Codes
                </label>
                {inspectingTicket.reasonCodes && inspectingTicket.reasonCodes.length > 0 ? (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {inspectingTicket.reasonCodes.map((reason, idx) => (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                          reason.severity === "error"
                            ? "bg-rose-50 border-rose-200 text-rose-900"
                            : reason.severity === "warning"
                            ? "bg-amber-50 border-amber-200 text-amber-900"
                            : "bg-emerald-50 border-emerald-200 text-emerald-900"
                        }`}
                      >
                        {reason.severity === "error" ? (
                          <Ban size={15} className="text-rose-600 shrink-0 mt-0.5" />
                        ) : reason.severity === "warning" ? (
                          <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                        ) : (
                          <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <span className="font-mono font-bold text-[10px] uppercase block tracking-wider">
                            {reason.code}
                          </span>
                          <span className="mt-0.5 block leading-relaxed">{reason.message}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500 text-center">
                    Automated claim adjudication completed. No policy violation flagged.
                  </div>
                )}
              </div>

                {/* Manual Override Actions */}
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700">Manual Claims Manager Override</span>
                    <span className="text-slate-400 text-[11px]">Authorized service manager sign-off</span>
                  </div>
                  <input
                    type="text"
                    value={overrideNotes}
                    onChange={(e) => setOverrideNotes(e.target.value)}
                    placeholder="Enter service rationale for override (e.g. 'One-time customer goodwill concession approved')…"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none shadow-2xs"
                  />
                </div>
              </div>

              {/* Sticky Modal Footer */}
              <div className="border-t border-slate-100 bg-slate-50/90 px-6 py-3.5 flex items-center justify-between shrink-0">
                <button
                  type="button"
                  onClick={() => setInspectingTicket(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs"
                >
                  Close
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleRunEvaluation(inspectingTicket.ticketId)}
                    disabled={evaluatingId === inspectingTicket.ticketId}
                    className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                  >
                    Re-Run Rules
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOverride("reject")}
                    disabled={actionLoading}
                    className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition shadow-2xs disabled:opacity-50"
                  >
                    Reject Claim
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOverride("approve")}
                    disabled={actionLoading}
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs disabled:opacity-50"
                  >
                    Authorize Repair/Replacement
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </WorkspaceLayout>
  );
}
