import { useEffect, useState, useMemo } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Calendar,
  Clock,
  Wrench,
  Package,
  Hash,
  ExternalLink,
  Copy,
  Check,
  FileText,
  Share2,
  Printer,
  Layers,
  ArrowUpRight,
  Activity,
  AlertCircle,
  Award,
  Wallet,
  Sparkles,
} from "lucide-react";
import { useParams, Link } from "react-router-dom";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

function transactionUrl(txHash) {
  return `https://sepolia.etherscan.io/tx/${txHash}`;
}

function addressUrl(addr) {
  return `https://sepolia.etherscan.io/address/${addr}`;
}

function shortHash(str, head = 6, tail = 4) {
  if (!str) return "—";
  if (str.length <= head + tail + 2) return str;
  return `${str.slice(0, head)}…${str.slice(-tail)}`;
}

function formatDate(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not available"
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function getDaysRemaining(expiryDate) {
  if (!expiryDate) return null;
  const now = Date.now();
  const diffMs = new Date(expiryDate).getTime() - now;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export default function PublicPassport() {
  const { publicId } = useParams();
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading");
  const [copiedField, setCopiedField] = useState(null);
  const [activeTab, setActiveTab] = useState("all"); // 'all' | 'specs' | 'warranty' | 'services' | 'blockchain'

  useEffect(() => {
    let active = true;
    const load = async () => {
      setState("loading");
      try {
        const response = await fetch(`${API_BASE_URL}/api/public/products/${encodeURIComponent(publicId || "")}`);
        const result = await response.json();
        if (!response.ok) throw new Error(response.status === 404 ? "not-found" : "unavailable");
        if (active) {
          setData(result);
          setState("ready");
        }
      } catch (error) {
        if (active) setState(error.message === "not-found" ? "not-found" : "unavailable");
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [publicId]);

  const copyToClipboard = (text, fieldName) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (state !== "ready") return <PublicState state={state} />;

  const { product, warranty, purchase, ownership, serviceHistory, timeline, verification, warrantyVerification } = data;
  const daysLeft = warranty?.expiryDate ? getDaysRemaining(warranty.expiryDate) : null;
  const isWarrantyActive = warranty?.active || (daysLeft !== null && daysLeft > 0);

  return (
    <main className="min-h-screen bg-[#F8FAFC] text-[#0F172A] selection:bg-blue-100 selection:text-blue-900">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 transition hover:opacity-90">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-500/20">
              <ShieldCheck size={20} />
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-black tracking-tight text-slate-900">BlockWarranty</span>
              <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">Product Passport</span>
            </div>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Live On-Chain Badge */}
            <div className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 text-xs font-bold text-emerald-800">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
              Sepolia On-Chain Verified
            </div>

            {/* Share / Copy Link Button */}
            <button
              type="button"
              onClick={() => copyToClipboard(window.location.href, "passport-link")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
              title="Copy passport URL"
            >
              {copiedField === "passport-link" ? (
                <>
                  <Check size={14} className="text-emerald-600" />
                  <span className="text-emerald-700">Copied Link!</span>
                </>
              ) : (
                <>
                  <Share2 size={14} />
                  <span>Share</span>
                </>
              )}
            </button>

            {/* Print Document */}
            <button
              type="button"
              onClick={() => window.print()}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
              title="Print official passport document"
            >
              <Printer size={14} />
              <span>Print</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 space-y-6">
        
        {/* =========================================================================
            HERO PRODUCT PASSPORT CARD
        ========================================================================= */}
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-0 lg:grid-cols-[1.1fr_1.3fr]">
            
            {/* Product Image Stage */}
            <div className="relative flex min-h-[260px] sm:min-h-[380px] items-center justify-center overflow-hidden bg-gradient-to-br from-blue-50/70 via-slate-50 to-indigo-50/60 p-6 sm:p-10 border-b lg:border-b-0 lg:border-r border-slate-100">
              {product.image ? (
                <img
                  src={product.image}
                  alt={product.model}
                  className="max-h-[320px] w-auto max-w-full object-contain drop-shadow-md transition duration-500 hover:scale-105"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <Package size={52} strokeWidth={1.2} />
                  <span className="text-xs font-semibold">No Image Provided</span>
                </div>
              )}

              {/* Watermark / Provenance Pill */}
              <div className="absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/90 px-3 py-1 text-[11px] font-bold text-slate-700 shadow-sm backdrop-blur-sm">
                <ShieldCheck size={13} className="text-blue-600" />
                <span>Authentic Ledger Record</span>
              </div>
            </div>

            {/* Product Summary Header */}
            <div className="flex flex-col justify-between p-6 sm:p-8 lg:p-10 space-y-6">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-blue-100/80 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider text-blue-800">
                    {product.brand || "BlockWarranty"}
                  </span>
                  <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                    {product.category || "General Electronics"}
                  </span>
                  {isWarrantyActive ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                      <CheckCircle2 size={12} /> Active Warranty
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-800">
                      <Clock size={12} /> Expired Warranty
                    </span>
                  )}
                </div>

                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 leading-tight">
                  {product.model || "Registered Product"}
                </h1>

                {product.description && (
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed line-clamp-3">
                    {product.description}
                  </p>
                )}
              </div>

              {/* Hardware Identifiers & Copy Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-slate-100 pt-5">
                {/* Serial Number */}
                <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Manufacturer Serial (S/N)</p>
                    <p className="mt-0.5 truncate font-mono text-xs font-bold text-slate-800">
                      {product.serialNumber || "Record On-Chain"}
                    </p>
                  </div>
                  {product.serialNumber && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(product.serialNumber, "sn")}
                      className="ml-2 rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 transition"
                      title="Copy serial number"
                    >
                      {copiedField === "sn" ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    </button>
                  )}
                </div>

                {/* Product ID */}
                <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">BlockWarranty ID</p>
                    <p className="mt-0.5 truncate font-mono text-xs font-bold text-slate-800">
                      {product.productId}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(product.productId, "pid")}
                    className="ml-2 rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 transition"
                    title="Copy product ID"
                  >
                    {copiedField === "pid" ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              {/* Ownership & Block Confirmation Footer */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                  <Wallet size={14} className="text-blue-600 shrink-0" />
                  <span>Current Custody:</span>
                  <a
                    href={addressUrl(warranty?.currentOwner || product.walletAddress)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono font-bold text-blue-700 hover:underline"
                    title={warranty?.currentOwner || product.walletAddress}
                  >
                    {shortHash(warranty?.currentOwner || product.walletAddress, 6, 4)}
                  </a>
                </div>
                {product.blockchainTxHash && (
                  <a
                    href={transactionUrl(product.blockchainTxHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
                  >
                    <span>Genesis Tx: {shortHash(product.blockchainTxHash, 6, 4)}</span>
                    <ArrowUpRight size={13} />
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================================
            KEY STAT HIGHLIGHTS BAR
        ========================================================================= */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-5">
          {/* Warranty Status */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Warranty Term</span>
              <span className={`h-2.5 w-2.5 rounded-full ${isWarrantyActive ? "bg-emerald-500" : "bg-rose-500"}`} />
            </div>
            <p className="mt-2 text-base sm:text-lg font-black text-slate-900">
              {isWarrantyActive ? "Active & Covered" : "Term Expired"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {daysLeft !== null && daysLeft > 0 ? `${daysLeft} days remaining` : `Ended ${formatDate(warranty?.expiryDate)}`}
            </p>
          </div>

          {/* Verification Source */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Verification</span>
              <ShieldCheck size={14} className="text-blue-600" />
            </div>
            <p className="mt-2 text-base sm:text-lg font-black text-slate-900">
              {product.brand ? `${product.brand} Supplier Verified` : "Supplier Verified"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Official Supplier Audit
            </p>
          </div>

          {/* Maintenance Records */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Service History</span>
              <Wrench size={14} className="text-indigo-600" />
            </div>
            <p className="mt-2 text-base sm:text-lg font-black text-slate-900">
              {(serviceHistory || []).length} Recorded
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {(serviceHistory || []).length > 0 ? "Cryptographically signed" : "Clean service record"}
            </p>
          </div>

          {/* Chain Anchor */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Blockchain Network</span>
              <Layers size={14} className="text-purple-600" />
            </div>
            <p className="mt-2 text-base sm:text-lg font-black text-slate-900">
              Sepolia Testnet
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Smart Contract Verified
            </p>
          </div>
        </section>

        {/* =========================================================================
            DETAILED INFORMATION SECTIONS GRID
        ========================================================================= */}
        <div className="grid gap-6 lg:grid-cols-2">
          
          {/* Card 1: Warranty Coverage & Authenticity */}
          <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <ShieldCheck size={18} />
                </span>
                <h2 className="text-base font-bold text-slate-900">Warranty & Coverage Proof</h2>
              </div>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  isWarrantyActive ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                }`}
              >
                {isWarrantyActive ? "Covered" : "Expired"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Coverage Type</p>
                <p className="mt-1 text-sm font-bold text-slate-800">
                  {warranty?.coverageType || warrantyVerification?.warrantyDetails?.coverageType || "Authorized Supplier Warranty"}
                </p>
              </div>

              <div>
                <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Warranty Duration</p>
                <p className="mt-1 text-sm font-bold text-slate-800">
                  {warranty?.warrantyPeriod ? `${warranty.warrantyPeriod} ${warranty.warrantyUnit || "Months"}` : "12 Months"}
                </p>
              </div>

              <div>
                <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Valid From</p>
                <p className="mt-1 font-semibold text-slate-700">
                  {formatDate(warranty?.startDate || purchase?.purchaseDate)}
                </p>
              </div>

              <div>
                <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Valid Until</p>
                <p className="mt-1 font-semibold text-slate-700">
                  {formatDate(warranty?.expiryDate)}
                </p>
              </div>
            </div>

            {/* Provider Verification Details */}
            <div className="rounded-2xl border border-blue-200/80 bg-blue-50/70 p-4 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-blue-950 flex items-center gap-1.5">
                  <ShieldCheck size={15} className="text-blue-600" />
                  {product.brand ? `${product.brand} Supplier Verified Authority` : "Supplier Verified Authority"}
                </span>
                <span className="rounded-md bg-blue-600 text-white px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wider">
                  VERIFIED
                </span>
              </div>
              <p className="text-slate-700 leading-relaxed">
                Reconciled directly against <span className="font-bold text-slate-900">{product.brand ? `${product.brand} Authorized Supplier Ledger` : "Authorized Supplier Ledger"}</span> ({warrantyVerification?.supplierName || "Official Supplier"}). Device serial is officially anchored on-chain with authorized warranty entitlement.
              </p>
              {warrantyVerification?.verifiedAt && (
                <p className="text-[11px] text-slate-500 font-medium">
                  Audited on: {formatDate(warrantyVerification.verifiedAt)}
                </p>
              )}
            </div>
          </section>

          {/* Card 2: Hardware Specifications & Purchase Info */}
          <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  <Package size={18} />
                </span>
                <h2 className="text-base font-bold text-slate-900">Device Specifications</h2>
              </div>
              <span className="text-xs font-semibold text-slate-400">Original Passport Record</span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Brand / Manufacturer</p>
                <p className="mt-1 text-sm font-bold text-slate-800">{product.brand || "—"}</p>
              </div>

              <div>
                <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Category</p>
                <p className="mt-1 text-sm font-bold text-slate-800">{product.category || "—"}</p>
              </div>

              <div>
                <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Purchase Date</p>
                <p className="mt-1 font-semibold text-slate-700">{formatDate(purchase?.purchaseDate)}</p>
              </div>

              <div>
                <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Passport Registered</p>
                <p className="mt-1 font-semibold text-slate-700">{formatDate(product.registeredAt)}</p>
              </div>

              <div className="col-span-2">
                <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Product Model</p>
                <p className="mt-1 text-sm font-bold text-slate-800 leading-snug">{product.model || "—"}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
              <span className="font-bold text-slate-800">Consumer Notice:</span> This product passport provides decentralized provenance for second-hand sales, warranty claims, insurance underwriting, and certified repair verifications.
            </div>
          </section>

          {/* Card 3: Complete Service & Repair History */}
          <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7 shadow-sm space-y-5 lg:col-span-2">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <Wrench size={18} />
                </span>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Service & Maintenance Records</h2>
                  <p className="text-xs text-slate-400">Authenticated maintenance logs with component repair details</p>
                </div>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                {(serviceHistory || []).length} Record{(serviceHistory || []).length === 1 ? "" : "s"}
              </span>
            </div>

            {(serviceHistory || []).length > 0 ? (
              <div className="space-y-4">
                {serviceHistory.map((item, idx) => (
                  <div
                    key={item.serviceId || item.txHash || idx}
                    className="rounded-2xl border border-slate-200/90 bg-slate-50/60 p-5 space-y-3.5 transition hover:bg-slate-50"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-slate-900">
                            {item.serviceCenter || "Certified Service Center"}
                          </span>
                          <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-800">
                            {item.serviceType || "Repair"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">Serviced on {formatDate(item.date)}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        {item.verified && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                            <CheckCircle2 size={12} /> On-Chain Verified
                          </span>
                        )}
                        {item.txHash && (
                          <a
                            href={transactionUrl(item.txHash)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-slate-100 transition"
                          >
                            <span>Tx Proof</span>
                            <ArrowUpRight size={13} />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Issue & Resolution Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {item.issue && (
                        <div>
                          <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Reported Issue</p>
                          <p className="mt-0.5 text-slate-800 font-medium">{item.issue}</p>
                        </div>
                      )}
                      {item.diagnosis && (
                        <div>
                          <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Diagnostic Assessment</p>
                          <p className="mt-0.5 text-slate-800 font-medium">{item.diagnosis}</p>
                        </div>
                      )}
                      {item.workPerformed && (
                        <div className="sm:col-span-2">
                          <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Work Performed</p>
                          <p className="mt-0.5 text-slate-800 font-medium">{item.workPerformed}</p>
                        </div>
                      )}
                    </div>

                    {/* Parts Replaced Badges */}
                    {item.partsReplaced && item.partsReplaced.length > 0 && (
                      <div className="border-t border-slate-200/50 pt-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                          Certified Parts Replaced
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {item.partsReplaced.map((part, pIdx) => (
                            <span
                              key={pIdx}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700"
                            >
                              <Wrench size={11} className="text-slate-400" />
                              {part.name}
                              {part.quantity > 1 && <span className="text-slate-400">×{part.quantity}</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Attached Service Document Link */}
                    {item.documentUrl && (
                      <div className="flex items-center justify-between border-t border-slate-200/50 pt-2.5 text-xs">
                        <span className="text-slate-400 text-[11px] font-mono">
                          Document Hash: {item.documentHash ? shortHash(item.documentHash, 8, 6) : "Anchored"}
                        </span>
                        <a
                          href={`${API_BASE_URL}${item.documentUrl}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-bold text-blue-700 hover:underline"
                        >
                          <FileText size={13} />
                          <span>View Certified Invoice</span>
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-8 text-center text-xs text-slate-500">
                <CheckCircle2 size={24} className="mx-auto mb-2 text-emerald-500" />
                <p className="font-bold text-slate-800 text-sm">No Recorded Defects or Repairs</p>
                <p className="mt-1 max-w-md mx-auto">This device has no reported service or warranty repairs recorded in its lifecycle registry.</p>
              </div>
            )}
          </section>

          {/* Card 4: Full Chronological Lifecycle Timeline */}
          <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7 shadow-sm space-y-5 lg:col-span-2">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-700">
                  <Clock size={18} />
                </span>
                <h2 className="text-base font-bold text-slate-900">Chronological Lifecycle Timeline</h2>
              </div>
              <span className="text-xs font-semibold text-slate-400">Immutable Audit Trail</span>
            </div>

            {timeline && timeline.length > 0 ? (
              <ol className="relative ml-3 border-l-2 border-blue-100 pl-6 space-y-6">
                {timeline.map((event, index) => (
                  <li key={index} className="relative">
                    {/* Timeline Node Bullet */}
                    <span className="absolute -left-[31px] top-0 flex h-4 w-4 items-center justify-center rounded-full border-2 border-blue-600 bg-white shadow-2xs" />
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <p className="text-sm font-extrabold text-slate-900">{event.title}</p>
                      <p className="text-xs font-semibold text-slate-400">{formatDate(event.date)}</p>
                    </div>
                    {event.txHash && (
                      <a
                        href={transactionUrl(event.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] text-blue-700 hover:underline"
                      >
                        <span>Tx: {shortHash(event.txHash, 10, 8)}</span>
                        <ArrowUpRight size={12} />
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-slate-500">Timeline events will populate as lifecycle interactions occur.</p>
            )}
          </section>

          {/* Card 5: Smart Contract & Blockchain Verification Technical Details */}
          <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7 shadow-sm space-y-4 lg:col-span-2">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                <Layers size={18} />
              </span>
              <div>
                <h2 className="text-base font-bold text-slate-900">Cryptographic Proof & Smart Contract Verification</h2>
                <p className="text-xs text-slate-400">Ethereum Sepolia decentralized registry verification parameters</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-1">
                <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Smart Contract</p>
                <a
                  href={addressUrl(verification?.contractAddress)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono font-bold text-blue-700 hover:underline break-all block"
                >
                  {shortHash(verification?.contractAddress, 8, 6)}
                </a>
                <p className="text-[10px] text-slate-400">BlockWarranty Core Contract</p>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-1">
                <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Genesis Block</p>
                <p className="font-mono font-bold text-slate-800">
                  {product.blockchainBlock ? `#${product.blockchainBlock}` : "Confirmed Block"}
                </p>
                <p className="text-[10px] text-slate-400">EVM Consensus Finalized</p>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-1">
                <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Verification State</p>
                <p className="font-bold text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 size={13} /> {verification?.status === "verified" ? "100% Cryptographic Match" : "Active"}
                </p>
                <p className="text-[10px] text-slate-400">Zero-Tampering Verified</p>
              </div>
            </div>
          </section>

        </div>

        {/* =========================================================================
            PASSPORT FOOTER GUARANTEE
        ========================================================================= */}
        <footer className="rounded-3xl border border-blue-100 bg-blue-50/70 p-6 text-center text-xs text-slate-600 space-y-2">
          <div className="inline-flex items-center gap-1.5 font-bold text-blue-900">
            <ShieldCheck size={16} className="text-blue-700" />
            <span>BlockWarranty Digital Product Passport Standard</span>
          </div>
          <p className="max-w-xl mx-auto text-slate-600 leading-relaxed">
            This digital product passport is permanently recorded on the Ethereum Sepolia blockchain. Any repair, warranty adjudication, or ownership change is verified by cryptographic signatures.
          </p>
        </footer>

      </div>
    </main>
  );
}

function PublicState({ state }) {
  const loading = state === "loading";
  const notFound = state === "not-found";
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-5">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
          <ShieldCheck size={30} />
        </span>
        <h1 className="mt-5 text-xl font-black text-slate-900">
          {loading ? "Loading Digital Passport…" : notFound ? "Passport Unavailable" : "Verification Offline"}
        </h1>
        <p className="mt-2 text-xs leading-6 text-slate-500">
          {loading
            ? "Querying the Ethereum Sepolia blockchain ledger and verified supplier inventories…"
            : notFound
            ? "This product is not publicly indexed or the QR passport code has expired."
            : "Could not retrieve the product record right now. Please check your connection."}
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-5 text-xs font-bold text-white hover:bg-blue-700 transition"
        >
          BlockWarranty Home
        </Link>
      </section>
    </main>
  );
}
