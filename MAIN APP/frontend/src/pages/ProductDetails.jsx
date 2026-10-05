import { useEffect, useState } from "react";
import {
  ArrowLeft, ArrowRightLeft, CalendarDays, CheckCircle2,
  FileText, Package,
  QrCode, ShieldCheck, Tag, Wallet,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import WorkspaceLayout from "../components/WorkspaceLayout";
import ServiceLifecycle from "../components/ServiceLifecycle";
import { useAuthFlow } from "../auth/useAuthFlow";
import { sendWalletTransaction } from "../auth/walletService";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

function ProductDetails() {
  const { productId } = useParams();
  const { token } = useAuthFlow();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [invoiceDownloadError, setInvoiceDownloadError] = useState("");
  const [chainBusy, setChainBusy] = useState(false);
  const [chainNotice, setChainNotice] = useState("");
  const [chainError, setChainError] = useState("");

  useEffect(() => {
    let active = true;
    const loadProduct = async () => {
      setLoading(true);
      setError("");
      try {
        const authToken = token || localStorage.getItem("blockwarranty_token") || "";
        const response = await fetch(`${API_BASE_URL}/api/products/${encodeURIComponent(productId)}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || data.error || "Unable to load this product.");
        if (active) setProduct(data.product);
      } catch (loadError) {
        if (active) setError(loadError.message || "Unable to load this product.");
      } finally {
        if (active) setLoading(false);
      }
    };
    loadProduct();
    return () => { active = false; };
  }, [productId, token]);

  const extracted = product?.invoiceExtractedData || {};
  const value = (field) => product?.[field] ?? extracted[field];

  const chainAction = async (action, body = {}) => {
    setChainBusy(true); setChainError(""); setChainNotice("");
    try {
      const authToken = token || localStorage.getItem("blockwarranty_token") || "";
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` };
      const base = `${API_BASE_URL}/api/products/${encodeURIComponent(product.productId)}/blockchain/${action}`;
      const prepResponse = await fetch(`${base}/prepare`, { method: "POST", headers, body: JSON.stringify(body) });
      const prepared = await prepResponse.json().catch(() => ({}));
      if (!prepResponse.ok) throw new Error(prepared.message || "Could not prepare the blockchain transaction.");
      const txHash = await sendWalletTransaction(prepared, prepared.chainId);
      const confirmResponse = await fetch(`${base}/confirm`, { method: "POST", headers, body: JSON.stringify({ ...body, txHash }) });
      const confirmed = await confirmResponse.json().catch(() => ({}));
      if (!confirmResponse.ok) throw new Error(confirmed.message || "The transaction could not be verified.");
      setChainNotice(confirmed.message);
      if (action === "register") setProduct((current) => ({ ...current, blockchainStatus: "confirmed", blockchainTxHash: txHash }));
      else setProduct((current) => ({ ...current, walletAddress: body.newOwner.toLowerCase(), blockchainStatus: "confirmed", blockchainTxHash: txHash, status: "Transferred" }));
    } catch (e) { setChainError(e.message || "Blockchain transaction failed."); }
    finally { setChainBusy(false); }
  };
  const transferOwnership = () => {
    const newOwner = window.prompt("Enter the new owner's wallet address:");
    if (newOwner) chainAction("transfer", { newOwner: newOwner.trim() });
  };

  return (
    <WorkspaceLayout>
      <Link to="/products" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-blue-700">
        <ArrowLeft size={16} /> Back to My Products
      </Link>

      {loading ? <div className="animate-pulse rounded-3xl border border-slate-200 bg-white p-8"><div className="h-[420px] rounded-2xl bg-slate-100" /></div>
        : error ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 font-medium text-red-700">{error}</div>
          : product && <>
            <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-blue-700">Product record</p>
                <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">{value("productName")}</h1>
                <p className="mt-1.5 text-sm text-slate-500">{product.productId} · {value("brand") || value("category") || "Product"}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-500" />{product.status || "Active"}</span>
                {product.blockchainStatus !== "confirmed" && <button type="button" disabled={chainBusy} onClick={() => chainAction("register")} className="inline-flex h-11 items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 text-sm font-bold text-blue-700 shadow-sm hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"><ShieldCheck size={16} /> {chainBusy ? "Registering…" : "Retry blockchain"}</button>}
                <button type="button" disabled={chainBusy || product.blockchainStatus !== "confirmed"} onClick={transferOwnership} className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-bold text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"><ArrowRightLeft size={16} /> Transfer Ownership <span className="hidden sm:inline">→</span></button>
              </div>
            </header>
            {chainBusy && <p role="status" className="mb-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-800">Waiting for the wallet transaction and blockchain confirmation…</p>}
            {chainNotice && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{chainNotice}</p>}
            {chainError && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{chainError}</p>}

            <div className="grid items-start gap-5 lg:grid-cols-[1.2fr_1fr]">
              <div className="space-y-5">
                <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex min-h-[340px] items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-50 via-slate-50 to-indigo-50 p-6 sm:min-h-[370px]">
                    {product.productImage ? <img src={product.productImage} alt={value("productName")} className="max-h-[330px] max-w-full object-contain" /> : <div className="flex flex-col items-center gap-3 text-slate-400"><Package size={44} /><span className="text-sm font-medium">No product image available</span></div>}
                  </div>
                </section>

                <Panel icon={<Tag size={17} />} title="Product information">
                  <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                    <Field label="Product name" value={value("productName")} />
                    <Field label="Brand" value={value("brand")} />
                    <Field label="Category" value={value("category")} />
                    <Field label="Product ID" value={product.productId} />
                    <Field label="Record status" value={product.status || "Active"} />
                    <Field label="Added to BlockWarranty" value={date(product.createdAt)} />
                    {value("description") && <div className="sm:col-span-2"><Field label="Description" value={value("description")} /></div>}
                  </div>
                </Panel>

                <Panel icon={<ArrowRightLeft size={17} />} title="Ownership history">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-slate-800"><span className="inline-flex items-center gap-2"><Wallet size={15} /> {shortAddress(product.walletAddress)}</span><span className="text-xs font-medium text-slate-500">Registered {date(product.createdAt || product.purchaseDate)}</span></div>
                    <p className="mt-2 text-xs text-slate-500">Original owner · Product registered to this account</p>
                  </div>
                </Panel>

                <ServiceLifecycle product={product} token={token} />
              </div>

              <div className="space-y-5">
                <Panel icon={<ShieldCheck size={17} />} title="Warranty & purchase">
                  {product.blockchainStatus === "confirmed" ? (
                    <div className="mb-4 rounded-xl bg-emerald-50 p-3">
                      <p className="text-xs font-semibold text-emerald-800">✓ Blockchain verified</p>
                      <p className="text-xs text-emerald-600">Registered on the BlockWarranty demo chain</p>
                      {product.blockchainTxHash && (
                        <p className="mt-1 text-[10px] text-emerald-500 truncate">Tx: {product.blockchainTxHash}</p>
                      )}
                    </div>
                  ) : product.blockchainStatus === "pending" ? (
                    <div className="mb-4 rounded-xl bg-amber-50 p-3">
                      <p className="text-xs font-semibold text-amber-800">⏳ Blockchain registration pending</p>
                      <p className="text-xs text-amber-600">Waiting for wallet confirmation and confirmation.</p>
                    </div>
                  ) : product.blockchainStatus === "submitted" ? (
                    <div className="mb-4 rounded-xl bg-blue-50 p-3">
                      <p className="text-xs font-semibold text-blue-800">⏳ Blockchain registration submitted</p>
                      <p className="text-xs text-blue-600">Transaction submitted. Waiting for confirmation.</p>
                      {product.blockchainTxHash && (
                        <p className="mt-1 text-[10px] text-blue-500 truncate">Tx: {product.blockchainTxHash}</p>
                      )}
                    </div>
                  ) : product.blockchainStatus === "failed" ? (
                    <div className="mb-4 rounded-xl bg-red-50 p-3">
                      <p className="text-xs font-semibold text-red-800">✗ Blockchain registration failed</p>
                      <p className="text-xs text-red-600">Use Retry blockchain after the local chain is running.</p>
                    </div>
                  ) : (
                    <div className="mb-4 rounded-xl bg-amber-50 p-3">
                      <p className="text-xs text-amber-900">Product lifecycle is not registered on-chain yet.</p>
                      <p className="text-xs text-amber-600 mt-1">Blockchain registration will be completed automatically during product creation.</p>
                    </div>
                  )}
                  <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                    <Field label="Warranty period" value={value("warrantyPeriod") !== null && value("warrantyPeriod") !== undefined && value("warrantyPeriod") !== "" ? `${value("warrantyPeriod")} ${value("warrantyUnit") || "Years"}` : "Not specified"} />
                    <Field label="Purchase date" value={date(value("purchaseDate"))} />
                    <div className="sm:col-span-2"><Field label="Invoice number" value={value("invoiceNumber")} /></div>
                    {product.invoiceFileId && <div className="sm:col-span-2"><button type="button" onClick={() => downloadInvoice(product, token).catch((downloadError) => setInvoiceDownloadError(downloadError.message))} className="inline-flex items-center gap-2 text-xs font-semibold text-blue-700 hover:text-blue-900"><FileText size={14} /> Download original invoice</button>{invoiceDownloadError && <p role="alert" className="mt-1 text-xs text-red-600">{invoiceDownloadError}</p>}</div>}
                  </div>
                </Panel>

                <Panel icon={<QrCode size={17} />} title="QR verification & public passport" subtitle="QR codes contain public links for warranty verification and product history.">
                  {publicBaseUrl() ? <div className="grid gap-3 sm:grid-cols-2">
                    <QrCard title="Warranty verification" url={`${publicBaseUrl()}/warranty/${product.publicId}`} />
                    <QrCard title="Product passport" url={`${publicBaseUrl()}/passport/${product.publicId}`} />
                  </div> : <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Set VITE_PUBLIC_APP_URL in frontend/.env to the public site URL to generate scannable links. Restart the frontend after updating it.</p>}
                </Panel>

                <Panel icon={<CalendarDays size={17} />} title="Invoice & pricing">
                  <div className="grid gap-x-7 gap-y-4 sm:grid-cols-2">
                    <MoneyField label="Currency" value={value("currency")} currency="" />
                    <MoneyField label="Unit price" value={value("unitPrice")} currency={value("currency")} />
                    <MoneyField label="Quantity" value={value("quantity")} currency="" />
                    <MoneyField label="Product / line amount" value={value("lineItemAmount")} currency={value("currency")} />
                    <MoneyField label="Subtotal" value={value("subtotal")} currency={value("currency")} />
                    <MoneyField label="Discount" value={value("discount")} currency={value("currency")} />
                    <MoneyField label="Shipping cost" value={value("shippingCost")} currency={value("currency")} />
                    <MoneyField label="Tax" value={value("tax")} currency={value("currency")} />
                    <MoneyField label="Invoice total" value={value("total")} currency={value("currency")} />
                    <MoneyField label="Amount paid" value={value("amountPaid")} currency={value("currency")} />
                    <MoneyField label="Balance due" value={value("balanceDue")} currency={value("currency")} />
                  </div>
                </Panel>

                <div className="flex items-start gap-2.5 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3.5 text-xs leading-5 text-slate-600"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-blue-700" />This page shows the product details stored with its BlockWarranty record.</div>
              </div>
            </div>
          </>}
    </WorkspaceLayout>
  );
}

function Panel({ icon, title, subtitle, children }) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.035)] sm:p-6"><div className="mb-5 flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">{icon}</span><div><h2 className="text-sm font-bold text-slate-900">{title}</h2>{subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}</div></div>{children}</section>;
}

