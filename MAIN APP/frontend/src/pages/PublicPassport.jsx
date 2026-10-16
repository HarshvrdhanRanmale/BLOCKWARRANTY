import { useEffect, useState } from "react";
import {
  ArrowDownToLine, BadgeCheck, CalendarDays, CheckCircle2, Clock3,
  FileText, Package, ShieldCheck, WalletCards, Wrench,
} from "lucide-react";
import { useParams } from "react-router-dom";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

function transactionUrl(txHash) {
  return `https://sepolia.etherscan.io/tx/${txHash}`;
}

export default function PublicPassport() {
  const { publicId } = useParams();
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setState("loading");
      try {
        const response = await fetch(`${API_BASE_URL}/api/public/products/${encodeURIComponent(publicId || "")}`);
        const result = await response.json();
        if (!response.ok) throw new Error(response.status === 404 ? "not-found" : "unavailable");
        if (active) { setData(result); setState("ready"); }
      } catch (error) {
        if (active) setState(error.message === "not-found" ? "not-found" : "unavailable");
      }
    };
    load();
    return () => { active = false; };
  }, [publicId]);

  if (state !== "ready") return <PublicState state={state} />;
  const product = data.product;
  const warranty = data.warranty;

  return (
    <main className="min-h-screen bg-[#f5f8fc] px-3.5 py-6 text-slate-900 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3 sm:mb-8">
          <a href="/" className="flex items-center gap-2.5 font-extrabold tracking-tight"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-700 text-white"><ShieldCheck size={22} /></span><span>BlockWarranty</span></a>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Digital Product Passport</span>
        </header>

        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_70px_rgba(15,23,42,.07)]">
          <div className="grid gap-0 md:grid-cols-[1.05fr_.95fr]">
            <div className="flex min-h-[220px] items-center justify-center bg-gradient-to-br from-blue-50 via-slate-50 to-indigo-100 p-5 sm:min-h-[360px] sm:p-7">
              {product.image ? <img src={product.image} alt={product.model} className="max-h-[300px] max-w-full object-contain" /> : <div className="flex flex-col items-center gap-2 text-blue-300"><Package size={48} strokeWidth={1.3} /><span className="text-xs font-semibold text-slate-400">Product image not shared</span></div>}
            </div>
            <div className="flex flex-col justify-center p-5 sm:p-8 md:p-10">
              <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800"><CheckCircle2 size={15} /> Registered product</div>
              <p className="text-xs font-extrabold uppercase tracking-[.2em] text-blue-700">{product.brand || "BlockWarranty"}</p>
              <h1 className="mt-1.5 break-words text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl md:text-4xl">{product.model || "Product"}</h1>
              <p className="mt-1.5 text-sm text-slate-500">{product.category || "Product record"}</p>
              <div className="mt-5 border-t border-slate-100 pt-4 sm:mt-7 sm:pt-5"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-slate-400">Product ID</p><p className="mt-1 break-all font-mono text-xs sm:text-sm font-semibold text-slate-800">{product.productId}</p></div>
              <p className="mt-4 text-xs text-slate-500">Registered in the BlockWarranty application.</p>
            </div>
          </div>

          <div className="grid gap-5 border-t border-slate-100 bg-white p-4 sm:p-7 md:grid-cols-2">
            <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:p-6">
              <SectionHeading icon={<ShieldCheck size={17} />} title="Warranty" />
              <WarrantyStatus warranty={warranty} />
              {warranty.warrantyPeriod !== null && warranty.warrantyPeriod !== undefined
                ? <p className="mt-4 text-sm text-slate-700"><span className="font-semibold">Warranty period:</span> {warranty.warrantyPeriod} {warranty.warrantyUnit || "unit not recorded"}</p>
                : <p className="mt-4 text-sm text-slate-500">—</p>}
              {warranty.startDate && warranty.expiryDate && <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4"><DateField label="Valid from" value={warranty.startDate} /><DateField label={warranty.active ? "Valid until" : "Expired on"} value={warranty.expiryDate} /></div>}
              {!warranty.verified && <p className="mt-4 text-sm text-slate-600">On-chain warranty verification is not yet available for this product.</p>}
            </section>

            <section className="rounded-2xl border border-slate-200 p-4 sm:p-6">
              <SectionHeading icon={<CalendarDays size={17} />} title="Purchase details" />
              {data.purchase?.purchaseDate ? <DateField label="Purchase date" value={data.purchase.purchaseDate} /> : <p className="mt-3 text-sm text-slate-500">Purchase date is not available.</p>}
              {data.purchase?.invoiceUrl && <a className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:text-blue-900" href={`${API_BASE_URL}${data.purchase.invoiceUrl}`} target="_blank" rel="noreferrer"><FileText size={15} /> View public invoice <ArrowDownToLine size={14} /></a>}
            </section>
          </div>

          <div className="grid gap-5 border-t border-slate-100 p-4 sm:p-7 md:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 p-4 sm:p-6">
              <SectionHeading icon={<Package size={17} />} title="About this product" />
              <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
                <InfoField label="Product name" value={product.model} />
                <InfoField label="Brand" value={product.brand} />
                <InfoField label="Category" value={product.category} />
                <InfoField label="Product ID" value={product.productId} />
                <InfoField label="Purchase date" value={data.purchase?.purchaseDate ? formatDate(data.purchase.purchaseDate) : null} />
                <InfoField label="Registered" value={product.registeredAt ? formatDate(product.registeredAt) : null} />
                <InfoField label="Warranty" value={warranty.warrantyPeriod != null && warranty.warrantyUnit ? `${warranty.warrantyPeriod} ${warranty.warrantyUnit}` : null} />
              </div>
              {product.description && <p className="mt-4 whitespace-pre-wrap border-t border-slate-100 pt-4 text-sm leading-6 text-slate-600">{product.description}</p>}
            </section>
            <section className="rounded-2xl border border-slate-200 p-4 sm:p-6">
              <SectionHeading icon={<WalletCards size={17} />} title="Ownership" />
              {data.ownership?.history?.length ? <div className="space-y-3">{data.ownership.history.map((event, index) => <div key={`${event.txHash}-${index}`} className="rounded-xl bg-slate-50 p-3"><p className="text-sm font-semibold text-slate-800">{event.title}</p><p className="mt-1 text-xs text-slate-500">{formatDate(event.date)}</p>{event.fromWallet && <p className="mt-2 break-all text-xs text-slate-600"><span className="font-semibold">Previous owner:</span> {event.fromWallet}</p>}{event.toWallet && <p className="mt-1 break-all text-xs text-slate-600"><span className="font-semibold">New owner:</span> {event.toWallet}</p>}{event.txHash && <a href={transactionUrl(event.txHash)} target="_blank" rel="noreferrer" className="mt-2 block break-all font-mono text-[10px] text-blue-700 hover:underline">Tx: {event.txHash}</a>}</div>)}</div> : <p className="text-sm text-slate-500">No ownership transfers are recorded.</p>}
              <p className="mt-2 text-xs leading-5 text-slate-500">Wallet addresses are public blockchain identifiers, not verified names.</p>
            </section>
            <section className="rounded-2xl border border-slate-200 p-4 sm:p-6 md:col-span-2">
              <SectionHeading icon={<Clock3 size={17} />} title="Product timeline" />
              {data.timeline.length ? (
                <ol className="relative ml-2 border-l border-blue-200 pl-4 sm:pl-6">
                  {data.timeline.map((event, index) => (
                    <li key={event.type + '-' + (event.txHash || event.title) + '-' + index} className="relative pb-5 last:pb-0">
                      <span className="absolute -left-[25px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-blue-600 bg-white sm:-left-[31px]" />
                      <p className="text-sm font-bold text-slate-800">{event.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatDate(event.date)}</p>
                      {event.txHash && (
                        <a href={transactionUrl(event.txHash)} target="_blank" rel="noreferrer" className="mt-1 inline-block max-w-full break-all font-mono text-[10px] text-blue-700 hover:underline">
                          View blockchain transaction
                        </a>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-slate-500">No public lifecycle events have been recorded.</p>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 p-4 sm:p-6">
              <SectionHeading icon={<Wrench size={17} />} title="Service history & warranty claims" />
              {data.serviceHistory?.length ? (
                <div className="space-y-3">
                  {data.serviceHistory.map((item) => (
                    <article key={item.type + '-' + (item.serviceId || item.txHash || Math.random())} className="rounded-xl bg-slate-50 p-3">
                      <div className="flex flex-wrap justify-between gap-2">
                        <p className="text-sm font-bold text-slate-800">
                          {item.type === 'warranty-claim' ? 'Warranty claim' : ('Service / repair' + (item.serviceType ? ' · ' + item.serviceType : ''))}
                        </p>
                        <span className={'text-[10px] font-bold ' + (item.verified ? 'text-emerald-700' : 'text-amber-700')}>
                          {item.verified ? 'Verified on blockchain' : 'Owner provided · not verified on-chain'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{formatDate(item.date)} · {item.serviceCenter || 'Service center not provided'}</p>
                      {item.issue && <p className="mt-2 text-xs text-slate-700"><b>Issue:</b> {item.issue}</p>}
                      {item.diagnosis && <p className="mt-1 text-xs text-slate-600"><b>Diagnosis:</b> {item.diagnosis}</p>}
                      {item.workPerformed && <p className="mt-1 text-xs text-slate-600"><b>Work:</b> {item.workPerformed}</p>}
                      {item.resolution && <p className="mt-1 text-xs text-slate-600"><b>Resolution:</b> {item.resolution}</p>}
                      {item.partsReplaced?.length > 0 && (
                        <p className="mt-2 text-xs text-slate-600">
                          Parts replaced: {item.partsReplaced.map((part) => part.name + (part.quantity > 1 ? ' ×' + part.quantity : '')).join(', ')}
                        </p>
                      )}
                      {item.totalCost != null && (
                        <p className="mt-2 text-xs font-semibold text-slate-700">Service cost: {item.currency} {Number(item.totalCost).toLocaleString()}</p>
                      )}
                      {item.documentUrl && (
                        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-200 pt-3 text-xs">
                          <span className="text-slate-500">
                            Document hash: <span className="font-mono">{item.documentHash ? item.documentHash.slice(0, 12) + '…' : 'not available'}</span>
                          </span>
                          <a href={API_BASE_URL + item.documentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-bold text-blue-700 hover:text-blue-900">
                            <FileText size={14} /> Private bill
                          </a>
                          <a href={API_BASE_URL + item.documentUrl + '?download=1'} className="inline-flex items-center gap-1.5 font-bold text-blue-700 hover:text-blue-900">
                            <ArrowDownToLine size={14} /> Download
                          </a>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No service bills or lifecycle records have been added.</p>
              )}
            </section>

            <section className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4 sm:p-6">
              <SectionHeading icon={<BadgeCheck size={17} />} title="Blockchain verification" />
              <p className="text-sm font-semibold text-amber-900">{data.verification?.blockchainVerified ? "Verified on-chain" : "Not verified on-chain"}</p>
              <p className="mt-2 text-xs leading-5 text-amber-800">{data.verification?.message || "On-chain verification is not yet available."}</p>
            </section>
          </div>

          <footer className="border-t border-slate-100 px-5 py-5 text-center text-xs text-slate-500 sm:px-7"><span className="font-bold text-slate-700">BlockWarranty public record</span><p className="mt-1">Private account details, invoices, and documents are not shown here.</p></footer>
        </section>
      </div>
    </main>
  );
}

function SectionHeading({ icon, title }) {
  return <div className="mb-5 flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700">{icon}</span><h2 className="text-sm font-extrabold text-slate-900">{title}</h2></div>;
}

function InfoField({ label, value }) {
  return <div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">{label}</p><p className="mt-1 break-words text-sm font-semibold text-slate-800">{value || '—'}</p></div>;
}

function WarrantyStatus({ warranty }) {
  if (warranty.warrantyPeriod == null) return <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">Warranty not provided</span>;
  if (!warranty.verified) return <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-800">Not verified on-chain</span>;
  if (warranty.status === "not-configured") return <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">Not configured</span>;
  if (warranty.active) return <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800"><CheckCircle2 size={14} /> Active · product registered on-chain</span>;
  return <span className="inline-flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1.5 text-xs font-bold text-rose-800">Expired · product registered on-chain</span>;
}

function DateField({ label, value }) {
  return <div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">{label}</p><p className="mt-1 text-sm font-bold text-slate-800">{formatDate(value)}</p></div>;
}

function formatDate(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function PublicState({ state }) {
  const loading = state === "loading";
  const notFound = state === "not-found";
  return <main className="flex min-h-screen items-center justify-center bg-[#f5f8fc] px-5"><section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><ShieldCheck size={25} /></span><h1 className="mt-5 text-xl font-extrabold text-slate-900">{loading ? "Loading passport…" : notFound ? "Product Passport unavailable" : "Verification unavailable"}</h1><p className="mt-2 text-sm leading-6 text-slate-500">{loading ? "Retrieving the public product record." : notFound ? "This product is not available for public verification, or the link has expired." : "We couldn’t retrieve this product right now. Please try again later."}</p><a href="/" className="mt-6 inline-flex h-10 items-center justify-center rounded-xl bg-blue-700 px-4 text-sm font-bold text-white">BlockWarranty home</a></section></main>;
}
