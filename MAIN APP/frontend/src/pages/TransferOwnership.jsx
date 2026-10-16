import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { ArrowLeft, ArrowRight, ArrowRightLeft, BadgeCheck, Check, FileText, Package, ShieldCheck, Wallet } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import WorkspaceLayout from '../components/WorkspaceLayout';
import { useAuthFlow } from '../auth/useAuthFlow';
import { apiGet, apiPost } from '../lib/api';
import TransferRequests from './TransferRequests';

const currencies = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD'];

function dateLabel(value) {
  if (!value) return 'Not provided';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not provided' : date.toLocaleDateString();
}

export default function TransferOwnership() {
  const { walletAddress, token, signer, connectWallet, authenticateWithBackend } = useAuthFlow();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [selectedId, setSelectedId] = useState(searchParams.get('productId') || '');
  const requestedProductId = searchParams.get('productId') || '';
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [buyerWallet, setBuyerWallet] = useState('');
  const [step, setStep] = useState(1);
  const [loadedKey, setLoadedKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [requestCounts, setRequestCounts] = useState({ sent: 0, received: 0 });
  const [countsWallet, setCountsWallet] = useState('');
  const productQueryKey = `${walletAddress || ''}|${token || ''}|${requestedProductId}`;
  const loading = Boolean(walletAddress && token) && loadedKey !== productQueryKey;

  useEffect(() => {
    let active = true;
    if (!walletAddress || !token) return () => { active = false; };
    apiGet('/api/transfers/products', token)
      .then((data) => {
        if (!active) return;
        const owned = data.products || [];
        setProducts(owned);
        setSelectedId((currentId) => owned.some((product) => product.productId === currentId)
          ? currentId
          : owned.find((product) => product.productId === requestedProductId)?.productId || owned[0]?.productId || '');
        setError('');
      })
      .catch((fetchError) => {
        if (active) {
          setProducts([]);
          setSelectedId('');
          setError(fetchError.message);
        }
      })
      .finally(() => { if (active) setLoadedKey(productQueryKey); });
    return () => { active = false; };
  }, [walletAddress, token, requestedProductId, productQueryKey]);

  useEffect(() => {
    let active = true;
    if (!walletAddress || !token) return () => { active = false; };

    const refreshCounts = () => apiGet('/api/transfers/pending-counts', token)
      .then((data) => {
        if (!active) return;
        setCountsWallet(walletAddress.toLowerCase());
        setRequestCounts({ sent: Number(data.sent) || 0, received: Number(data.received) || 0 });
      })
      .catch(() => {
        if (!active) return;
        setCountsWallet(walletAddress.toLowerCase());
        setRequestCounts({ sent: 0, received: 0 });
      });

    refreshCounts();
    const timer = window.setInterval(refreshCounts, 30000);
    window.addEventListener('blockwarranty:transfers-changed', refreshCounts);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('blockwarranty:transfers-changed', refreshCounts);
    };
  }, [walletAddress, token]);

  const product = loading ? null : products.find((item) => item.productId === selectedId);
  const activeView = searchParams.get('view') === 'requests' || (!searchParams.has('view') && searchParams.has('tab')) ? 'requests' : 'transfer';
  const normalizedBuyer = buyerWallet.trim();
  const validBuyer = ethers.isAddress(normalizedBuyer) && normalizedBuyer.toLowerCase() !== (walletAddress || '').toLowerCase();
  const validPrice = Number.isFinite(Number(price)) && Number(price) > 0;

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

  async function submitRequest(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!product) return setError('Select a product owned by this wallet.');
    if (!validPrice) return setError('Enter a transfer price greater than zero.');
    if (!validBuyer) return setError('Enter a valid wallet address other than your own.');

    setSubmitting(true);
    try {
      const data = await apiPost('/api/transfers', {
        productId: product.productId,
        price: Number(price),
        currency,
        buyerWallet: normalizedBuyer,
      }, token);
      setNotice(data.message || 'Transfer request sent.');
      window.dispatchEvent(new Event('blockwarranty:transfers-changed'));
      navigate('/transfer-ownership?view=requests&tab=sent#requests', { state: { notice: data.message } });
    } catch (submitError) {
      setError(submitError.message || 'Transfer request could not be sent.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <WorkspaceLayout>
      <header className="mb-2 flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-blue-700">Secure product handover</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950">Transfer ownership</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Send and review product transfer requests. Ownership changes only after the required MetaMask transaction is confirmed.</p>
        </div>
        {walletAddress && <div className="ml-auto flex max-w-full flex-col items-start gap-1 sm:items-end">
          <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500"><Wallet size={13} /> Connected wallet</span>
          <button type="button" onClick={() => connectWallet().catch((connectError) => setError(connectError.message))} title={`${walletAddress} · Reconnect or switch account`} className="inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700">
            <span className="max-w-[190px] truncate">{walletAddress}</span><ArrowRightLeft size={14} className="shrink-0" />
          </button>
        </div>}
      </header>

      <nav className="mb-7 flex gap-1 border-b border-slate-200" aria-label="Ownership views">
        <button type="button" aria-current={activeView === 'transfer' ? 'page' : undefined} onClick={() => setSearchParams({ view: 'transfer' })} className={`inline-flex h-12 items-center gap-2 border-b-2 px-4 text-sm font-bold transition ${activeView === 'transfer' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}><ArrowRightLeft size={16} /> Start a transfer</button>
        <button type="button" aria-current={activeView === 'requests' ? 'page' : undefined} onClick={() => setSearchParams({ view: 'requests', tab: searchParams.get('tab') || 'sent' })} className={`inline-flex h-12 items-center gap-2 border-b-2 px-4 text-sm font-bold transition ${activeView === 'requests' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}><FileText size={16} /> Transfer requests{countsWallet === walletAddress?.toLowerCase() && requestCounts.sent + requestCounts.received > 0 && <span aria-label={`${requestCounts.sent + requestCounts.received} open transfer requests`} className="inline-flex min-w-5 items-center justify-center rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-slate-700">{requestCounts.sent + requestCounts.received > 9 ? '9+' : requestCounts.sent + requestCounts.received}</span>}</button>
      </nav>

      {!walletAddress || !token ? (
        <section className="max-w-2xl border-y border-slate-200 py-8">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Wallet size={20} /></span>
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-slate-900">Connect and authenticate your wallet</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Requests are associated with your signed-in MetaMask address. No private key or seed phrase is requested.</p>
              <button type="button" onClick={connectAndAuthenticate} className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"><Wallet size={16} /> Connect MetaMask</button>
            </div>
          </div>
        </section>
      ) : activeView === 'requests' ? (
        <section id="requests" className="scroll-mt-6">
          <TransferRequests embedded pendingCounts={countsWallet === walletAddress?.toLowerCase() ? requestCounts : undefined} />
        </section>
      ) : (
        <>
        <form onSubmit={submitRequest}>
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.035)]">
            <div className="flex items-center justify-between gap-5 border-b border-slate-100 px-5 py-5 sm:px-7">
              <div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-blue-700">Step {step} of 3</p><h2 className="mt-1 text-xl font-extrabold text-slate-950">{['Select a product', 'Review Product Passport', 'Transfer details'][step - 1]}</h2></div>
              <div className="flex w-28 gap-1.5 sm:w-36" aria-label={`Step ${step} of 3`}>
                {[1, 2, 3].map((number) => <span key={number} className={`h-1.5 flex-1 rounded-full ${number <= step ? 'bg-blue-600' : 'bg-slate-200'}`} />)}
              </div>
            </div>

            <div className="px-5 py-6 sm:px-7 sm:py-8">
              {step === 1 && <>
                <p className="mb-5 text-sm text-slate-600">Choose a product you currently own. Its saved details and Product Passport documents load automatically.</p>
                {loading ? <div className="flex min-h-40 items-center justify-center text-sm text-slate-500">Verifying product ownership on the blockchain…</div> : products.length === 0 ? (
                  <div className="flex min-h-40 flex-col items-center justify-center text-center"><Package size={26} className="text-slate-400" /><p className="mt-3 text-sm font-semibold text-slate-800">No registered products are currently owned by this wallet.</p><p className="mt-1 text-xs text-slate-500">Products appear here only when this wallet is the on-chain owner.</p></div>
                ) : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {products.map((item) => <button key={item.productId} type="button" aria-pressed={selectedId === item.productId} onClick={() => setSelectedId(item.productId)} className={`group min-w-0 rounded-lg border p-3 text-left transition ${selectedId === item.productId ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-200' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}`}>
                    <span className="flex h-28 items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-slate-50 to-blue-50/70 p-3">{item.productImage ? <img src={item.productImage} alt={item.productName} className="h-full w-full object-contain transition duration-200 group-hover:scale-[1.03]" /> : <Package size={30} className="text-slate-400" />}</span>
                    <span className="mt-3 block truncate text-sm font-bold text-slate-900">{item.productName}</span>
                    <span className="mt-1 block truncate text-xs text-slate-500">{item.brand || 'Brand not provided'} · {item.productId}</span>
                    <span className="mt-2 flex items-center justify-between text-xs"><span className="text-slate-600">Warranty: {item.warrantyPeriod ? `${item.warrantyPeriod} ${item.warrantyUnit || 'Years'}` : 'See passport'}</span>{selectedId === item.productId ? <Check size={16} className="text-blue-700" /> : <BadgeCheck size={15} className="text-emerald-600" />}</span>
                  </button>)}
                </div>}
              </>}

              {step === 2 && product && <>
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(250px,0.85fr)]">
                  <div className="flex min-h-52 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-slate-50 to-blue-50/70 p-6">{product.productImage ? <img src={product.productImage} alt={product.productName} className="max-h-64 max-w-full object-contain" /> : <Package size={38} className="text-slate-400" />}</div>
                  <div className="grid content-start gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <PassportField label="Product" value={product.productName} />
                    <PassportField label="Brand / category" value={`${product.brand || 'Not provided'} / ${product.category || 'Not provided'}`} />
                    <PassportField label="Product ID" value={product.productId} />
                    <PassportField label="Purchase date" value={dateLabel(product.purchaseDate)} />
                    <PassportField label="Warranty" value={product.warrantyPeriod ? `${product.warrantyPeriod} ${product.warrantyUnit || 'Years'}` : 'See Product Passport'} />
                    <PassportField label="Current owner" value={walletAddress} mono />
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <span className="inline-flex items-center gap-2 text-sm text-slate-600"><FileText size={16} className="text-blue-700" />{product.hasInvoice ? 'Existing passport invoice stays attached to this product.' : 'No invoice document is attached.'}</span>
                  {product.publicId && <Link to={`/passport/${product.publicId}`} className="text-sm font-semibold text-blue-700 hover:text-blue-900">Open full Product Passport <ArrowRight size={14} className="ml-1 inline" /></Link>}
                </div>
              </>}

              {step === 3 && product && <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(270px,0.8fr)]">
                <div className="space-y-5">
                  <p className="text-sm text-slate-600">Set the agreed amount and enter the buyer’s connected wallet address.</p>
                  <label className="block text-sm font-semibold text-slate-800">Transfer price
                    <span className="mt-1.5 flex gap-2"><input type="number" min="0.01" step="0.01" required value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0.00" className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /><select value={currency} onChange={(event) => setCurrency(event.target.value)} aria-label="Price currency" className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500">{currencies.map((code) => <option key={code}>{code}</option>)}</select></span>
                  </label>
                  <label className="block text-sm font-semibold text-slate-800">Buyer wallet address
                    <input type="text" required value={buyerWallet} onChange={(event) => setBuyerWallet(event.target.value)} placeholder="0x…" autoComplete="off" spellCheck="false" className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 font-mono text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                    {normalizedBuyer && !validBuyer && <span className="mt-1.5 block text-xs font-medium text-red-600">Enter a valid address different from your connected wallet.</span>}
                  </label>
                </div>
                <aside className="rounded-lg bg-slate-50 p-4">
                  <h3 className="text-sm font-bold text-slate-900">Transfer summary</h3>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div><dt className="text-xs text-slate-500">Product</dt><dd className="mt-1 font-semibold text-slate-900">{product.productName}</dd><dd className="mt-0.5 text-xs text-slate-500">{product.productId}</dd></div>
                    <div><dt className="text-xs text-slate-500">Seller wallet</dt><dd className="mt-1 break-all font-mono text-[11px] text-slate-700">{walletAddress}</dd></div>
                    <div><dt className="text-xs text-slate-500">Buyer wallet</dt><dd className="mt-1 break-all font-mono text-[11px] text-slate-700">{normalizedBuyer || 'Not entered'}</dd></div>
                    <div><dt className="text-xs text-slate-500">Agreed amount</dt><dd className="mt-1 text-lg font-extrabold text-slate-950">{validPrice ? `${currency} ${Number(price).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : 'Not entered'}</dd></div>
                  </dl>
                  <p className="mt-4 flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><ShieldCheck size={15} className="mt-0.5 shrink-0" /><span>After the buyer accepts, they pay with Razorpay Test Mode (UPI — no real money). Once the backend verifies the test payment, ownership transfers to the buyer automatically on-chain.</span></p>
                </aside>
              </div>}
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:px-7">
              <button type="button" onClick={() => setStep((current) => Math.max(1, current - 1))} disabled={step === 1} className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-white hover:text-slate-900 disabled:invisible"><ArrowLeft size={16} /> Back</button>
              {error && <p role="alert" className="order-3 w-full text-sm text-red-700 sm:order-none sm:w-auto">{error}</p>}
              {step < 3 ? <button type="button" onClick={() => { if (!product) { setError('Select an on-chain verified product to continue.'); return; } setError(''); setStep((current) => current + 1); }} disabled={loading || !product} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">Continue <ArrowRight size={16} /></button> : <button type="submit" disabled={submitting || !product || !validBuyer || !validPrice} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><ArrowRightLeft size={16} />{submitting ? 'Sending request…' : 'Send transfer request'}</button>}
            </footer>
          </section>
        </form>
        {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
        </>
      )}
      {error && (!walletAddress || !token) && <p role="alert" className="mt-5 max-w-xl rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </WorkspaceLayout>
  );
}

function PassportField({ label, value, mono = false }) {
  return <div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{label}</p><p className={`mt-1 break-words text-sm font-semibold text-slate-800 ${mono ? 'font-mono text-xs' : ''}`}>{value || 'Not provided'}</p></div>;
}