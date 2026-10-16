import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowRightLeft, Check, Clock3, FileText, LoaderCircle, ShieldCheck, Wallet, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import WorkspaceLayout from '../components/WorkspaceLayout';
import { useAuthFlow } from '../auth/useAuthFlow';
import { API_BASE_URL, apiGet, apiPost, getToken } from '../lib/api';
import { openRazorpayCheckout } from '../lib/razorpay';

const tabs = [
  { id: 'sent', label: 'Sent Requests' },
  { id: 'received', label: 'Received Requests' },
  { id: 'history', label: 'Completed Transfers' },
];

function shortWallet(value = '') {
  return value ? `${value.slice(0, 8)}…${value.slice(-6)}` : 'Wallet unavailable';
}

function dateLabel(value) {
  if (!value) return 'Not provided';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not provided' : date.toLocaleString();
}

function transactionUrl(hash) {
  return hash ? `https://sepolia.etherscan.io/tx/${hash}` : '';
}

async function downloadPassportInvoice(product, token) {
  const response = await fetch(`${API_BASE_URL}/api/products/${encodeURIComponent(product.productId)}/invoice`, {
    headers: { Authorization: `Bearer ${token || getToken()}` },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'The passport document could not be retrieved.');
  }
  const objectUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = 'product-passport-invoice';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

function Status({ status }) {
  const styles = {
    pending: 'bg-amber-50 text-amber-800',
    accepted: 'bg-blue-50 text-blue-800',
    rejected: 'bg-rose-50 text-rose-800',
    cancelled: 'bg-slate-100 text-slate-600',
    completed: 'bg-emerald-50 text-emerald-800',
  };
  return <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-bold capitalize ${styles[status] || styles.pending}`}>{status}</span>;
}

export default function TransferRequests({ embedded = false, pendingCounts = { sent: 0, received: 0 } }) {
  const { walletAddress, token, signer, connectWallet, authenticateWithBackend } = useAuthFlow();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = tabs.some((tab) => tab.id === searchParams.get('tab')) ? searchParams.get('tab') : 'sent';
  const [transfers, setTransfers] = useState([]);
  const [loadedKey, setLoadedKey] = useState('');
  const [selected, setSelected] = useState(null);
  const [confirmingAccept, setConfirmingAccept] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const listRequestSequence = useRef(0);

  const requestKey = `${walletAddress || ''}|${token || ''}|${activeTab}`;
  const loading = Boolean(walletAddress && token) && loadedKey !== requestKey;

  const fetchTransfers = useCallback(async () => {
    if (!walletAddress || !token) return { transfers: [] };
    return apiGet(`/api/transfers/${activeTab}`, token);
  }, [activeTab, token, walletAddress]);

  const refreshTransfers = useCallback(async () => {
    const sequence = ++listRequestSequence.current;
    try {
      const data = await fetchTransfers();
      if (sequence === listRequestSequence.current) {
        setTransfers(data.transfers || []);
        setError('');
      }
      return data;
    } catch (loadError) {
      if (sequence === listRequestSequence.current) {
        setTransfers([]);
        setError(loadError.message || 'Transfer requests could not be loaded.');
      }
      throw loadError;
    }
  }, [fetchTransfers]);

  useEffect(() => {
    if (!walletAddress || !token) return undefined;
    let active = true;
    const sequence = ++listRequestSequence.current;
    fetchTransfers()
      .then((data) => {
        if (active && sequence === listRequestSequence.current) {
          setTransfers(data.transfers || []);
          setError('');
        }
      })
      .catch((loadError) => {
        if (active && sequence === listRequestSequence.current) {
          setTransfers([]);
          setError(loadError.message || 'Transfer requests could not be loaded.');
        }
      })
      .finally(() => { if (active) setLoadedKey(requestKey); });
    return () => { active = false; listRequestSequence.current += 1; };
  }, [fetchTransfers, requestKey, token, walletAddress]);

  useEffect(() => {
    if (!walletAddress || !token) return undefined;
    let active = true;
    const refreshReceived = () => {
      const sequence = ++listRequestSequence.current;
      Promise.all([
        fetchTransfers(),
        selected ? apiGet(`/api/transfers/${selected.id}`, token).catch(() => null) : Promise.resolve(null),
      ]).then(([data, detail]) => {
        if (active && sequence === listRequestSequence.current) {
          setTransfers(data.transfers || []);
          if (detail?.transfer) setSelected((current) => current?.id === detail.transfer.id ? detail.transfer : current);
        }
      }).catch(() => {});
    };
    const interval = window.setInterval(refreshReceived, 10000);
    window.addEventListener('focus', refreshReceived);
    return () => {
      active = false;
      listRequestSequence.current += 1;
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshReceived);
    };
  }, [fetchTransfers, selected?.id, token, walletAddress]);

  async function connectAndAuthenticate() {
    setError('');
    try {
      let activeSigner = signer;
      if (!walletAddress) activeSigner = (await connectWallet()).signer;
      if (!token) await authenticateWithBackend(activeSigner);
    } catch (connectError) {
      setError(connectError.message || 'Wallet connection failed.');
    }
  }

  async function openDetails(item) {
    setError('');
    setNotice('');
    setConfirmingAccept(false);
    setLoadingDetails(true);
    try {
      const data = await apiGet(`/api/transfers/${item.id}`, token);
      setSelected(data.transfer);
    } catch (detailError) {
      setError(detailError.message || 'Transfer details could not be loaded.');
    } finally {
      setLoadingDetails(false);
    }
  }

  async function updateRequest(action) {
    if (!selected) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const data = await apiPost(`/api/transfers/${selected.id}/${action}`, {}, token);
      setSelected(data.transfer);
      setNotice(data.message || 'Request updated.');
      setConfirmingAccept(false);
      listRequestSequence.current += 1;
      setTransfers((current) => current.map((transfer) => transfer.id === data.transfer.id ? data.transfer : transfer));
      window.dispatchEvent(new Event('blockwarranty:transfers-changed'));
      await refreshTransfers();
    } catch (actionError) {
      setError(actionError.message || 'Request could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  async function retryAutomaticTransfer() {
    if (!selected || selected.paymentStatus !== 'paid' || selected.status === 'completed') return;
    setBusy(true);
    setError('');
    setNotice('Payment is verified. Retrying the automatic blockchain transfer…');
    try {
      const result = await apiPost(`/api/transfers/${selected.id}/finalize`, {}, token);
      setSelected(result.transfer);
      setNotice(isSeller
        ? 'Product successfully transferred to the new owner.'
        : 'Payment successful! The product has been transferred to your ownership.');
      window.dispatchEvent(new Event('blockwarranty:transfers-changed'));
      listRequestSequence.current += 1;
      await refreshTransfers();
    } catch (retryError) {
      setError(retryError.message || 'Payment is verified, but the ownership transfer is still pending. Retry later.');
      const refreshed = await apiGet(`/api/transfers/${selected.id}`, token).catch(() => null);
      if (refreshed?.transfer) setSelected(refreshed.transfer);
    } finally {
      setBusy(false);
    }
  }

  // Buyer pays the agreed amount with Razorpay Test Mode (UPI). The order is
  // created and the payment is verified entirely by the backend; the browser
  // only passes the checkout response fields through to the verify endpoint.
  async function payWithRazorpay() {
    if (!selected || selected.status !== 'accepted') return;
    setBusy(true);
    setError('');
    setNotice('Creating a Razorpay test order…');
    try {
      const created = await apiPost(`/api/transfers/${selected.id}/payment/create-order`, {}, token);
      const { keyId, orderId, amount, currency } = created;
      if (!keyId || !orderId) {
        throw new Error('The backend did not return a valid Razorpay test order.');
      }
      setNotice('Opening Razorpay test checkout. Choose UPI to complete the payment.');
      await openRazorpayCheckout({
        keyId,
        orderId,
        amountMinor: amount,
        currency,
        name: 'BlockWarranty',
        description: `Test payment for ${selected.product?.productName || 'product transfer'}`,
        onDismiss: () => {
          setError('The Razorpay test payment was cancelled. You can pay again when ready.');
          setNotice('');
          setBusy(false);
        },
        handler: async (response) => {
          try {
            setNotice('Payment submitted. Verifying with the backend…');
            const verified = await apiPost(`/api/transfers/${selected.id}/payment/verify`, {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }, token);

            let latest = verified.transfer;
            // The backend already attempts the automatic relayer transfer during
            // verification. If it verified the payment but could not complete the
            // on-chain step (e.g., a transient RPC error), retry once via /finalize.
            if (verified.paymentVerified && !verified.ownershipTransferred) {
              setSelected(latest);
              setNotice('Payment verified, but ownership is still pending. You can retry the automatic transfer.');
              setError(verified.finalizeError || '');
            } else {
              setSelected(latest);
              setNotice(isSeller
                ? 'Product successfully transferred to the new owner.'
                : 'Payment successful! The product has been transferred to your ownership.');
            }

            listRequestSequence.current += 1;
            setTransfers((current) => current.map((transfer) => transfer.id === latest.id ? latest : transfer));
            window.dispatchEvent(new Event('blockwarranty:transfers-changed'));
            await refreshTransfers();
          } catch (verifyError) {
            setError(verifyError.message || 'The payment could not be verified. If money was debited, contact support.');
          } finally {
            setBusy(false);
          }
        },
      });
    } catch (payError) {
      // Only surface an error if the checkout never opened (dismiss is handled above).
      if (!String(payError.message || '').toLowerCase().includes('cancel')) {
        setError(payError.message || 'The Razorpay test payment could not be started.');
      }
      setNotice('');
      setBusy(false);
    }
  }

  const isSeller = selected?.sellerWallet?.toLowerCase() === walletAddress?.toLowerCase();
  const selectedAuthorized = Boolean(selected && token && walletAddress && [selected.sellerWallet, selected.buyerWallet].some((address) => address?.toLowerCase() === walletAddress.toLowerCase()));
  const otherWallet = (item) => activeTab === 'sent' ? item.buyerWallet : item.sellerWallet;
  const passportPath = (product) => `/passport/${encodeURIComponent(product?.publicId || product?.productId || '')}`;

  const PageLayout = embedded ? Fragment : WorkspaceLayout;

  return (
    <PageLayout>
      {!embedded && <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Ownership activity</p><h1 className="mt-2 text-3xl font-extrabold text-slate-950">Transfer requests</h1><p className="mt-2 text-sm text-slate-600">Requests are private to the seller and intended buyer wallets.</p></div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"><Wallet size={15} className="text-blue-700" /><span className="font-mono">{shortWallet(walletAddress)}</span><button type="button" onClick={() => connectWallet().catch((connectError) => setError(connectError.message))} className="border-l border-slate-200 pl-2 font-bold text-blue-700 hover:text-blue-900">Reconnect</button></div>
      </header>}

      {!walletAddress || !token ? (
        <section className="max-w-2xl border-y border-slate-200 py-8"><div className="flex items-start gap-4"><span className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Wallet size={20} /></span><div><h2 className="font-bold text-slate-900">Connect and authenticate your wallet</h2><p className="mt-1 text-sm leading-6 text-slate-600">Your active MetaMask address determines which requests are visible.</p><button type="button" onClick={connectAndAuthenticate} className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"><Wallet size={16} /> Connect MetaMask</button></div></div></section>
      ) : <>
        <div role="tablist" aria-label="Transfer request categories" className="flex overflow-x-auto border-b border-slate-200">
          {tabs.map((tab) => {
            const count = pendingCounts[tab.id] || 0;
            return <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => setSearchParams({ tab: tab.id })} className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${activeTab === tab.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              {tab.label}
              {tab.id !== 'history' && count > 0 && <span aria-label={`${count} ${tab.id === 'sent' ? 'open sent' : 'pending received'} requests`} className="inline-flex min-w-5 items-center justify-center rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-slate-700">{count > 9 ? '9+' : count}</span>}
            </button>;
          })}
        </div>

        {notice && <p role="status" className="mt-5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
        {error && <p role="alert" className="mt-5 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

        <section className="mt-5">
          {loading ? <div className="flex items-center gap-2 py-12 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={16} /> Loading wallet requests…</div> : transfers.length === 0 ? (
            <div className="border-y border-slate-200 py-12 text-center"><span className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><ArrowRightLeft size={20} /></span><h2 className="mt-3 text-sm font-bold text-slate-900">No {tabs.find((tab) => tab.id === activeTab)?.label.toLowerCase()}</h2><p className="mt-1 text-sm text-slate-500">{activeTab === 'sent' ? 'Start by selecting a product you own.' : 'Requests associated with this wallet will appear here.'}</p>{activeTab === 'sent' && <Link to="/transfer-ownership" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:text-blue-900">Create a transfer request <ArrowRight size={15} /></Link>}</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {transfers.map((item) => <article key={item.id} className="group min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_6px_24px_rgba(15,23,42,0.035)] transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_14px_30px_rgba(15,23,42,0.08)]">
                <div className="relative flex h-40 items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 to-blue-50/80 p-4">
                  {item.product?.productImage ? <img src={item.product.productImage} alt={item.product?.productName || 'Transferred product'} className="h-full w-full object-contain transition duration-200 group-hover:scale-[1.03]" /> : <PackageIcon />}
                  <span className="absolute right-3 top-3"><Status status={item.status} /></span>
                </div>
                <div className="p-4">
                  <h3 className="truncate text-sm font-bold text-slate-950" title={item.product?.productName || 'Product'}>{item.product?.productName || 'Product'}</h3>
                  <p className="mt-1 truncate text-xs text-slate-500">{item.product?.brand || item.product?.category || 'Product'} · {item.product?.productId || 'ID unavailable'}</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
                    <div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{activeTab === 'history' ? 'Ownership' : activeTab === 'sent' ? 'Buyer wallet' : 'Seller wallet'}</p><p className="mt-1 truncate font-mono text-[11px] text-slate-700" title={activeTab === 'sent' ? item.buyerWallet : item.sellerWallet}>{activeTab === 'history' ? `${shortWallet(item.sellerWallet)} → ${shortWallet(item.buyerWallet)}` : shortWallet(otherWallet(item))}</p></div>
                    <div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Agreed amount</p><p className="mt-1 truncate text-sm font-bold text-slate-900">{item.currency} {Number(item.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p></div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500"><span>{dateLabel(item.completedAt || item.createdAt)}</span>{item.transactionHash && <a href={transactionUrl(item.transactionHash)} target="_blank" rel="noreferrer" title={item.transactionHash} className="max-w-[48%] truncate font-mono text-blue-700 hover:underline">Tx: {item.transactionHash.slice(0, 10)}…</a>}</div>
                  {activeTab === 'received' && item.status === 'completed' && <p role="status" className="mt-3 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold leading-5 text-emerald-900"><Check size={15} className="mt-0.5 shrink-0" />Transfer complete. This product is yours.</p>}
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                    <button type="button" onClick={() => openDetails(item)} className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:border-blue-300 hover:text-blue-700">View details</button>
                    {activeTab === 'sent' && item.status === 'accepted' && item.paymentStatus === 'paid' && item.ownershipTransferStatus !== 'confirmed' && <button type="button" onClick={() => openDetails(item)} className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700">View transfer status</button>}
                    {activeTab === 'sent' && item.status === 'accepted' && item.paymentStatus !== 'paid' && <span className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-lg bg-slate-100 px-3 text-xs font-bold text-slate-500"><Clock3 size={14} /> Awaiting buyer payment</span>}
                  </div>
                </div>
              </article>)}
            </div>
          )}
        </section>
      </>}

      {(loadingDetails && walletAddress && token || selectedAuthorized) && <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) { setSelected(null); setConfirmingAccept(false); } }}>
        <section role="dialog" aria-modal="true" aria-labelledby="transfer-details-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white shadow-2xl">
          {loadingDetails ? <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={17} /> Loading authorized details…</div> : selectedAuthorized && <>
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Transfer details</p><h2 id="transfer-details-title" className="mt-1 text-lg font-extrabold text-slate-900">{selected.product?.productName || 'Product'}</h2><p className="mt-1 text-xs text-slate-500">{selected.product?.productId}</p></div><button type="button" aria-label="Close" disabled={busy} onClick={() => { setSelected(null); setConfirmingAccept(false); }} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"><X size={18} /></button></header>
            <div className="space-y-5 px-5 py-5">
              {selected.product?.productImage && <img src={selected.product.productImage} alt={selected.product.productName} className="max-h-52 w-full rounded-lg bg-slate-50 object-contain" />}
              <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                <Info label="Brand / category" value={`${selected.product?.brand || 'Not provided'} / ${selected.product?.category || 'Not provided'}`} />
                <Info label="Warranty" value={selected.product?.warrantyPeriod ? `${selected.product.warrantyPeriod} ${selected.product.warrantyUnit || 'Years'}` : 'See passport'} />
                <Info label="Purchase date" value={dateLabel(selected.product?.purchaseDate)} />
                <Info label="Request status" value={<Status status={selected.status} />} />
                {selected.status === 'accepted' && <Info label="Payment status (Razorpay Test)" value={<span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-bold ${selected.paymentStatus === 'paid' ? 'bg-emerald-50 text-emerald-800' : selected.paymentStatus === 'failed' ? 'bg-rose-50 text-rose-700' : selected.paymentStatus === 'created' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{selected.paymentStatus === 'paid' ? 'Paid (verified)' : selected.paymentStatus === 'failed' ? 'Failed' : selected.paymentStatus === 'created' ? 'Awaiting payment' : 'Not started'}</span>} />}
                <Info label="Seller wallet" value={<span className="break-all font-mono text-xs">{selected.sellerWallet}</span>} />
                <Info label="Buyer wallet" value={<span className="break-all font-mono text-xs">{selected.buyerWallet}</span>} />
                <Info label="Agreed amount" value={`${selected.currency} ${Number(selected.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
                <Info label="Request date" value={dateLabel(selected.createdAt)} />
              </div>
              <div className="flex flex-wrap items-center gap-3 border-y border-slate-200 py-3 text-sm text-slate-700"><FileText size={16} className="text-blue-700" />{selected.product?.hasInvoice ? 'Existing invoice attached to Product Passport' : 'No invoice document attached'}{selected.product?.hasInvoice && <button type="button" disabled={busy} onClick={() => downloadPassportInvoice(selected.product, token).catch((downloadError) => setError(downloadError.message))} className="ml-auto text-xs font-bold text-blue-700 hover:text-blue-900">View document</button>}</div>
              {selected.product?.publicId && <Link to={passportPath(selected.product)} onClick={() => setSelected(null)} className="inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:text-blue-900">Open existing Product Passport <ArrowRight size={15} /></Link>}
              {selected.transactionHash && <p className="break-all text-xs text-slate-500">Transaction: <a className="font-mono text-blue-700 hover:underline" target="_blank" rel="noreferrer" href={transactionUrl(selected.transactionHash)}>{selected.transactionHash}</a></p>}
              {selected.status === 'accepted' && selected.ownershipTransferStatus !== 'confirmed' && <p role="status" className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-900"><ShieldCheck size={17} className="mt-0.5 shrink-0" /><span>{selected.paymentStatus === 'paid' ? 'Payment has been verified. Ownership is still pending until the blockchain confirms the transfer.' : isSeller ? 'The buyer accepted. Once they complete the Razorpay test payment, ownership transfers automatically — no action is required from you.' : 'Pay with Razorpay Test Mode (UPI). After backend verification, ownership transfers automatically and the product appears in My Products.'} This is a Razorpay Test Mode payment — no real money is collected.</span></p>}
              {selected.status === 'completed' && <div role="status" className="flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm leading-5 text-emerald-900"><Check size={18} className="mt-0.5 shrink-0" /><div><p className="font-bold">{isSeller ? 'Product successfully transferred to the new owner.' : 'Payment successful! The product has been transferred to your ownership.'}</p><p className="mt-1">{isSeller ? 'The blockchain confirmed the new owner. This product is no longer in your My Products and remains in ownership history.' : 'The ownership change is confirmed on-chain. The product is now available in My Products.'}</p></div></div>}
              {selected.status === 'accepted' && selected.paymentStatus === 'paid' && selected.ownershipTransferStatus !== 'confirmed' && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Payment verified. Ownership transfer: {selected.ownershipTransferStatus || 'pending'}.{selected.ownershipTransferError ? ` ${selected.ownershipTransferError}` : ''}</div>}
                {notice && <p role="status" className={`rounded-lg border p-3 text-sm ${selected.status === 'completed' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>{notice}</p>}
              {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
              {confirmingAccept && <div className="rounded-lg border border-blue-200 bg-blue-50 p-4"><h3 className="text-sm font-bold text-slate-900">Confirm acceptance</h3><p className="mt-1 text-xs leading-5 text-slate-700">Accept the request for {selected.product?.productName} at {selected.currency} {Number(selected.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}? This records your response only; it does not transfer the product or collect payment.</p><div className="mt-3 flex gap-2"><button type="button" disabled={busy} onClick={() => setConfirmingAccept(false)} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700">Back</button><button type="button" disabled={busy} onClick={() => updateRequest('accept')} className="h-9 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white">{busy ? 'Saving…' : 'Confirm Accept'}</button></div></div>}
              {!confirmingAccept && selected.status === 'completed' && <button type="button" onClick={() => { setSelected(null); setConfirmingAccept(false); setNotice(''); }} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"><Check size={16} /> Done</button>}
              {!confirmingAccept && selected.status !== 'completed' && <div className="flex flex-wrap gap-2 pt-1">
                {!isSeller && selected.status === 'pending' && <><button type="button" disabled={busy} onClick={() => setConfirmingAccept(true)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"><Check size={16} /> Accept Transfer</button><button type="button" disabled={busy} onClick={() => updateRequest('reject')} className="inline-flex h-10 items-center gap-2 rounded-lg border border-rose-200 bg-white px-4 text-sm font-bold text-rose-700 hover:bg-rose-50"><X size={16} /> Reject</button></>}
                {isSeller && selected.status === 'pending' && <button type="button" disabled={busy} onClick={() => updateRequest('cancel')} className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">Cancel request</button>}
                {!isSeller && selected.status === 'accepted' && selected.paymentStatus !== 'paid' && <button type="button" disabled={busy} onClick={payWithRazorpay} className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700">{busy && <LoaderCircle size={16} className="animate-spin" />}{busy ? 'Processing payment…' : 'Pay with UPI (Test Mode)'}</button>}
                {!isSeller && selected.status === 'accepted' && selected.paymentStatus === 'paid' && selected.ownershipTransferStatus !== 'confirmed' && <button type="button" disabled={busy} onClick={retryAutomaticTransfer} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">{busy && <LoaderCircle size={16} className="animate-spin" />}{busy ? 'Retrying transfer…' : 'Retry ownership transfer'}</button>}
                {!isSeller && selected.status === 'accepted' && selected.paymentStatus === 'paid' && selected.ownershipTransferStatus === 'confirmed' && <p role="status" className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-50 px-4 text-sm font-bold text-emerald-800"><Check size={16} /> Ownership confirmed — product is yours.</p>}
                {isSeller && selected.status === 'accepted' && selected.paymentStatus !== 'paid' && <button type="button" disabled className="inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-lg bg-slate-300 px-4 text-sm font-bold text-white opacity-70" title="Waiting for the buyer's verified Razorpay test payment"><LoaderCircle size={16} className="animate-spin" /> Awaiting buyer payment</button>}
                {isSeller && selected.status === 'accepted' && selected.paymentStatus === 'paid' && selected.ownershipTransferStatus !== 'confirmed' && <span className="inline-flex h-10 items-center gap-2 rounded-lg bg-amber-50 px-4 text-sm font-bold text-amber-900"><Clock3 size={16} /> Automatic transfer pending</span>}
              </div>}
            </div>
          </>}
        </section>
      </div>}
    </PageLayout>
  );
}

function Info({ label, value }) {
  return <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p><div className="mt-1 text-sm font-semibold text-slate-800">{value}</div></div>;
}

function PackageIcon() {
  return <Clock3 size={28} className="text-slate-400" />;
}
