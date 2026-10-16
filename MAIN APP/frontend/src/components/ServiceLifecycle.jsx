import { useEffect, useState } from 'react';
import { FileText, Plus, RefreshCw, Wrench, X } from 'lucide-react';
import { sendWalletTransaction } from '../auth/walletService';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const MIME_BY_EXTENSION = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff',
  avif: 'image/avif', heic: 'image/heic', heif: 'image/heif', svg: 'image/svg+xml', pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', md: 'text/markdown', rtf: 'application/rtf',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet', odp: 'application/vnd.oasis.opendocument.presentation',
};
const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
const SERVICE_FIELDS = [
  ['invoiceNumber', 'Bill / invoice number'], ['serviceDate', 'Service date', 'date'], ['serviceCenterName', 'Service center'],
  ['serviceType', 'Service type'], ['issueReported', 'Issue reported'], ['diagnosis', 'Diagnosis'], ['workPerformed', 'Work performed'],
  ['warrantyCovered', 'Warranty covered', 'checkbox']
];
export default function ServiceLifecycle({ product, token, walletAddress }) {
  const [history, setHistory] = useState({ services: [], warrantyClaims: [] });
  const [kind, setKind] = useState('');
  const [file, setFile] = useState(null);
  const [fileType, setFileType] = useState('');
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
    setError(''); setNotice(''); setFile(selected || null); setFileData(''); setExtracted({}); setValues({});
    if (!selected) { setFileData(''); setFileType(''); return; }
    const extension = selected.name.split('.').pop()?.toLowerCase() || '';
    const browserType = selected.type === 'image/jpg' ? 'image/jpeg' : selected.type;
    const normalizedType = Object.values(MIME_BY_EXTENSION).includes(browserType) ? browserType : (MIME_BY_EXTENSION[extension] || browserType || 'application/octet-stream');
    if (selected.size > MAX_DOCUMENT_BYTES) {
      setError('Service document must be 15 MB or smaller.'); setFile(null); setFileType(''); return;
    }
    setFileType(normalizedType);
    const reader = new FileReader();
    reader.onload = () => setFileData(String(reader.result).split(',')[1] || '');
    reader.onerror = () => setError('Could not read this file. Please choose it again.');
    reader.readAsDataURL(selected);
  };

  const extract = async () => {
    if (!fileData || !file) return setError('Upload a service bill image first.');
    setExtracting(true); setError(''); setNotice('');
    try {
      let imageData = fileData;
      let imageType = fileType;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(imageType)) {
        if (!imageType.startsWith('image/')) throw new Error('This document will be saved privately, but automatic extraction is available for images only. Fill in the fields manually to continue.');
        let bitmap;
        try { bitmap = await createImageBitmap(file); } catch { throw new Error('This image format can be attached, but your browser could not convert it for automatic extraction. Fill in the details manually to continue.'); }
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext('2d').drawImage(bitmap, 0, 0);
        bitmap.close?.();
        const converted = await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not prepare the image for extraction.')), 'image/jpeg', 0.92));
        imageData = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] || ''); reader.onerror = reject; reader.readAsDataURL(converted); });
        imageType = 'image/jpeg';
      }
      const response = await fetch(`${API_BASE}/api/products/${encodeURIComponent(product.productId)}/services/extract`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileData: imageData, fileType: imageType, fileName: file.name })
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
      const confirmedData = { ...values };
      for (const field of ['laborCost', 'partsCost', 'totalCost', 'currency', 'customerCost']) {
        delete confirmedData[field];
      }
      if (Array.isArray(confirmedData.partsReplaced)) {
        confirmedData.partsReplaced = confirmedData.partsReplaced.map(({ name, partNumber, quantity, warrantyCovered }) => ({
          name, partNumber, quantity, warrantyCovered
        }));
      }
      let recordId = pendingDraft?.kind === kind ? pendingDraft.recordId : null;
      if (!recordId) {
        const response = await fetch(`${API_BASE}/api/products/${encodeURIComponent(product.productId)}/services/drafts`, {
          method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, fileData, fileType, fileName: file?.name, extractedData: extracted, confirmedData })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || result.error || 'Could not save private draft.');
        recordId = result.draft.serviceId;
        setPendingDraft({ kind, recordId });
      }
      const chainPath = `${API_BASE}/api/products/${encodeURIComponent(product.productId)}/services`;
      const prepareResponse = await fetch(`${chainPath}/prepare`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, recordId }) });
      const prepared = await prepareResponse.json();
      if (!prepareResponse.ok) throw new Error(`${prepared.message || 'Could not prepare on-chain recording.'} Your private draft is saved.`);
      const txHash = await sendWalletTransaction(prepared, prepared.chainId, walletAddress || product.walletAddress);
      const confirmResponse = await fetch(`${chainPath}/confirm`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, recordId, txHash }) });
      const confirmed = await confirmResponse.json();
      if (!confirmResponse.ok) throw new Error(`${confirmed.message || 'Could not verify the chain transaction.'} Your private draft is saved.`);
      setNotice(confirmed.message); setKind(''); setFile(null); setFileData(''); setFileType(''); setValues({}); setExtracted({}); setPendingDraft(null);
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
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Wrench size={17} /></span><div><h2 className="text-sm font-bold text-slate-900">Service & warranty history</h2><p className="text-xs text-slate-500">Service documents stay private. Confirmed lifecycle entries are recorded on-chain.</p></div></div><div className="flex gap-2"><button type="button" onClick={() => { setKind('service'); setError(''); setNotice(''); }} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white"><Plus size={14} /> Add service</button></div></header>
    {entries.length ? <div className="space-y-3">{entries.map((item) => <article key={item.key} className="rounded-2xl bg-slate-50 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-bold text-slate-900">{item.kind}{item.details ? ` · ${item.details}` : ''}</p><p className="mt-1 text-xs text-slate-500">{item.serviceCenterName || 'Service center not provided'} · {formatDate(item.date || item.createdAt)}</p></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-800">{item.status === 'confirmed' ? 'Blockchain confirmed' : 'Draft · not on-chain'}</span></div>{item.partsReplaced?.length > 0 && <p className="mt-2 text-xs text-slate-600">Parts: {item.partsReplaced.map((part) => `${part.name}${part.quantity > 1 ? ` ×${part.quantity}` : ''}`).join(', ')}</p>}{item.amount != null && <p className="mt-2 text-xs font-semibold text-slate-700">{item.currency} {item.amount}</p>}<div className="mt-2 flex flex-wrap items-center gap-3"><span className="text-[10px] text-slate-500">Document hash: {item.documentHash ? `${item.documentHash.slice(0, 12)}…` : 'Not available'}</span>{item.documentId && <button type="button" onClick={() => download(item.key)} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700"><FileText size={13} /> Private bill</button>}</div></article>)}</div> : <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">No service or warranty claims have been added.</p>}
    {notice && !kind && <p role="status" className="mt-3 text-xs text-blue-700">{notice}</p>}{error && !kind && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
    {kind && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label="Add service record">
      <form onSubmit={saveDraft} className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-7">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Wrench size={20} /></span>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-700">Product record</p><h3 className="mt-1 text-xl font-extrabold tracking-tight text-slate-950">Add service / repair</h3><p className="mt-1 text-sm text-slate-500">Attach the bill and add the key details for this visit.</p></div>
          </div>
          <button type="button" onClick={() => setKind('')} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"><X size={20} /></button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          <section aria-label="Attach service document">
            <div className="mb-2 flex items-center justify-between gap-3"><div><h4 className="text-sm font-bold text-slate-900">Service document <span className="font-medium text-red-500">Required</span></h4><p className="mt-0.5 text-xs text-slate-500">Your file stays private and is never uploaded to the blockchain.</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">Up to 15 MB</span></div>
            <input id="service-document-upload" type="file" required onChange={(e) => selectFile(e.target.files?.[0])} className="sr-only" />
            <label htmlFor="service-document-upload" className="group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/60 px-4 py-6 text-center transition hover:border-blue-400 hover:bg-blue-50 sm:flex-row sm:gap-4 sm:text-left">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm"><FileText size={22} /></span>
              <span className="mt-3 min-w-0 flex-1 sm:mt-0">{file ? <><span className="block break-all text-sm font-bold text-slate-800">{file.name}</span><span className="mt-1 block text-xs text-slate-500">{formatFileSize(file.size)} · Select to replace</span></> : <><span className="block text-sm font-bold text-slate-800">Choose a bill, invoice, or service document</span><span className="mt-1 block text-xs text-slate-500">Images and common document formats · 15 MB maximum</span></>}</span>
              <span className="mt-4 inline-flex shrink-0 items-center rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-xs font-bold text-blue-700 shadow-sm group-hover:border-blue-300 sm:mt-0">{file ? 'Replace file' : 'Choose file'}</span>
            </label>
            {file && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5"><p className="text-xs leading-5 text-slate-500">{fileType.startsWith('image/') ? 'You can extract a first draft from this image, then review the fields below.' : 'Document attached. Enter the details below manually.'}</p>{fileType.startsWith('image/') && <button type="button" onClick={extract} disabled={extracting || !fileData} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-800 disabled:opacity-50"><RefreshCw size={13} className={extracting ? 'animate-spin' : ''} />{extracting ? 'Reading image…' : 'Extract details'}</button>}</div>}
          </section>

          <section>
            <div className="mb-3"><h4 className="text-sm font-bold text-slate-900">Visit details</h4><p className="mt-0.5 text-xs text-slate-500">Add the information you have. You can leave other fields blank.</p></div>
            <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
              {SERVICE_FIELDS.map(([field, label, inputType]) => {
                const isWide = ['issueReported', 'diagnosis', 'workPerformed', 'claimDescription', 'resolution'].includes(field);
                if (inputType === 'checkbox') return <label key={field} className="flex min-h-12 cursor-pointer items-center justify-between rounded-xl border border-slate-200 px-3.5 text-sm font-semibold text-slate-700"><span>{label}</span><input type="checkbox" checked={values[field] === true || ['true', 'yes'].includes(String(values[field]).toLowerCase())} onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.checked }))} className="h-4 w-4 rounded accent-blue-700" /></label>;
                return <label key={field} className={`block text-xs font-semibold text-slate-700 ${isWide ? 'sm:col-span-2' : ''}`}>{label}{['issueReported', 'diagnosis', 'workPerformed', 'claimDescription', 'resolution'].includes(field) ? <textarea value={values[field] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))} rows={field === 'workPerformed' || field === 'claimDescription' ? 3 : 2} className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-normal outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50" /> : inputType === 'select' ? <select value={values[field] || 'submitted'} onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))} className="mt-1.5 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-normal outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50">{['submitted', 'under_review', 'approved', 'rejected', 'in_service', 'resolved', 'cancelled'].map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}</select> : <input type={inputType || 'text'} value={values[field] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))} className="mt-1.5 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-normal outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50" />}</label>;
              })}
              <label className="block text-xs font-semibold text-slate-700 sm:col-span-2">Parts replaced <span className="font-normal text-slate-400">(optional, one per line: part name | part number | quantity)</span><textarea value={Array.isArray(values.partsReplaced) ? values.partsReplaced.map((part) => [part.name, part.partNumber, part.quantity].filter(Boolean).join(' | ')).join('\n') : (values.partsReplaced || '')} onChange={(e) => setValues((v) => ({ ...v, partsReplaced: e.target.value.split('\n').filter(Boolean).map((line) => { const [name, partNumber = '', quantity = '1'] = line.split('|').map((x) => x.trim()); return { name, partNumber, quantity: Number(quantity) || 1, warrantyCovered: false }; }) }))} rows={3} className="mt-1.5 block w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm font-normal outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50" /></label>
            </div>
          </section>

          <div className="rounded-2xl border border-blue-100 bg-blue-50/80 p-4 text-xs leading-5 text-blue-900"><p className="font-bold">Private document · verified record</p><p className="mt-1">The document is stored privately. After saving, your wallet will ask you to record its hash and reviewed details on-chain.</p></div>
          {error && <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-700">{error}</p>}{notice && <p role="status" className="rounded-xl bg-blue-50 px-3.5 py-3 text-sm text-blue-700">{notice}</p>}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-7"><button type="button" onClick={() => setKind('')} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Cancel</button><button type="submit" disabled={(!fileData && pendingDraft?.kind !== kind) || saving} className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Saving & recording…' : pendingDraft?.kind === kind ? 'Retry blockchain recording' : 'Save and record on-chain'}</button></footer>
      </form>
    </div>}
  </section>;
}

function formatDate(value) {
  if (!value) return 'Date not provided';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date not provided' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
