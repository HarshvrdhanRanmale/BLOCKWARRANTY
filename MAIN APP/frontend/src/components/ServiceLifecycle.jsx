import { useEffect, useState } from 'react';
import { FileText, Plus, RefreshCw, ShieldCheck, Wrench, X } from 'lucide-react';
import { sendWalletTransaction } from '../auth/walletService';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const SERVICE_FIELDS = [
  ['invoiceNumber', 'Bill / invoice number'], ['serviceDate', 'Service date', 'date'], ['serviceCenterName', 'Service center'],
  ['serviceType', 'Service type'], ['issueReported', 'Issue reported'], ['diagnosis', 'Diagnosis'], ['workPerformed', 'Work performed'],
  ['laborCost', 'Labor cost', 'number'], ['partsCost', 'Parts cost', 'number'], ['totalCost', 'Total cost', 'number'],
  ['currency', 'Currency'], ['warrantyCovered', 'Warranty covered', 'checkbox'], ['customerCost', 'Customer cost', 'number']
];
const CLAIM_FIELDS = [
  ['claimDate', 'Claim date', 'date'], ['issue', 'Issue'], ['claimDescription', 'Claim description'], ['serviceCenterName', 'Service center'],
  ['diagnosis', 'Diagnosis'], ['resolution', 'Resolution'], ['claimStatus', 'Claim status', 'select'], ['warrantyCovered', 'Warranty covered', 'checkbox'], ['customerCost', 'Customer cost', 'number']
];

