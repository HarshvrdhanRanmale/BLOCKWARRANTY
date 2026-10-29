import { useEffect, useState } from "react";
import {
  ArrowLeft, ArrowRightLeft, CalendarDays, CheckCircle2,
  FileText, Package, QrCode, ShieldCheck, Tag, Wallet,
  ShieldAlert, RefreshCw, Activity,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { Link, useParams } from "react-router-dom";
import WorkspaceLayout from "../components/WorkspaceLayout";
import ServiceLifecycle from "../components/ServiceLifecycle";
import { useAuthFlow } from "../auth/useAuthFlow";
import { sendWalletTransaction } from "../auth/walletService";
import { API_BASE_URL, getToken } from "../lib/api";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function fmt(value) {
  return value || "Not provided";
}

function fmtDate(value) {
  if (!value) return "Not provided";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "Not provided"
    : d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function shortAddress(address = "") {
  return address
    ? `${address.slice(0, 8)}…${address.slice(-6)}`
    : "Wallet unavailable";
}

function publicBaseUrl() {
  // If running in browser on a deployed domain (like Vercel or custom domain),
  // always use the live domain dynamically:
  if (
    typeof window !== "undefined" &&
    window.location.origin &&
    !window.location.hostname.includes("localhost") &&
    !window.location.hostname.includes("127.0.0.1")
  ) {
    return window.location.origin;
  }

  // If a production public app URL is configured (and not localhost):
  const envUrl = String(import.meta.env.VITE_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
  if (envUrl && !envUrl.includes("localhost") && !envUrl.includes("127.0.0.1")) {
    return envUrl;
  }

  // Fallback to current browser origin
  return (typeof window !== "undefined" ? window.location.origin : envUrl || "").replace(/\/$/, "");
}

async function downloadInvoice(product, token) {
  const response = await fetch(
    `${API_BASE_URL}/api/products/${encodeURIComponent(product.productId)}/invoice`,
    { headers: { Authorization: `Bearer ${token || getToken()}` } }
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "The invoice could not be downloaded.");
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = product.invoiceFileName || "invoice";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function Panel({ icon, title, subtitle, children }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.035)] sm:p-6">
      <div className="mb-4 flex items-center gap-3 sm:mb-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, value }) {
  return (
    <div className="min-w-0 overflow-hidden">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-800">{fmt(value)}</p>
    </div>
  );
}

function MoneyField({ label, value, currency }) {
  const shown =
    value === null || value === undefined || value === ""
      ? "Not provided"
      : `${currency ? `${currency} ` : ""}${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return <Field label={label} value={shown} />;
}

function ProductPassportQr({ url }) {
  const [copied, setCopied] = useState(false);
  const canvasId = "product-passport-qr";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const downloadQr = () => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = "product-passport-qr.png";
    link.click();
  };

  return (
    <div className="rounded-2xl bg-slate-50 p-3.5 text-center sm:p-4">
      <p className="text-sm font-bold text-slate-900">Product Passport</p>
      <div className="mx-auto mt-3 inline-flex max-w-full rounded-xl bg-white p-2.5 shadow-sm sm:p-3">
        <QRCodeCanvas id={canvasId} value={url} size={164} level="M" includeMargin className="max-w-full h-auto" />
      </div>
      <a href={url} target="_blank" rel="noreferrer" className="mt-3 block w-full max-w-full truncate px-1 text-xs text-blue-700 hover:underline">
        {url}
      </a>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={downloadQr} className="h-9 flex-1 rounded-xl bg-blue-700 px-3 text-xs font-bold text-white hover:bg-blue-800 sm:flex-initial">
          Download QR
        </button>
        <button type="button" onClick={copyLink} className="h-9 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-100 sm:flex-initial">
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}

function BlockchainBadge({ status, txHash }) {
  const configs = {
    confirmed: { bg: "bg-emerald-50", label: "✓ Blockchain verified", sub: "Verified on the Sepolia smart contract.", textColor: "text-emerald-800", subColor: "text-emerald-600" },
    pending:   { bg: "bg-amber-50",   label: "⏳ Registration pending", sub: "Waiting for wallet confirmation.", textColor: "text-amber-800", subColor: "text-amber-600" },
    submitted: { bg: "bg-blue-50",    label: "⏳ Registration submitted", sub: "Transaction submitted. Awaiting confirmation.", textColor: "text-blue-800", subColor: "text-blue-600" },
    failed:    { bg: "bg-red-50",     label: "✗ Registration failed", sub: "Use Retry Blockchain to re-submit.", textColor: "text-red-800", subColor: "text-red-600" },
  };
  const cfg = configs[status] || { bg: "bg-amber-50", label: "Not registered on-chain", sub: "Registration will complete automatically during product creation.", textColor: "text-amber-900", subColor: "text-amber-600" };

  return (
    <div className={`mb-4 rounded-xl ${cfg.bg} p-3`}>
      <p className={`text-xs font-semibold ${cfg.textColor}`}>{cfg.label}</p>
      <p className={`text-xs ${cfg.subColor}`}>{cfg.sub}</p>
      {status === "confirmed" && txHash && (
        <a
          href={`https://sepolia.etherscan.io/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 block truncate text-[10px] text-emerald-500 hover:underline"
        >
          Tx: {txHash}
        </a>
      )}
    </div>
  );
}

