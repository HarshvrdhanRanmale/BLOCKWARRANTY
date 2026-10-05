import { useEffect, useState } from "react";
import {
  ArrowLeft, ArrowRightLeft, CalendarDays, CheckCircle2,
  FileText, Package, QrCode, ShieldCheck, Tag, Wallet,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import WorkspaceLayout from "../components/WorkspaceLayout";
import ServiceLifecycle from "../components/ServiceLifecycle";
import TransferOwnershipModal from "../components/TransferOwnershipModal";
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
  return String(
    import.meta.env.VITE_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : "")
  ).replace(/\/$/, "");
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
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.035)] sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
          {icon}
        </span>
        <div>
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, value }) {
  return (
    <div className="min-w-0">
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

function QrCard({ title, url }) {
  const [copied, setCopied] = useState(false);
  const canvasId = `qr-${title.replace(/\W+/g, "-").toLowerCase()}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const download = () => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `${canvasId}.png`;
    link.click();
  };

  return (
    <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
      <h3 className="mb-3 text-xs font-bold text-slate-800">{title}</h3>
      <div className="rounded-lg bg-white p-2">
        <QRCodeCanvas id={canvasId} value={url} size={176} level="H" includeMargin />
      </div>
      <p className="mt-2 w-full truncate text-[10px] text-slate-500">{url}</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={download} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800 transition">
          Download QR
        </button>
        <button type="button" onClick={copy} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────

export default function ProductDetails() {
  const { productId } = useParams();
  const { token } = useAuthFlow();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Transfer modal
  const [transferOpen, setTransferOpen] = useState(false);

  // Blockchain action state
  const [chainBusy, setChainBusy] = useState(false);
  const [chainNotice, setChainNotice] = useState("");
  const [chainError, setChainError] = useState("");

  // Invoice download
  const [invoiceDownloadError, setInvoiceDownloadError] = useState("");

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
      } else if (action === "transfer") {
        setProduct((p) => ({
          ...p,
          walletAddress: body.newOwner.toLowerCase(),
          blockchainStatus: "confirmed",
          blockchainTxHash: txHash,
          status: "Transferred",
        }));
        setTransferOpen(false);
      }
    } catch (err) {
      setChainError(err.message || "Blockchain transaction failed.");
    } finally {
      setChainBusy(false);
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
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-blue-700">Product record</p>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
                {val("productName")}
              </h1>
              <p className="mt-1.5 text-sm text-slate-500">
                {product.productId} · {val("brand") || val("category") || "Product"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {product.status || "Active"}
              </span>

              {product.blockchainStatus !== "confirmed" && (
                <button
                  type="button"
                  disabled={chainBusy}
                  onClick={() => chainAction("register")}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 text-sm font-bold text-blue-700 shadow-sm hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  <ShieldCheck size={16} />
                  {chainBusy ? "Registering…" : "Retry blockchain"}
                </button>
              )}

              <button
                type="button"
                id="btn-transfer-ownership"
                disabled={chainBusy || product.blockchainStatus !== "confirmed"}
                onClick={() => setTransferOpen(true)}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-bold text-white shadow-sm hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <ArrowRightLeft size={16} /> Transfer Ownership
              </button>
            </div>
          </header>

          {/* Status notices */}
          {chainBusy && <p role="status" className="mb-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-800">Waiting for wallet transaction and blockchain confirmation…</p>}
          {chainNotice && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{chainNotice}</p>}
          {chainError && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{chainError}</p>}

          {/* Main grid */}
          <div className="grid items-start gap-5 lg:grid-cols-[1.2fr_1fr]">
            {/* Left column */}
            <div className="space-y-5">
              {/* Product image */}
              <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex min-h-[340px] items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-50 via-slate-50 to-indigo-50 p-6 sm:min-h-[370px]">
                  {product.productImage
                    ? <img src={product.productImage} alt={val("productName")} className="max-h-[330px] max-w-full object-contain" />
                    : <div className="flex flex-col items-center gap-3 text-slate-400"><Package size={44} /><span className="text-sm font-medium">No product image</span></div>
                  }
                </div>
              </section>

              {/* Product info */}
              <Panel icon={<Tag size={17} />} title="Product information">
                <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
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

              {/* Ownership */}
              <Panel icon={<ArrowRightLeft size={17} />} title="Ownership history">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-slate-800">
                    <span className="inline-flex items-center gap-2">
                      <Wallet size={15} /> {shortAddress(product.walletAddress)}
                    </span>
                    <span className="text-xs font-medium text-slate-500">
                      Registered {fmtDate(product.createdAt || product.purchaseDate)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Original owner · Product registered to this wallet</p>
                </div>
              </Panel>

              {/* Service lifecycle */}
              <ServiceLifecycle product={product} token={token} />
            </div>

            {/* Right column */}
            <div className="space-y-5">
              {/* Warranty & purchase */}
              <Panel icon={<ShieldCheck size={17} />} title="Warranty & purchase">
                <BlockchainBadge status={product.blockchainStatus} txHash={product.blockchainTxHash} />
                <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
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

              {/* QR codes */}
              <Panel
                icon={<QrCode size={17} />}
                title="QR verification & public passport"
                subtitle="Shareable links for warranty verification and product history."
              >
                {publicBaseUrl() ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <QrCard title="Warranty verification" url={`${publicBaseUrl()}/warranty/${product.publicId}`} />
                    <QrCard title="Product passport" url={`${publicBaseUrl()}/passport/${product.publicId}`} />
                  </div>
                ) : (
                  <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
                    Set <code>VITE_PUBLIC_APP_URL</code> in <code>frontend/.env</code> to generate scannable QR links.
                  </p>
                )}
              </Panel>

              {/* Invoice & pricing */}
              <Panel icon={<CalendarDays size={17} />} title="Invoice & pricing">
                <div className="grid gap-x-7 gap-y-4 sm:grid-cols-2">
                  <MoneyField label="Currency" value={val("currency")} currency="" />
                  <MoneyField label="Unit price" value={val("unitPrice")} currency={val("currency")} />
                  <MoneyField label="Quantity" value={val("quantity")} currency="" />
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

              <div className="flex items-start gap-2.5 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3.5 text-xs leading-5 text-slate-600">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-blue-700" />
                Product details are stored with your BlockWarranty record and verified on the Sepolia blockchain.
              </div>
            </div>
          </div>

          {/* Transfer ownership modal */}
          <TransferOwnershipModal
            open={transferOpen}
            busy={chainBusy}
            onConfirm={(newOwner) => chainAction("transfer", { newOwner })}
            onClose={() => !chainBusy && setTransferOpen(false)}
          />
        </>
      )}
    </WorkspaceLayout>
  );
}
