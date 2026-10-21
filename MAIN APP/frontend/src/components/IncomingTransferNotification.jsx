import { useEffect, useState, useCallback, useRef } from 'react';
import { ArrowRight, X, Package } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthFlow } from '../auth/useAuthFlow';
import { apiGet } from '../lib/api';

const TOTAL_DURATION_MS = 20000;

function shortWallet(val = '') {
  if (!val) return 'Unknown seller';
  return `${val.slice(0, 6)}…${val.slice(-4)}`;
}

export default function IncomingTransferNotification() {
  const { walletAddress, token } = useAuthFlow();
  const navigate = useNavigate();
  const location = useLocation();

  const [pendingTransfers, setPendingTransfers] = useState([]);
  const [dismissedIds, setDismissedIds] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('bw_dismissed_transfers') || '[]');
    } catch {
      return [];
    }
  });

  const [remainingMs, setRemainingMs] = useState(TOTAL_DURATION_MS);
  const [isTabHidden, setIsTabHidden] = useState(typeof document !== 'undefined' ? document.hidden : false);
  const [isHovered, setIsHovered] = useState(false);
  const currentTransferIdRef = useRef('');

  const fetchReceived = useCallback(async () => {
    if (!walletAddress || !token) {
      setPendingTransfers([]);
      return;
    }
    try {
      const data = await apiGet('/api/transfers/received', token);
      const incoming = (data?.transfers || []).filter((t) => t.status === 'pending');
      setPendingTransfers(incoming);
    } catch {
      // silently ignore transient network or polling errors
    }
  }, [walletAddress, token]);

  useEffect(() => {
    fetchReceived();
    const interval = window.setInterval(fetchReceived, 15000);
    window.addEventListener('blockwarranty:transfers-changed', fetchReceived);
    window.addEventListener('focus', fetchReceived);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('blockwarranty:transfers-changed', fetchReceived);
      window.removeEventListener('focus', fetchReceived);
    };
  }, [fetchReceived]);

  // Track tab visibility so timer only counts down while the tab is actively open/visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabHidden(document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', () => setIsTabHidden(false));

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Filter out transfers the user dismissed in this session
  const activeTransfers = pendingTransfers.filter((t) => !dismissedIds.includes(t.id));

  // If user is already on the received requests tab, avoid showing the popup
  const searchParams = new URLSearchParams(location.search);
  const isViewingReceived =
    location.pathname === '/transfer-ownership' &&
    searchParams.get('tab') === 'received';

  const shouldShow =
    Boolean(walletAddress && token) &&
    activeTransfers.length > 0 &&
    !isViewingReceived;

  const latest = activeTransfers[0];
  const count = activeTransfers.length;

  // Reset countdown to 20 seconds only when a new transfer appears
  useEffect(() => {
    if (latest?.id && latest.id !== currentTransferIdRef.current) {
      currentTransferIdRef.current = latest.id;
      setRemainingMs(TOTAL_DURATION_MS);
    }
  }, [latest?.id]);

  const handleDismiss = useCallback(() => {
    const updated = [...new Set([...dismissedIds, ...activeTransfers.map((t) => t.id)])];
    setDismissedIds(updated);
    try {
      sessionStorage.setItem('bw_dismissed_transfers', JSON.stringify(updated));
    } catch {
      // storage unavailable
    }
  }, [activeTransfers, dismissedIds]);

  // 20-second active countdown: only runs when tab is active/visible and not hovered
  useEffect(() => {
    if (!shouldShow || isTabHidden || isHovered) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setRemainingMs((prev) => {
        if (prev <= 100) {
          handleDismiss();
          return 0;
        }
        return prev - 100;
      });
    }, 100);

    return () => window.clearInterval(interval);
  }, [shouldShow, isTabHidden, isHovered, handleDismiss]);

  if (!shouldShow) {
    return null;
  }

  const handleReview = () => {
    handleDismiss();
    const targetUrl = latest?.id
      ? `/transfer-ownership?view=requests&tab=received&transferId=${encodeURIComponent(latest.id)}#requests`
      : '/transfer-ownership?view=requests&tab=received#requests';
    navigate(targetUrl);
  };

  const progressPercent = Math.max(0, Math.min(100, (remainingMs / TOTAL_DURATION_MS) * 100));

  return (
    <aside
      aria-label="Incoming product transfer notification"
      className="fixed bottom-6 right-6 z-50 w-[calc(100vw-2.5rem)] max-w-sm transition-all duration-300 ease-out"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-[0_14px_40px_rgba(15,23,42,0.14)] backdrop-blur-md transition-all hover:border-[#BFDBFE]">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2563EB] opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#2563EB]" />
            </span>
            <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#2563EB]">
              Transfer Request
            </span>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss notification"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={15} />
          </button>
        </div>

        {/* Product / Request Info */}
        <div className="mt-3 flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#E0EFFF] text-[#2563EB]">
            {latest.product?.productImage ? (
              <img
                src={latest.product.productImage}
                alt={latest.product?.productName || 'Product'}
                className="h-full w-full object-contain p-1"
              />
            ) : (
              <Package size={20} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-sm font-bold text-slate-900" title={latest.product?.productName}>
              {latest.product?.productName || 'Incoming Product Transfer'}
            </h4>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              From: <span className="font-mono text-slate-700">{shortWallet(latest.sellerWallet)}</span>
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-700">
              Agreed: <span className="font-bold text-[#2563EB]">{latest.currency} {Number(latest.price).toLocaleString()}</span>
            </p>
          </div>
        </div>

        {/* Footer with actions */}
        <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <span className="text-[11px] font-medium text-slate-500">
            {count > 1 ? `+${count - 1} more waiting` : 'Awaiting your review'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              Later
            </button>
            <button
              type="button"
              onClick={handleReview}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#2563EB] px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#1D4ED8]"
            >
              Review <ArrowRight size={13} />
            </button>
          </div>
        </div>

        {/* 20-second active countdown progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#2563EB] to-[#60A5FA] transition-[width] duration-100 ease-linear"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </aside>
  );
}