export default function ServiceLifecycle({ product, token }) {
  const [history, setHistory] = useState({ services: [], warrantyClaims: [] });
  const [kind, setKind] = useState('');
  const [file, setFile] = useState(null);
  const [fileData, setFileData] = useState('');
  const [extracted, setExtracted] = useState({});
  const [values, setValues] = useState({});
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [pendingDraft, setPendingDraft] = useState(null);

  const headers = { Authorization: `Bearer ${token || localStorage.getItem('blockwarranty_token') || ''}` };
  useEffect(() => {
    let active = true;
    fetch(`${API_BASE}/api/products/${encodeURIComponent(product.productId)}/services`, { headers: { Authorization: `Bearer ${token || localStorage.getItem('blockwarranty_token') || ''}` } })
      .then((response) => response.json().then((result) => ({ response, result })))
      .then(({ response, result }) => { if (active && response.ok) setHistory(result); })
      .catch(() => { /* retain the last loaded history */ });
    return () => { active = false; };
  }, [product.productId, token, refresh]);

  const selectFile = (selected) => {
    setError(''); setNotice(''); setFile(selected || null); setExtracted({}); setValues({});
    if (!selected) { setFileData(''); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) || selected.size > 8 * 1024 * 1024) {
      setError('Choose a JPG, PNG, or WEBP service bill under 8 MB. PDF extraction is not connected yet.'); setFile(null); return;
    }
    const reader = new FileReader();
    reader.onload = () => setFileData(String(reader.result).split(',')[1] || '');
    reader.onerror = () => setError('Could not read this file. Please choose it again.');
    reader.readAsDataURL(selected);
  };

  const extract = async () => {
    if (!fileData || !file) return setError('Upload a service bill image first.');
    setExtracting(true); setError(''); setNotice('');
    try {
      const response = await fetch(`${API_BASE}/api/products/${encodeURIComponent(product.productId)}/services/extract`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileData, fileType: file.type, fileName: file.name })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || result.error || 'Extraction failed. You can still fill the form manually.');
      setExtracted(result.extractedData || {}); setValues(result.extractedData || {});
      setNotice('Review and correct all values. AI extraction is only a draft.');
    } catch (e) { setError(e.message); }
    finally { setExtracting(false); }
  };

  const saveDraft = async (event) => {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      let recordId = pendingDraft?.kind === kind ? pendingDraft.recordId : null;
      if (!recordId) {
        const response = await fetch(`${API_BASE}/api/products/${encodeURIComponent(product.productId)}/services/drafts`, {
          method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, fileData, fileType: file?.type, fileName: file?.name, extractedData: extracted, confirmedData: values })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || result.error || 'Could not save private draft.');
        recordId = kind === 'service' ? result.draft.serviceId : result.draft.warrantyClaimId;
        setPendingDraft({ kind, recordId });
      }
      const chainPath = `${API_BASE}/api/products/${encodeURIComponent(product.productId)}/services`;
      const prepareResponse = await fetch(`${chainPath}/prepare`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, recordId }) });
      const prepared = await prepareResponse.json();
      if (!prepareResponse.ok) throw new Error(`${prepared.message || 'Could not prepare on-chain recording.'} Your private draft is saved.`);
      const txHash = await sendWalletTransaction(prepared, prepared.chainId);
      const confirmResponse = await fetch(`${chainPath}/confirm`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, recordId, txHash }) });
      const confirmed = await confirmResponse.json();
      if (!confirmResponse.ok) throw new Error(`${confirmed.message || 'Could not verify the chain transaction.'} Your private draft is saved.`);
      setNotice(confirmed.message); setKind(''); setFile(null); setFileData(''); setValues({}); setExtracted({}); setPendingDraft(null);
      setRefresh((current) => current + 1);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const download = async (recordId) => {
    try {
      const response = await fetch(`${API_BASE}/api/products/${encodeURIComponent(product.productId)}/services/${encodeURIComponent(recordId)}/document`, { headers });
      if (!response.ok) throw new Error('Private service document is not available.');
      const link = document.createElement('a'); link.href = URL.createObjectURL(await response.blob()); link.download = 'service-document'; link.click(); URL.revokeObjectURL(link.href);
    } catch (e) { setError(e.message); }
  };

  const entries = [
    ...history.services.map((item) => ({ ...item, key: item.serviceId, kind: 'Service / repair', date: item.serviceDate, details: item.workPerformed || item.issueReported, amount: item.totalCost, status: item.blockchainStatus })),
    ...history.warrantyClaims.map((item) => ({ ...item, key: item.warrantyClaimId, kind: 'Warranty claim', date: item.claimDate, details: item.issue || item.claimDescription, amount: item.customerCost, status: item.blockchainStatus }))
  ].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));

  return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.035)] sm:p-6">
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Wrench size={17} /></span><div><h2 className="text-sm font-bold text-slate-900">Service & warranty history</h2><p className="text-xs text-slate-500">Service documents stay private. Confirmed lifecycle entries are recorded on-chain.</p></div></div><div className="flex gap-2"><button type="button" onClick={() => { setKind('service'); setError(''); setNotice(''); }} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white"><Plus size={14} /> Add service</button><button type="button" onClick={() => { setKind('warranty_claim'); setError(''); setNotice(''); }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"><ShieldCheck size={14} /> Add claim</button></div></header>
    {entries.length ? <div className="space-y-3">{entries.map((item) => <article key={item.key} className="rounded-2xl bg-slate-50 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-bold text-slate-900">{item.kind}{item.details ? ` · ${item.details}` : ''}</p><p className="mt-1 text-xs text-slate-500">{item.serviceCenterName || 'Service center not provided'} · {formatDate(item.date || item.createdAt)}</p></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-800">{item.status === 'confirmed' ? 'Blockchain confirmed' : 'Draft · not on-chain'}</span></div>{item.partsReplaced?.length > 0 && <p className="mt-2 text-xs text-slate-600">Parts: {item.partsReplaced.map((part) => `${part.name}${part.quantity > 1 ? ` ×${part.quantity}` : ''}`).join(', ')}</p>}{item.amount != null && <p className="mt-2 text-xs font-semibold text-slate-700">{item.currency} {item.amount}</p>}<div className="mt-2 flex flex-wrap items-center gap-3"><span className="text-[10px] text-slate-500">Document hash: {item.documentHash ? `${item.documentHash.slice(0, 12)}…` : 'Not available'}</span>{item.documentId && <button type="button" onClick={() => download(item.key)} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700"><FileText size={13} /> Private bill</button>}</div></article>)}</div> : <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">No service or warranty claims have been added.</p>}
    {notice && !kind && <p role="status" className="mt-3 text-xs text-blue-700">{notice}</p>}{error && !kind && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
    {kind && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-label={kind === 'service' ? 'Add service record' : 'Add warranty claim'}><form onSubmit={saveDraft} className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-7"><header className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-extrabold">{kind === 'service' ? 'Add service / repair' : 'Add warranty claim'}</h3><p className="mt-1 text-xs text-slate-500">Upload a bill to extract details, then review and edit before saving.</p></div><button type="button" onClick={() => setKind('')} aria-label="Close"><X size={20} /></button></header>
      <div className="mt-5 rounded-xl border border-dashed border-blue-200 bg-blue-50/50 p-4"><label className="block text-xs font-bold text-slate-700">Service document (private) · JPG, PNG, WEBP up to 8 MB<input type="file" accept="image/jpeg,image/png,image/webp" required onChange={(e) => selectFile(e.target.files?.[0])} className="mt-2 block w-full text-xs" /></label>{file && <div className="mt-2 flex items-center justify-between text-xs text-slate-600"><span>{file.name}</span><button type="button" onClick={extract} disabled={extracting || !fileData} className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-2 font-bold text-white disabled:opacity-50"><RefreshCw size={13} className={extracting ? 'animate-spin' : ''} />{extracting ? 'Extracting…' : 'Extract details'}</button></div>}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{(kind === 'service' ? SERVICE_FIELDS : CLAIM_FIELDS).map(([field, label, inputType]) => <label key={field} className={`text-xs font-semibold text-slate-700 ${['issueReported','diagnosis','workPerformed','claimDescription','resolution'].includes(field) ? 'sm:col-span-2' : ''}`}>{label}{inputType === 'checkbox' ? <input type="checkbox" checked={values[field] === true || ['true', 'yes'].includes(String(values[field]).toLowerCase())} onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.checked }))} className="ml-2 accent-blue-700" /> : inputType === 'select' ? <select value={values[field] || 'submitted'} onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))} className="mt-1 block h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal">{['submitted','under_review','approved','rejected','in_service','resolved','cancelled'].map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}</select> : <input type={inputType || 'text'} value={values[field] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))} className="mt-1 block h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" />}</label>)}<label className="text-xs font-semibold text-slate-700 sm:col-span-2">Parts replaced (one per line: part name | part number | quantity | cost)<textarea value={Array.isArray(values.partsReplaced) ? values.partsReplaced.map((part) => [part.name, part.partNumber, part.quantity, part.cost].join(' | ')).join('\n') : (values.partsReplaced || '')} onChange={(e) => setValues((v) => ({ ...v, partsReplaced: e.target.value.split('\n').filter(Boolean).map((line) => { const [name, partNumber = '', quantity = '1', cost = ''] = line.split('|').map((x) => x.trim()); return { name, partNumber, quantity: Number(quantity) || 1, cost: cost === '' ? null : Number(cost), warrantyCovered: false }; }) }))} rows={3} className="mt-1 block w-full rounded-lg border border-slate-200 p-3 text-sm font-normal" /></label></div>
      <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900">Saving first stores the document privately, then requests your wallet signature to record its hash and reviewed details on-chain. The document itself is never put on the blockchain.</div>
      {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}{notice && <p role="status" className="mt-3 text-xs text-blue-700">{notice}</p>}
      <footer className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setKind('')} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Cancel</button><button type="submit" disabled={(!fileData && pendingDraft?.kind !== kind) || saving} className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving & recording…' : pendingDraft?.kind === kind ? 'Retry blockchain recording' : 'Save and record on-chain'}</button></footer>
    </form></div>}
  </section>;
}

function formatDate(value) {
  if (!value) return 'Date not provided';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date not provided' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