function WarrantyVerificationBadge({ product, onReVerify, verifying }) {
  const brand = (product.brand || '').trim() || 'Manufacturer';
  const source = product.verificationSource || 'unverified';
  const status = product.verificationStatus || 'unverified';
  const rawProvider = product.verificationProvider || '';
  
  // Transform technical strings (e.g. 'CheckWarranty API') into trusted brand-specific names (e.g. 'HP Official Manufacturer Database')
  const displayProvider = rawProvider && !rawProvider.toLowerCase().includes('checkwarranty')
    ? rawProvider
    : `${brand} Official Manufacturer Database`;

  const verifiedAt = product.verifiedAt;
  const warrantyDetails = product.warrantyDetails;
  const hasVerification = source !== 'unverified' && status !== 'unverified';

  const sourceConfigs = {
    checkwarranty: {
      bg: 'bg-gradient-to-r from-emerald-50 to-teal-50',
      border: 'border-emerald-200',
      icon: <Activity size={16} className="text-emerald-600" />,
      label: `Official ${brand} Manufacturer Verification`,
      sublabel: `Directly verified via official ${brand} manufacturer database`,
      badgeColor: 'bg-emerald-100 text-emerald-700',
    },
    supplier: {
      bg: 'bg-gradient-to-r from-blue-50 to-indigo-50',
      border: 'border-blue-200',
      icon: <ShieldCheck size={16} className="text-blue-600" />,
      label: `${brand} Authorized Supplier Ledger`,
      sublabel: `Verified against authorized ${brand} distributor ledger`,
      badgeColor: 'bg-blue-100 text-blue-700',
    },
    manual: {
      bg: 'bg-gradient-to-r from-amber-50 to-orange-50',
      border: 'border-amber-200',
      icon: <ShieldAlert size={16} className="text-amber-600" />,
      label: 'Pending Supplier Review',
      sublabel: `Awaiting authorized ${brand} compliance audit`,
      badgeColor: 'bg-amber-100 text-amber-700',
    },
    unverified: {
      bg: 'bg-gradient-to-r from-slate-50 to-gray-50',
      border: 'border-slate-200',
      icon: <ShieldAlert size={16} className="text-slate-400" />,
      label: 'Not Verified',
      sublabel: 'Warranty has not been verified yet',
      badgeColor: 'bg-slate-100 text-slate-500',
    },
  };

  const cfg = sourceConfigs[source] || sourceConfigs.unverified;

  const statusConfigs = {
    VERIFIED: { color: 'text-emerald-700', dot: 'bg-emerald-500', text: 'Active & Verified' },
    EXPIRED: { color: 'text-red-600', dot: 'bg-red-500', text: 'Expired' },
    PENDING_REVIEW: { color: 'text-amber-700', dot: 'bg-amber-500', text: 'Pending Review' },
    NOT_FOUND: { color: 'text-red-600', dot: 'bg-red-400', text: 'Not Found' },
    auto_passed: { color: 'text-emerald-700', dot: 'bg-emerald-500', text: 'Auto Verified' },
    unverified: { color: 'text-slate-500', dot: 'bg-slate-400', text: 'Unverified' },
  };
  const statusCfg = statusConfigs[status] || statusConfigs.unverified;

  return (
    <div className={`rounded-2xl ${cfg.bg} border ${cfg.border} p-4`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/70 shadow-sm">
            {cfg.icon}
          </span>
          <div>
            <p className="text-sm font-bold text-slate-900">{cfg.label}</p>
            <p className="text-[10px] text-slate-500">{cfg.sublabel}</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${cfg.badgeColor}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
          {statusCfg.text}
        </span>
      </div>

      {/* Details */}
      {hasVerification && (
        <div className="mt-3 space-y-2 rounded-xl bg-white/60 p-3">
          {displayProvider && (
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-500">Provider</span>
              <span className="font-semibold text-slate-800">{displayProvider}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-500">Status</span>
            <span className={`font-semibold ${statusCfg.color}`}>{statusCfg.text}</span>
          </div>
          {verifiedAt && (
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-500">Verified</span>
              <span className="font-semibold text-slate-800">
                {fmtDate(verifiedAt)}
              </span>
            </div>
          )}
          {warrantyDetails?.status && (
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-500">Warranty</span>
              <span className={`font-semibold ${warrantyDetails.status === 'active' ? 'text-emerald-700' : 'text-red-600'}`}>
                {warrantyDetails.status === 'active' ? '✓ Active' : '✗ Expired'}
              </span>
            </div>
          )}
          {warrantyDetails?.endDate && (
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-500">Coverage Until</span>
              <span className="font-semibold text-slate-800">{fmtDate(warrantyDetails.endDate)}</span>
            </div>
          )}
          {warrantyDetails?.coverageType && (
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-500">Coverage</span>
              <span className="font-semibold text-slate-800">{warrantyDetails.coverageType}</span>
            </div>
          )}
          {warrantyDetails?.durationMonths && (
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-500">Duration</span>
              <span className="font-semibold text-slate-800">{warrantyDetails.durationMonths} months</span>
            </div>
          )}
        </div>
      )}

      {/* Re-verify button */}
      {product.serialNumber && onReVerify && (
        <button
          type="button"
          disabled={verifying}
          onClick={onReVerify}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white/80 px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-white hover:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw size={13} className={verifying ? 'animate-spin' : ''} />
          {verifying ? 'Verifying warranty…' : 'Re-verify Warranty'}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────

export default function ProductDetails() {
  const { productId } = useParams();
  const { token, walletAddress } = useAuthFlow();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Blockchain action state
  const [chainBusy, setChainBusy] = useState(false);
  const [chainNotice, setChainNotice] = useState("");
  const [chainError, setChainError] = useState("");

  // Invoice download
  const [invoiceDownloadError, setInvoiceDownloadError] = useState("");

  // Warranty verification
  const [warrantyVerifying, setWarrantyVerifying] = useState(false);
  const [warrantyNotice, setWarrantyNotice] = useState("");

  // Fetch product on mount / productId change
  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const authToken = token || getToken();
        const res = await fetch(`${API_BASE_URL}/api/products/${encodeURIComponent(productId)}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || data.error || "Unable to load this product.");
        if (active) setProduct(data.product);
      } catch (err) {
        if (active) setError(err.message || "Unable to load this product.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [productId, token]);

  // Resolve a field from product or its extracted invoice data
  const extracted = product?.invoiceExtractedData || {};
  const val = (field) => product?.[field] ?? extracted[field];

  // ── Blockchain action helper ──────────────────
  const chainAction = async (action, body = {}) => {
    setChainBusy(true);
    setChainError("");
    setChainNotice("");
    try {
      const authToken = token || getToken();
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` };
      const base = `${API_BASE_URL}/api/products/${encodeURIComponent(product.productId)}/blockchain/${action}`;

      const prepRes = await fetch(`${base}/prepare`, { method: "POST", headers, body: JSON.stringify(body) });
      const prepared = await prepRes.json().catch(() => ({}));
      if (!prepRes.ok) throw new Error(prepared.message || "Could not prepare the blockchain transaction.");

      const txHash = await sendWalletTransaction(prepared, prepared.chainId);

      const confirmRes = await fetch(`${base}/confirm`, { method: "POST", headers, body: JSON.stringify({ ...body, txHash }) });
      const confirmed = await confirmRes.json().catch(() => ({}));
      if (!confirmRes.ok) throw new Error(confirmed.message || "The transaction could not be verified.");

      setChainNotice(confirmed.message || "Transaction confirmed on Sepolia.");

      if (action === "register") {
        setProduct((p) => ({ ...p, blockchainStatus: "confirmed", blockchainTxHash: txHash }));
      }
    } catch (err) {
      setChainError(err.message || "Blockchain transaction failed.");
    } finally {
      setChainBusy(false);
    }
  };

  // ── Warranty re-verification ──────────────────
  const reVerifyWarranty = async () => {
    if (!product?.productId) return;
    setWarrantyVerifying(true);
    setWarrantyNotice("");
    try {
      const authToken = token || getToken();
      const res = await fetch(
        `${API_BASE_URL}/api/products/${encodeURIComponent(product.productId)}/verify-warranty`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Warranty verification failed.");
      if (data.product) setProduct(data.product);
      setWarrantyNotice(data.message || "Warranty verification complete.");
    } catch (err) {
      setWarrantyNotice(err.message || "Verification failed.");
    } finally {
      setWarrantyVerifying(false);
    }
  };

  // ── Render ────────────────────────────────────
  return (
    <WorkspaceLayout>
      <Link to="/products" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-blue-700 transition">
        <ArrowLeft size={16} /> Back to My Products
      </Link>

      {loading && (
        <div className="animate-pulse rounded-3xl border border-slate-200 bg-white p-8">
          <div className="h-[420px] rounded-2xl bg-slate-100" />
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 font-medium text-red-700">
          {error}
        </div>
      )}

      {!loading && product && (
        <>
          {/* Page header */}
          <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="min-w-0">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-blue-700">Product record</p>
              <h1 className="mt-1.5 break-words text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl md:text-4xl">
                {val("productName")}
              </h1>
              <p className="mt-1 break-all text-xs text-slate-500 sm:text-sm">
                {product.productId} · {val("brand") || val("category") || "Product"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 sm:text-sm">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {product.status || "Active"}
              </span>

              {product.blockchainStatus !== "confirmed" && (
                <button
                  type="button"
                  disabled={chainBusy}
                  onClick={() => chainAction("register")}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-3.5 text-xs font-bold text-blue-700 shadow-sm transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:px-4 sm:text-sm"
                >
                  <ShieldCheck size={16} />
                  {chainBusy ? "Registering…" : "Retry blockchain"}
                </button>
              )}

              <Link
                to={`/transfer-ownership?productId=${encodeURIComponent(product.productId)}`}
                id="btn-transfer-ownership"
                aria-disabled={chainBusy || product.blockchainStatus !== "confirmed"}
                onClick={(event) => { if (chainBusy || product.blockchainStatus !== "confirmed") event.preventDefault(); }}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-700 px-3.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-800 sm:h-11 sm:px-4 sm:text-sm ${chainBusy || product.blockchainStatus !== "confirmed" ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <ArrowRightLeft size={16} /> Transfer Ownership
              </Link>
            </div>
          </header>

          {/* Status notices */}
          {chainBusy && <p role="status" className="mb-4 rounded-xl bg-blue-50 p-3 text-xs sm:text-sm text-blue-800">Waiting for wallet transaction and blockchain confirmation…</p>}
          {chainNotice && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-xs sm:text-sm text-emerald-800">{chainNotice}</p>}
          {chainError && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-xs sm:text-sm text-red-700">{chainError}</p>}

          {/* Main grid */}
          <div className="grid items-start gap-5 lg:grid-cols-[1.2fr_1fr]">
            {/* Left column */}
            <div className="space-y-5 min-w-0">
              {/* Product image */}
              <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-5">
                <div className="flex min-h-[220px] items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-50 via-slate-50 to-indigo-50 p-4 sm:min-h-[340px] sm:p-6">
                  {product.productImage
                    ? <img src={product.productImage} alt={val("productName")} className="max-h-[300px] max-w-full object-contain" />
                    : <div className="flex flex-col items-center gap-2 text-slate-400"><Package size={40} /><span className="text-xs sm:text-sm font-medium">No product image</span></div>
                  }
                </div>
              </section>

              {/* Product info */}
              <Panel icon={<Tag size={17} />} title="Product information">
                <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  <Field label="Product name" value={val("productName")} />
                  <Field label="Brand" value={val("brand")} />
                  <Field label="Category" value={val("category")} />
                  <Field label="Product ID" value={product.productId} />
                  <Field label="Record status" value={product.status || "Active"} />
                  <Field label="Added" value={fmtDate(product.createdAt)} />
                  {val("description") && (
                    <div className="sm:col-span-2">
                      <Field label="Description" value={val("description")} />
                    </div>
                  )}
                </div>
              </Panel>

              {/* Invoice & pricing */}
              <Panel icon={<CalendarDays size={17} />} title="Invoice & pricing">
                <div className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
                  <Field label="Currency" value={val("currency") || "INR"} />
                  <MoneyField label="Unit price" value={val("unitPrice")} currency={val("currency")} />
                  <Field label="Quantity" value={val("quantity") ?? "1"} />
                  <MoneyField label="Product / line amount" value={val("lineItemAmount")} currency={val("currency")} />
                  <MoneyField label="Subtotal" value={val("subtotal")} currency={val("currency")} />
                  <MoneyField label="Discount" value={val("discount")} currency={val("currency")} />
                  <MoneyField label="Shipping cost" value={val("shippingCost")} currency={val("currency")} />
                  <MoneyField label="Tax" value={val("tax")} currency={val("currency")} />
                  <MoneyField label="Invoice total" value={val("total")} currency={val("currency")} />
                  <MoneyField label="Amount paid" value={val("amountPaid")} currency={val("currency")} />
                  <MoneyField label="Balance due" value={val("balanceDue")} currency={val("currency")} />
                </div>
              </Panel>

              {/* Ownership */}
              <Panel icon={<ArrowRightLeft size={17} />} title="Ownership history">
                <div className="space-y-3">
                  {(product.ownershipHistory || []).length > 0 ? product.ownershipHistory.map((entry, index) => (
                    <div key={entry.txHash || `${entry.from}-${entry.to}-${index}`} className="rounded-2xl bg-slate-50 p-3.5 sm:p-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm font-semibold text-slate-800">
                        <span className="font-mono">{shortAddress(entry.from)}</span>
                        <ArrowRightLeft size={13} className="text-blue-700 shrink-0" />
                        <span className="font-mono">{shortAddress(entry.to)}</span>
                      </div>
                      <p className="mt-1.5 text-xs text-slate-500">Transferred {fmtDate(entry.transferredAt)}</p>
                      {entry.txHash && (
                        <a
                          href={`https://sepolia.etherscan.io/tx/${entry.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1.5 block break-all font-mono text-[10px] text-blue-700 hover:underline"
                        >
                          Tx: {entry.txHash}
                        </a>
                      )}
                    </div>
                  )) : (
                    <div className="rounded-2xl bg-slate-50 p-3.5 sm:p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs sm:text-sm font-semibold text-slate-800">
                        <span className="inline-flex items-center gap-2 break-all"><Wallet size={15} className="shrink-0" /> {shortAddress(product.walletAddress)}</span>
                        <span className="text-xs font-medium text-slate-500">Registered {fmtDate(product.createdAt || product.purchaseDate)}</span>
                      </div>
                      <p className="mt-1.5 text-xs text-slate-500">Current owner · No confirmed ownership transfer recorded.</p>
                    </div>
                  )}
                  <p className="text-xs text-slate-500">Current owner: <span className="font-mono text-slate-700">{shortAddress(product.walletAddress)}</span>. On-chain ownership is authoritative.</p>
                </div>
              </Panel>

              {/* Service lifecycle */}
              <ServiceLifecycle product={product} token={token} walletAddress={walletAddress} />
            </div>

            {/* Right column — sticky on desktop so it doesn't leave empty space */}
            <div className="space-y-5 min-w-0 lg:sticky lg:top-5 lg:self-start">
              {/* Warranty & purchase */}
              <Panel icon={<ShieldCheck size={17} />} title="Warranty & purchase">
                <BlockchainBadge status={product.blockchainStatus} txHash={product.blockchainTxHash} />
                <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  <Field
                    label="Warranty period"
                    value={
                      val("warrantyPeriod") !== null && val("warrantyPeriod") !== undefined && val("warrantyPeriod") !== ""
                        ? `${val("warrantyPeriod")} ${val("warrantyUnit") || "Years"}`
                        : null
                    }
                  />
                  <Field label="Purchase date" value={fmtDate(val("purchaseDate"))} />
                  <div className="sm:col-span-2">
                    <Field label="Invoice number" value={val("invoiceNumber")} />
                  </div>
                  {product.invoiceFileId && (
                    <div className="sm:col-span-2">
                      <button
                        type="button"
                        onClick={() => downloadInvoice(product, token).catch((e) => setInvoiceDownloadError(e.message))}
                        className="inline-flex items-center gap-2 text-xs font-semibold text-blue-700 hover:text-blue-900 transition"
                      >
                        <FileText size={14} /> Download original invoice
                      </button>
                      {invoiceDownloadError && (
                        <p role="alert" className="mt-1 text-xs text-red-600">{invoiceDownloadError}</p>
                      )}
                    </div>
                  )}
                </div>
              </Panel>

              {/* Warranty Verification Status */}
              <Panel
                icon={<Activity size={17} />}
                title="Warranty Verification"
                subtitle={`Multi-tiered verification: ${(product.brand || '').trim() || 'Manufacturer'} DB → Authorized Supplier → Blockchain Audit`}
              >
                <WarrantyVerificationBadge
                  product={product}
                  onReVerify={reVerifyWarranty}
                  verifying={warrantyVerifying}
                />
                {warrantyNotice && (
                  <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">{warrantyNotice}</p>
                )}
              </Panel>

              {/* Product Passport QR — the Warranty Verification QR was intentionally removed. */}
              <Panel icon={<QrCode size={17} />} title="Product Passport" subtitle="Share a link to this product's public passport.">
                <ProductPassportQr
                  url={`${publicBaseUrl()}/passport/${encodeURIComponent(product.publicId || product.productId)}`}
                />
              </Panel>
            </div>
          </div>

          {/* Full-width footer banner — sits below the grid for a clean bottom edge */}
          <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3.5 text-xs leading-5 text-slate-600">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-blue-700" />
            Product details are stored with your BlockWarranty record and verified on the Sepolia blockchain.
          </div>

        </>
      )}
    </WorkspaceLayout>
  );
}
