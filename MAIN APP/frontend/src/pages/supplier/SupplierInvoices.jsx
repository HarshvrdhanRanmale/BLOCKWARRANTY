import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  FileCheck,
  ArrowLeft,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  Ban,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  Search,
  Check,
  X,
  FileText,
  Building,
  Hash,
  SlidersHorizontal,
  Info
} from "lucide-react";
import WorkspaceLayout from "../../components/WorkspaceLayout";
import { useWallet } from "../../blockchain/useWallet";
import { apiGet, apiPost } from "../../lib/api";

export default function SupplierInvoices() {
  const { user, token } = useWallet();
  const brand = user?.supplierProfile?.brandName || "Authorized Brand";

  const [submissions, setSubmissions] = useState([]);
  const [counts, setCounts] = useState({ total: 0, auto_passed: 0, needs_review: 0, auto_rejected: 0, overridden: 0 });
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [inspectingSub, setInspectingSub] = useState(null);
  const [evaluatingId, setEvaluatingId] = useState(null);
  const [overrideNotes, setOverrideNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const q = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const res = await apiGet(`/api/supplier/verification/invoices${q}`, token);
      if (res && res.success) {
        setSubmissions(res.submissions || []);
        if (res.counts) setCounts(res.counts);
      }
    } catch (err) {
      console.error("Failed to load invoice submissions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [statusFilter]);

  useEffect(() => {
    if (!inspectingSub) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setInspectingSub(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [inspectingSub]);

  const handleSeedDemo = async () => {
    try {
      setActionLoading(true);
      await apiPost("/api/supplier/verification/invoices/seed-demo", {}, token);
      await fetchInvoices();
    } catch (err) {
      alert(err.message || "Failed to generate demo submissions.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRunEvaluation = async (submissionId) => {
    try {
      setEvaluatingId(submissionId);
      const res = await apiPost(`/api/supplier/verification/invoices/${submissionId}/evaluate`, {}, token);
      if (res && res.success) {
        // Refresh local list and update inspecting modal if open
        await fetchInvoices();
        if (inspectingSub?.submissionId === submissionId) {
          setInspectingSub(res.submission);
        }
      }
    } catch (err) {
      alert(err.message || "Automated invoice evaluation failed.");
    } finally {
      setEvaluatingId(null);
    }
  };

  const handleOverride = async (action) => {
    if (!inspectingSub) return;
    try {
      setActionLoading(true);
      const res = await apiPost(
        `/api/supplier/verification/invoices/${inspectingSub.submissionId}/override`,
        { action, notes: overrideNotes },
        token
      );
      if (res && res.success) {
        setInspectingSub(res.submission);
        setOverrideNotes("");
        await fetchInvoices();
      }
    } catch (err) {
      alert(err.message || "Failed to apply manual override.");
    } finally {
      setActionLoading(false);
    }
  };

  const filteredSubmissions = submissions.filter((sub) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      sub.submissionId?.toLowerCase().includes(term) ||
      sub.customerName?.toLowerCase().includes(term) ||
      sub.extractedData?.serialNumber?.toLowerCase().includes(term) ||
      sub.extractedData?.invoiceNumber?.toLowerCase().includes(term)
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
          <span className="text-slate-800 font-semibold">Invoice Verification Queue</span>
        </div>

        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                Invoice Verification Queue
              </h1>
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 border border-blue-100">
                {brand}
              </span>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-slate-500 max-w-2xl">
              Automated invoice validation engine. Deterministically matches hardware serials, prevents race-condition claims, and isolates exceptions.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={fetchInvoices}
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
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Invoices</span>
              <FileCheck size={16} className="text-blue-600" />
            </div>
            <p className="mt-2 text-2xl font-black tracking-tight text-slate-900">{counts.total || 0}</p>
            <span className="mt-1 inline-block text-[11px] font-medium text-slate-400">All submissions</span>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-4.5 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Auto-Passed</span>
              <CheckCircle2 size={16} className="text-emerald-600" />
            </div>
            <p className="mt-2 text-2xl font-black tracking-tight text-emerald-700">{counts.auto_passed || 0}</p>
            <span className="mt-1 inline-block text-[11px] font-medium text-emerald-600/80">Deterministic verification</span>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-4.5 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Needs Review</span>
              <Clock size={16} className="text-amber-600" />
            </div>
            <p className="mt-2 text-2xl font-black tracking-tight text-amber-700">{counts.needs_review || 0}</p>
            <span className="mt-1 inline-block text-[11px] font-medium text-amber-600/80">Exceptions & low OCR</span>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-4.5 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Auto-Rejected</span>
              <Ban size={16} className="text-rose-600" />
            </div>
            <p className="mt-2 text-2xl font-black tracking-tight text-rose-700">{counts.auto_rejected || 0}</p>
            <span className="mt-1 inline-block text-[11px] font-medium text-rose-600/80">Policy & rule violations</span>
          </div>
        </div>

        {/* Filter Controls & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
          <div className="inline-flex rounded-xl border border-slate-200/90 bg-slate-100/80 p-1">
            {[
              { id: "all", label: "All Submissions", count: counts.total },
              { id: "needs_review", label: "Needs Review", count: counts.needs_review },
              { id: "auto_passed", label: "Auto-Passed", count: counts.auto_passed },
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
              placeholder="Search serial, invoice, or customer…"
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

        {/* Submissions Table */}
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
          {filteredSubmissions.length === 0 ? (
            <div className="p-14 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
                <FileCheck size={24} />
              </div>
              <h3 className="mt-3 text-sm font-bold text-slate-800">No Submissions Found</h3>
              <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
                {searchTerm || statusFilter !== "all"
                  ? "No invoices match your selected filter or search query."
                  : "Click 'Generate Demo Invoices' above to test the automated evaluation workflow."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-3">Submission / Customer</th>
                    <th className="px-5 py-3">Extracted Serial & Product</th>
                    <th className="px-5 py-3">Invoice Details</th>
                    <th className="px-5 py-3">OCR Confidence</th>
                    <th className="px-5 py-3">Validation State</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredSubmissions.map((sub) => {
                    const extracted = sub.extractedData || {};
                    const isPassed = sub.validationState === "auto_passed" || sub.validationState === "manually_approved";
                    const isRejected = sub.validationState === "auto_rejected" || sub.validationState === "manually_rejected";
                    const isReview = sub.validationState === "needs_review";

                    return (
                      <tr key={sub.submissionId} className="hover:bg-slate-50/60 transition-colors">
                        {/* Submission / Customer */}
                        <td className="px-5 py-3.5">
                          <div className="font-bold text-slate-900">{sub.submissionId}</div>
                          <div className="mt-0.5 text-[11px] text-slate-500 flex items-center gap-1.5">
                            <span className="font-medium text-slate-700">{sub.customerName}</span>
                            <span>•</span>
                            <span className="font-mono text-slate-400 truncate max-w-[100px]">
                              {sub.customerWallet ? `${sub.customerWallet.slice(0, 6)}…` : "Web2"}
                            </span>
                          </div>
                        </td>

                        {/* Extracted Serial & Product */}
                        <td className="px-5 py-3.5">
                          <div className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold text-slate-800 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                            {extracted.serialNumber || "N/A"}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-600 font-medium">
                            {extracted.productName || "Unknown Model"}
                          </div>
                        </td>

                        {/* Invoice Details */}
                        <td className="px-5 py-3.5">
                          <div className="font-medium text-slate-800">#{extracted.invoiceNumber || "N/A"}</div>
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            <span>{extracted.purchaseDate || "No date"}</span>
                            {extracted.sellerName && (
                              <span className="text-slate-400"> • {extracted.sellerName}</span>
                            )}
                          </div>
                        </td>

                        {/* OCR Confidence */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                                extracted.confidenceScore >= 90
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : extracted.confidenceScore >= 80
                                  ? "bg-blue-50 text-blue-700 border-blue-200"
                                  : "bg-amber-50 text-amber-700 border-amber-200"
                              }`}
                            >
                              {extracted.confidenceScore || 0}%
                            </span>
                            {extracted.confidenceScore < 80 && (
                              <span className="text-[10px] text-amber-600 font-semibold">Low</span>
                            )}
                          </div>
                        </td>

                        {/* Validation State Badge */}
                        <td className="px-5 py-3.5">
                          {isPassed && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                              <CheckCircle2 size={12} />
                              {sub.validationState === "manually_approved" ? "Approved (Manual)" : "Auto-Passed"}
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
                              {sub.validationState === "manually_rejected" ? "Rejected (Manual)" : "Auto-Rejected"}
                            </span>
                          )}
                          {sub.validationState === "pending" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600 border border-slate-200">
                              Pending Evaluation
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => setInspectingSub(sub)}
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
            INVOICE AUDIT & EXCEPTION RESOLUTION MODAL
        ========================================================================= */}
        {inspectingSub && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/60 backdrop-blur-xs overflow-hidden"
            onClick={() => setInspectingSub(null)}
          >
            <div
              className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Sticky Header with Always-Visible Cross Close Button */}
              <div className="flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4 shrink-0 z-10">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 border border-blue-100">
                    <FileText size={18} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-black text-slate-900 tracking-tight truncate">
                        Invoice Audit: {inspectingSub.submissionId}
                      </h2>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-600 shrink-0">
                        {inspectingSub.fileName}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">
                      Deterministic cross-verification against supplier inventory ledger.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setInspectingSub(null)}
                  title="Close (Esc)"
                  aria-label="Close modal"
                  className="ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition shadow-2xs"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Scrollable Content Body with a Single Internal Scrollbar */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {/* Customer Information Banner */}
                <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Customer Name</span>
                    <span className="font-bold text-slate-900 text-sm">{inspectingSub.customerName || "Customer"}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Customer Wallet</span>
                    <span className="font-mono text-xs text-slate-600">
                      {inspectingSub.customerWallet || "N/A"}
                    </span>
                  </div>
                </div>

                {/* Data Comparison Grid */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-1.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Extracted Serial Number</span>
                  <div className="font-mono text-xs font-bold text-slate-900">
                    {inspectingSub.extractedData?.serialNumber || "Unreadable"}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Confidence: <span className="font-bold text-blue-700">{inspectingSub.extractedData?.confidenceScore}%</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-1.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Seller & Tax ID</span>
                  <div className="font-semibold text-slate-900 truncate">
                    {inspectingSub.extractedData?.sellerName || "N/A"}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">
                    GSTIN: <span className="font-mono font-medium">{inspectingSub.extractedData?.sellerGstin || "Unlisted"}</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-1.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Invoice Number & Date</span>
                  <div className="font-semibold text-slate-900">
                    #{inspectingSub.extractedData?.invoiceNumber || "N/A"}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Date: <span className="font-medium text-slate-700">{inspectingSub.extractedData?.purchaseDate || "Unknown"}</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-1.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">File Integrity Hash</span>
                  <div className="font-mono text-[10px] text-slate-600 truncate" title={inspectingSub.fileHash}>
                    {inspectingSub.fileHash ? `${inspectingSub.fileHash.slice(0, 16)}…` : "Not computed"}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Identifies file re-upload (Does not prove issuer)
                  </div>
                </div>
              </div>

              {/* ─── Supplier Release & Inventory Verification Matrix ─── */}
              {inspectingSub.inventoryComparison && (
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <ShieldCheck size={13} className="text-blue-600" />
                    Supplier Inventory Verification Matrix
                  </label>
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-3 py-2 text-left font-bold text-slate-500 uppercase tracking-wider">Field</th>
                          <th className="px-3 py-2 text-left font-bold text-slate-500 uppercase tracking-wider">Invoice (Claimed)</th>
                          <th className="px-3 py-2 text-left font-bold text-slate-500 uppercase tracking-wider">Supplier Ledger</th>
                          <th className="px-3 py-2 text-center font-bold text-slate-500 uppercase tracking-wider w-16">Match</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {[
                          { label: 'Serial Number', data: inspectingSub.inventoryComparison.serialNumberMatch },
                          { label: 'Model Number', data: inspectingSub.inventoryComparison.modelMatch },
                          { label: 'Product Name', data: inspectingSub.inventoryComparison.productNameMatch },
                          { label: 'Brand', data: inspectingSub.inventoryComparison.brandMatch },
                          { label: 'Variant', data: inspectingSub.inventoryComparison.variantMatch },
                        ].map((row) => (
                          <tr key={row.label} className="hover:bg-slate-50/50">
                            <td className="px-3 py-1.5 font-semibold text-slate-700">{row.label}</td>
                            <td className="px-3 py-1.5 font-mono text-slate-600 truncate max-w-[140px]">{row.data?.claimed || 'N/A'}</td>
                            <td className="px-3 py-1.5 font-mono text-slate-600 truncate max-w-[140px]">{row.data?.supplier || 'N/A'}</td>
                            <td className="px-3 py-1.5 text-center">
                              {row.data?.match ? (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                                  <Check size={11} />
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-50 text-rose-600 border border-rose-200">
                                  <X size={11} />
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {/* Release Status Row */}
                        <tr className="hover:bg-slate-50/50 bg-blue-50/30">
                          <td className="px-3 py-1.5 font-semibold text-slate-700">On-Chain Release</td>
                          <td className="px-3 py-1.5 text-slate-600" colSpan={2}>
                            {inspectingSub.inventoryComparison.releaseStatus?.isAnchoredOnChain ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                                <CheckCircle2 size={12} /> Anchored — Batch {inspectingSub.inventoryComparison.releaseStatus.importBatchId || 'N/A'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-rose-700 font-medium">
                                <Ban size={12} /> Not Released (Merkle batch not committed)
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            {inspectingSub.inventoryComparison.releaseStatus?.isAnchoredOnChain ? (
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200"><Check size={11} /></span>
                            ) : (
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-50 text-rose-600 border border-rose-200"><X size={11} /></span>
                            )}
                          </td>
                        </tr>
                        {/* Timeline Validity */}
                        <tr className="hover:bg-slate-50/50 bg-blue-50/30">
                          <td className="px-3 py-1.5 font-semibold text-slate-700">Purchase ↔ Release Date</td>
                          <td className="px-3 py-1.5 font-mono text-slate-600">{inspectingSub.inventoryComparison.releaseStatus?.purchaseDate || 'N/A'}</td>
                          <td className="px-3 py-1.5 font-mono text-slate-600">{inspectingSub.inventoryComparison.releaseStatus?.receivedReleaseDate || 'N/A'}</td>
                          <td className="px-3 py-1.5 text-center">
                            {inspectingSub.inventoryComparison.releaseStatus?.timelineValid === true ? (
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200"><Check size={11} /></span>
                            ) : inspectingSub.inventoryComparison.releaseStatus?.timelineValid === false ? (
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-50 text-rose-600 border border-rose-200"><X size={11} /></span>
                            ) : (
                              <span className="text-slate-400 text-[10px]">—</span>
                            )}
                          </td>
                        </tr>
                        {/* Warranty Info */}
                        <tr className="hover:bg-slate-50/50">
                          <td className="px-3 py-1.5 font-semibold text-slate-700">Warranty Period</td>
                          <td className="px-3 py-1.5 text-slate-600" colSpan={2}>
                            <span className="font-medium">{inspectingSub.inventoryComparison.warrantyInfo?.supplierWarrantyMonths || '—'} months</span>
                            <span className="text-slate-400 ml-1.5">(start: {inspectingSub.inventoryComparison.warrantyInfo?.supplierWarrantyStartRule || '—'})</span>
                            {inspectingSub.inventoryComparison.warrantyInfo?.activatedExpiry && (
                              <span className="ml-1.5 text-emerald-700 font-medium">→ expires {inspectingSub.inventoryComparison.warrantyInfo.activatedExpiry}</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-50 text-blue-600 border border-blue-200"><Info size={11} /></span>
                          </td>
                        </tr>
                        {/* Inventory Status */}
                        <tr className="hover:bg-slate-50/50">
                          <td className="px-3 py-1.5 font-semibold text-slate-700">Inventory Status</td>
                          <td className="px-3 py-1.5" colSpan={2}>
                            <span className={`inline-flex items-center gap-1 font-bold text-[10px] uppercase px-2 py-0.5 rounded-md ${
                              inspectingSub.inventoryComparison.inventoryStatus === 'registered' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                              inspectingSub.inventoryComparison.inventoryStatus === 'unclaimed' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                              'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}>
                              {inspectingSub.inventoryComparison.inventoryStatus}
                            </span>
                            {inspectingSub.inventoryComparison.productId && (
                              <span className="ml-2 text-slate-400 font-mono text-[10px]">Product: {inspectingSub.inventoryComparison.productId}</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-50 text-blue-600 border border-blue-200"><Info size={11} /></span>
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
                  Evaluation Verdict & Reason Codes
                </label>
                {inspectingSub.reasonCodes && inspectingSub.reasonCodes.length > 0 ? (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {inspectingSub.reasonCodes.map((reason, idx) => (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                          reason.severity === "error"
                            ? "bg-rose-50 border-rose-200 text-rose-900"
                            : reason.severity === "warning"
                            ? "bg-amber-50 border-amber-200 text-amber-900"
                            : "bg-blue-50/80 border-blue-200 text-blue-900"
                        }`}
                      >
                        {reason.severity === "error" ? (
                          <Ban size={15} className="text-rose-600 shrink-0 mt-0.5" />
                        ) : reason.severity === "warning" ? (
                          <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                        ) : (
                          <CheckCircle2 size={15} className="text-blue-600 shrink-0 mt-0.5" />
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
                    Automated evaluation results will be displayed here once processed.
                  </div>
                )}
              </div>

                {/* Manual Override Actions (For Needs Review items) */}
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700">Manual Supplier Override</span>
                    <span className="text-slate-400 text-[11px]">Authorized agent decision</span>
                  </div>
                  <input
                    type="text"
                    value={overrideNotes}
                    onChange={(e) => setOverrideNotes(e.target.value)}
                    placeholder="Enter audit rationale for override (e.g. 'Verified physical receipt with retailer')…"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none shadow-2xs"
                  />
                </div>
              </div>

              {/* Sticky Modal Footer */}
              <div className="border-t border-slate-100 bg-slate-50/90 px-6 py-3.5 flex items-center justify-between shrink-0">
                <button
                  type="button"
                  onClick={() => setInspectingSub(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs"
                >
                  Close
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleRunEvaluation(inspectingSub.submissionId)}
                    disabled={evaluatingId === inspectingSub.submissionId}
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
                    Reject Submission
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOverride("approve")}
                    disabled={actionLoading}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 transition shadow-xs disabled:opacity-50"
                  >
                    Approve & Register
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