function Field({ label, value }) {
  return <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p><p className="mt-1 break-words text-sm font-semibold text-slate-800">{value || "Not provided"}</p></div>;
}

function MoneyField({ label, value, currency }) {
  const shown = value === null || value === undefined || value === "" ? "Not provided" : `${currency ? `${currency} ` : ""}${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return <Field label={label} value={shown} />;
}

function publicBaseUrl() {
  return String(import.meta.env.VITE_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
}

function QrCard({ title, url }) {
  const [copied, setCopied] = useState(false);
  const canvasId = `qr-${title.replace(/\W+/g, "-").toLowerCase()}`;
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setCopied(false); } };
  const download = () => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const link = document.createElement("a"); link.href = canvas.toDataURL("image/png"); link.download = `${canvasId}.png`; link.click();
  };
  return <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center"><h3 className="mb-3 text-xs font-bold text-slate-800">{title}</h3><div className="rounded-lg bg-white p-2"><QRCodeCanvas id={canvasId} value={url} size={176} level="H" includeMargin /></div><p className="mt-2 w-full truncate text-[10px] text-slate-500">{url}</p><div className="mt-3 flex gap-2"><button type="button" onClick={download} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white">Download QR</button><button type="button" onClick={copy} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">{copied ? "Copied" : "Copy link"}</button></div></div>;
}

function date(value) {
  if (!value) return "Not provided";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not provided" : parsed.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function shortAddress(address = "") {
  return address ? `${address.slice(0, 8)}${address.length > 16 ? `…${address.slice(-8)}` : ""}` : "Owner wallet unavailable";
}

async function downloadInvoice(product, token) {
  const authToken = token || localStorage.getItem("blockwarranty_token") || "";
  const response = await fetch(`${API_BASE_URL}/api/products/${encodeURIComponent(product.productId)}/invoice`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "The invoice could not be downloaded.");
  }
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = product.invoiceFileName || "invoice";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export default ProductDetails;
