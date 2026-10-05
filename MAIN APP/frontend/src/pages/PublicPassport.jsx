import { useEffect, useState } from "react";
import {
  ArrowDownToLine, BadgeCheck, CalendarDays, CheckCircle2, Clock3,
  FileText, Package, ShieldCheck, WalletCards, Wrench,
} from "lucide-react";
import { useParams } from "react-router-dom";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export default function PublicPassport({ type = "product" }) {
  const { publicId } = useParams();
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setState("loading");
      try {
        const suffix = type === "warranty" ? "/warranty" : "";
        const response = await fetch(`${API_BASE_URL}/api/public/products/${encodeURIComponent(publicId || "")}${suffix}`);
        const result = await response.json();
        if (!response.ok) throw new Error(response.status === 404 ? "not-found" : "unavailable");
        if (active) { setData(result); setState("ready"); }
      } catch (error) {
        if (active) setState(error.message === "not-found" ? "not-found" : "unavailable");
      }
    };
    load();
    return () => { active = false; };
  }, [publicId, type]);

  if (state !== "ready") return <PublicState state={state} />;
  const product = data.product;
  const warranty = data.warranty;

  return (
    <main className="min-h-screen bg-[#f5f8fc] px-4 py-8 text-slate-900 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-center justify-between gap-3">
          <a href="/" className="flex items-center gap-2.5 font-extrabold tracking-tight"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-700 text-white"><ShieldCheck size={22} /></span><span>BlockWarranty</span></a>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Digital {type === "warranty" ? "Warranty" : "Product"} Passport</span>
        </header>

        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_70px_rgba(15,23,42,.07)]">
          <div className="grid gap-0 md:grid-cols-[1.05fr_.95fr]">
            <div className="flex min-h-[300px] items-center justify-center bg-gradient-to-br from-blue-50 via-slate-50 to-indigo-100 p-7 sm:min-h-[400px]">
              {product.image ? <img src={product.image} alt={product.model} className="max-h-[360px] max-w-full object-contain" /> : <div className="flex flex-col items-center gap-3 text-blue-300"><Package size={60} strokeWidth={1.3} /><span className="text-xs font-semibold text-slate-400">Product image not shared</span></div>}
            </div>
            <div className="flex flex-col justify-center p-6 sm:p-10">
              <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800"><CheckCircle2 size={15} /> Registered product</div>
              <p className="text-xs font-extrabold uppercase tracking-[.2em] text-blue-700">{product.brand || "BlockWarranty"}</p>
              <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{product.model || "Product"}</h1>
              <p className="mt-2 text-sm text-slate-500">{product.category || "Product record"}</p>
              <div className="mt-7 border-t border-slate-100 pt-5"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-slate-400">Product ID</p><p className="mt-1 font-mono text-sm font-semibold text-slate-800">{product.productId}</p></div>
              <p className="mt-5 text-xs text-slate-500">Registered in the BlockWarranty application.</p>
            </div>
          </div>

          <div className="grid gap-5 border-t border-slate-100 bg-white p-5 sm:p-7 md:grid-cols-2">
            <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5 sm:p-6">
              <SectionHeading icon={<ShieldCheck size={17} />} title="Warranty" />
              <WarrantyStatus warranty={warranty} />
              {warranty.startDate && <div className="mt-5 grid grid-cols-2 gap-4"><DateField label="Valid from" value={warranty.startDate} /><DateField label={warranty.active ? "Valid until" : "Expired on"} value={warranty.expiryDate} /></div>}
              {!warranty.verified && <p className="mt-4 text-sm text-slate-600">On-chain warranty verification is not yet available for this product.</p>}
            </section>

            <section className="rounded-2xl border border-slate-200 p-5 sm:p-6">
              <SectionHeading icon={<CalendarDays size={17} />} title="Purchase details" />
              {data.purchase?.purchaseDate ? <DateField label="Purchase date" value={data.purchase.purchaseDate} /> : <p className="mt-3 text-sm text-slate-500">Purchase date is not available.</p>}
              {data.purchase?.invoiceUrl && <a className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:text-blue-900" href={`${API_BASE_URL}${data.purchase.invoiceUrl}`} target="_blank" rel="noreferrer"><FileText size={15} /> View public invoice <ArrowDownToLine size={14} /></a>}
            </section>
          </div>

          {type !== "warranty" && <div className="grid gap-5 border-t border-slate-100 p-5 sm:p-7 md:grid-cols-2">
            {product.description && <section className="rounded-2xl border border-slate-200 p-5 sm:p-6"><SectionHeading icon={<Package size={17} />} title="About this product" /><p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{product.description}</p></section>}
            <section className="rounded-2xl border border-slate-200 p-5 sm:p-6"><SectionHeading icon={<WalletCards size={17} />} title="Ownership" />{data.ownership?.history?.length ? <div className="space-y-3">{data.ownership.history.map((event, index) => <div key={`${event.txHash}-${index}`} className="rounded-xl bg-slate-50 p-3"><p className="text-sm font-semibold text-slate-800">{event.title}</p><p className="mt-1 text-xs text-slate-500">{formatDate(event.date)}</p></div>)}</div> : <p className="text-sm text-slate-500">No ownership transfers are recorded.</p>}<p className="mt-2 text-xs leading-5 text-slate-500">Owner wallet addresses are private.</p></section>
            <section className="rounded-2xl border border-slate-200 p-5 sm:p-6 md:col-span-2"><SectionHeading icon={<Clock3 size={17} />} title="Product timeline" />{data.timeline.length ? <ol className="relative ml-2 border-l border-blue-200 pl-6">{data.timeline.map((event, index) => <li key={`${event.type}-${index}`} className="relative pb-5 last:pb-0"><span className="absolute -left-[31px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-blue-600 bg-white" /><p className="text-sm font-bold text-slate-800">{event.title}</p><p className="mt-1 text-xs text-slate-500">{formatDate(event.date)}</p></li>)}</ol> : <p className="text-sm text-slate-500">No public lifecycle events have been recorded.</p>}</section>
            <section className="rounded-2xl border border-slate-200 p-5 sm:p-6"><SectionHeading icon={<Wrench size={17} />} title="Service history & warranty claims" />{data.serviceHistory?.length ? <div className="space-y-3">{data.serviceHistory.map((item) => <article key={`${item.type}-${item.txHash}`} className="rounded-xl bg-slate-50 p-3"><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-bold text-slate-800">{item.type === 'warranty-claim' ? 'Warranty claim' : `Service / repair${item.serviceType ? ` · ${item.serviceType}` : ''}`}</p><span className="text-[10px] font-bold text-emerald-700">Verified on blockchain</span></div><p className="mt-1 text-xs text-slate-500">{formatDate(item.date)} · {item.serviceCenter || 'Service center not provided'}</p>{item.issue && <p className="mt-2 text-xs text-slate-700"><b>Issue:</b> {item.issue}</p>}{item.diagnosis && <p className="mt-1 text-xs text-slate-600"><b>Diagnosis:</b> {item.diagnosis}</p>}{item.workPerformed && <p className="mt-1 text-xs text-slate-600"><b>Work:</b> {item.workPerformed}</p>}{item.resolution && <p className="mt-1 text-xs text-slate-600"><b>Resolution:</b> {item.resolution}</p>}{item.partsReplaced?.length > 0 && <p className="mt-2 text-xs text-slate-600">Parts replaced: {item.partsReplaced.map((part) => `${part.name}${part.quantity > 1 ? ` ×${part.quantity}` : ''}`).join(', ')}</p>}{item.totalCost != null && <p className="mt-2 text-xs font-semibold text-slate-700">Service cost: {item.currency} {Number(item.totalCost).toLocaleString()}</p>}</article>)}</div> : <p className="text-sm text-slate-500">No blockchain-confirmed service or warranty claim records are available.</p>}</section>
            <section className="rounded-2xl border border-amber-100 bg-amber-50/50 p-5 sm:p-6"><SectionHeading icon={<BadgeCheck size={17} />} title="Blockchain verification" /><p className="text-sm font-semibold text-amber-900">{data.verification?.blockchainVerified ? "Verified on-chain" : "Not verified on-chain"}</p><p className="mt-2 text-xs leading-5 text-amber-800">{data.verification?.message || "On-chain verification is not yet available."}</p></section>
          </div>}

          <footer className="border-t border-slate-100 px-5 py-5 text-center text-xs text-slate-500 sm:px-7"><span className="font-bold text-slate-700">BlockWarranty public record</span><p className="mt-1">Private account details, invoices, and documents are not shown here.</p></footer>
        </section>
      </div>
    </main>
  );
}

function SectionHeading({ icon, title }) {
  return <div className="mb-5 flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700">{icon}</span><h2 className="text-sm font-extrabold text-slate-900">{title}</h2></div>;
}

function WarrantyStatus({ warranty }) {
  if (!warranty.verified) return <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-800">Not verified on-chain</span>;
  if (warranty.status === "not-configured") return <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">Not configured</span>;
  if (warranty.active) return <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800"><CheckCircle2 size={14} /> Active · verified on-chain</span>;
  return <span className="inline-flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1.5 text-xs font-bold text-rose-800">Expired · verified on-chain</span>;
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
