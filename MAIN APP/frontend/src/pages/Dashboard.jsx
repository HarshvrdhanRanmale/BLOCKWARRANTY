import {
  Package,
  Plus,
  ArrowRight,
  ShieldCheck,
  Clock3,
  ExternalLink,
  ChevronRight,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  RefreshCw,
  Repeat,
  Sparkles,
  Inbox,
  Wrench,
  Search,
  Menu,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import { useSidebarPreference } from "../components/useSidebarPreference";
import { useAuthFlow } from "../auth/useAuthFlow";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

function getWarrantyExpiry(product) {
  if (!product.purchaseDate) return null;
  const purchaseDate = new Date(product.purchaseDate);
  const warrantyPeriod = Number(product.warrantyPeriod);
  if (!Number.isFinite(purchaseDate.getTime()) || !Number.isFinite(warrantyPeriod) || warrantyPeriod <= 0) {
    return null;
  }

  const unitSeconds = {
    Days: 86400,
    Months: 30 * 86400,
    Years: 365 * 86400,
  }[product.warrantyUnit || "Years"];
  if (!unitSeconds) return null;

  return new Date(purchaseDate.getTime() + warrantyPeriod * unitSeconds * 1000);
}

function getDaysRemaining(expiryDate) {
  if (!expiryDate) return null;
  const now = Date.now();
  const diffMs = expiryDate.getTime() - now;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function formatDate(dateValue) {
  if (!dateValue) return "Recently";
  const d = new Date(dateValue);
  return Number.isNaN(d.getTime()) ? "Recently" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function Dashboard() {
  const { user, token } = useAuthFlow();
  const accountName = user?.name?.trim() || user?.email?.trim().split("@")[0] || "there";
  const displayName = accountName.split(/[\s._-]+/)[0] || "there";
  const { isOpen: sidebarOpen, toggle: toggleSidebar } = useSidebarPreference();

  const [products, setProducts] = useState([]);
  const [pendingTransfers, setPendingTransfers] = useState({ sent: 0, received: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = async () => {
    try {
      const authToken = token || localStorage.getItem("blockwarranty_token") || "";
      const authHeaders = { Authorization: `Bearer ${authToken}` };

      const [productsRes, transfersRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/products`, { headers: authHeaders }),
        fetch(`${API_BASE_URL}/api/transfers/pending-counts`, { headers: authHeaders }).catch(() => null),
      ]);

      if (!productsRes.ok) {
        throw new Error("Unable to fetch registered products");
      }

      const productsData = await productsRes.json();
      setProducts(Array.isArray(productsData) ? productsData : []);

      if (transfersRes && transfersRes.ok) {
        const counts = await transfersRes.json();
        setPendingTransfers({
          sent: Number(counts.sent) || 0,
          received: Number(counts.received) || 0,
        });
      }
      setError("");
    } catch (err) {
      console.error("Dashboard data load error:", err);
      setError(err.message || "Failed to load dashboard overview.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const handleTransfersChanged = () => fetchData();
    const handleProductsChanged = () => fetchData();
    const handleFocus = () => fetchData();

    window.addEventListener("blockwarranty:transfers-changed", handleTransfersChanged);
    window.addEventListener("blockwarranty:products-changed", handleProductsChanged);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("blockwarranty:transfers-changed", handleTransfersChanged);
      window.removeEventListener("blockwarranty:products-changed", handleProductsChanged);
      window.removeEventListener("focus", handleFocus);
    };
  }, [token]);

  // Derive metrics
  const now = Date.now();
  const activeProducts = products.filter((p) => ["Active", "Transferred"].includes(p.status || "Active"));
  const activeWarranties = activeProducts.filter((p) => Number(p.warrantyPeriod) > 0);

  const expiringSoonProducts = products.filter((product) => {
    const expiry = getWarrantyExpiry(product);
    if (!expiry) return false;
    const days = (expiry.getTime() - now) / 86400000;
    return days >= 0 && days <= 30;
  });

  const expiredProducts = products.filter((product) => {
    if (product.status === "Expired") return true;
    const expiry = getWarrantyExpiry(product);
    if (!expiry) return false;
    return (expiry.getTime() - now) < 0;
  });

  const totalPendingActions = pendingTransfers.received + pendingTransfers.sent + expiringSoonProducts.length;

  // Derive recent activity events from actual products
  const recentActivities = products
    .slice()
    .sort((a, b) => new Date(b.createdAt || b.purchaseDate || 0) - new Date(a.createdAt || a.purchaseDate || 0))
    .slice(0, 5)
    .map((p) => {
      const isTransferred = p.status === "Transferred";
      return {
        id: p.productId || p._id,
        type: isTransferred ? "transferred" : "registered",
        title: isTransferred ? `Transferred: ${p.productName}` : `Registered: ${p.productName}`,
        subtitle: `${p.brand || "Brand"} · ${p.category || "Product"} · ID: ${p.productId?.slice(0, 10)}...`,
        date: p.createdAt || p.purchaseDate,
        productId: p.productId,
        status: p.blockchainStatus === "confirmed" ? "On-chain" : "Active",
      };
    });

  // Recent 3 products for preview
  const previewProducts = products.slice(0, 3);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900">
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm transition-opacity md:hidden"
          onClick={toggleSidebar}
          aria-hidden="true"
        />
      )}

      {/* Mobile Top App Bar */}
      <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md md:hidden">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Open menu"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 active:bg-slate-100"
          >
            <Menu size={18} />
          </button>
          <span className="flex items-center gap-2 font-bold text-slate-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white">
              <ShieldCheck size={16} />
            </span>
            <span className="text-sm">BlockWarranty</span>
          </span>
        </div>
      </header>

      <Sidebar
        sidebarOpen={sidebarOpen}
        onToggle={toggleSidebar}
        showBrand
        topOffset={0}
      />

      <main
        className={`min-h-screen min-w-0 transition-[margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          sidebarOpen ? "md:ml-[280px]" : "md:ml-[88px]"
        } ml-0`}
      >
        <div className="mx-auto max-w-[1600px] px-3.5 py-5 sm:px-6 sm:py-7 lg:px-10 lg:py-10">

          {/* =================================================
              WELCOME & HEADER
          ================================================= */}
          <section className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  Account Overview
                </p>
              </div>

              <h1 className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
                Welcome back, {displayName}
              </h1>

              <p className="mt-2 text-sm text-slate-500 sm:text-base">
                Here is what requires your attention across your warranties and digital passports.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/register-product"
                className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition duration-200 hover:bg-blue-700 hover:shadow-blue-500/30"
              >
                <Plus size={18} />
                Register Product
              </Link>

              <Link
                to="/products"
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
              >
                <Package size={17} className="text-blue-600" />
                Manage Inventory
              </Link>
            </div>
          </section>

          {/* =================================================
              SUMMARY CARDS
          ================================================= */}
          <section className="mb-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              icon={<Package size={22} />}
              iconClass="bg-blue-50 text-blue-600"
              number={loading ? "—" : products.length}
              title="Total Products"
              subtitle="Registered in vault"
              link="/products"
            />

            <SummaryCard
              icon={<ShieldCheck size={22} />}
              iconClass="bg-emerald-50 text-emerald-600"
              number={loading ? "—" : activeWarranties.length}
              title="Active Warranties"
              subtitle="Protected on-chain"
              link="/products?filter=active"
            />

            <SummaryCard
              icon={<Clock3 size={22} />}
              iconClass="bg-amber-50 text-amber-600"
              number={loading ? "—" : expiringSoonProducts.length}
              title="Expiring Soon"
              subtitle="Within next 30 days"
              link="/products?filter=expiring"
              badge={expiringSoonProducts.length > 0 ? "Action needed" : null}
              badgeClass="bg-amber-100 text-amber-800"
            />

            <SummaryCard
              icon={<Repeat size={22} />}
              iconClass="bg-indigo-50 text-indigo-600"
              number={loading ? "—" : pendingTransfers.received + pendingTransfers.sent}
              title="Pending Transfers"
              subtitle={`${pendingTransfers.received} incoming · ${pendingTransfers.sent} outgoing`}
              link="/transfer-requests"
              badge={pendingTransfers.received > 0 ? "Needs review" : null}
              badgeClass="bg-indigo-100 text-indigo-800"
            />
          </section>

          {/* =================================================
              ACTION CENTER ("What requires my attention?")
          ================================================= */}
          <section className="mb-9">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                  <Sparkles size={14} />
                </span>
                <h2 className="text-lg font-bold text-slate-950">Action Center</h2>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                {totalPendingActions > 0 ? `${totalPendingActions} item(s) pending` : "All systems normal"}
              </span>
            </div>

            <div className="space-y-3">
              {/* Incoming Transfer Requests */}
              {pendingTransfers.received > 0 && (
                <div className="flex flex-col justify-between gap-4 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 sm:flex-row sm:items-center sm:p-5">
                  <div className="flex items-start gap-3.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
                      <Inbox size={20} />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-indigo-950">
                        {pendingTransfers.received} incoming ownership transfer request{pendingTransfers.received > 1 ? "s" : ""}
                      </p>
                      <p className="mt-0.5 text-xs text-indigo-700">
                        A seller requested to transfer a product passport to your wallet. Review and accept the transfer.
                      </p>
                    </div>
                  </div>
                  <Link
                    to="/transfer-requests"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700"
                  >
                    Review requests
                    <ArrowRight size={14} />
                  </Link>
                </div>
              )}

              {/* Warranties Expiring Soon */}
              {expiringSoonProducts.map((p) => {
                const expiry = getWarrantyExpiry(p);
                const days = getDaysRemaining(expiry);
                return (
                  <div
                    key={p.productId || p._id}
                    className="flex flex-col justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 sm:flex-row sm:items-center sm:p-5"
                  >
                    <div className="flex items-start gap-3.5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
                        <AlertTriangle size={20} />
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-amber-950">
                            Warranty for {p.productName} expires in {days} day{days === 1 ? "" : "s"}
                          </p>
                          <span className="rounded-md bg-amber-200/80 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                            {formatDate(expiry)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-amber-800">
                          {p.brand ? `${p.brand} · ` : ""}Product ID: {p.productId}. File a service claim or download your verified invoice before expiry.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/products/${encodeURIComponent(p.productId || p._id)}`}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-amber-700"
                      >
                        Open Passport
                        <ArrowRight size={14} />
                      </Link>
                    </div>
                  </div>
                );
              })}

              {/* Empty Account Onboarding State */}
              {!loading && products.length === 0 && (
                <div className="flex flex-col items-center justify-center rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-50/80 via-white to-slate-50 p-8 text-center sm:p-10">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-500/25">
                    <Sparkles size={28} />
                  </div>
                  <h3 className="mt-5 text-xl font-extrabold text-slate-950">
                    Welcome to BlockWarranty!
                  </h3>
                  <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
                    Your digital vault is ready. Upload an invoice image or PDF — our AI will automatically extract product details and register an immutable passport on the blockchain.
                  </p>
                  <Link
                    to="/register-product"
                    className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/25 transition hover:bg-blue-700"
                  >
                    <Plus size={18} />
                    Register your first product
                  </Link>
                </div>
              )}

              {/* All Good State */}
              {!loading && products.length > 0 && totalPendingActions === 0 && (
                <div className="flex items-center gap-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 sm:p-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                    <CheckCircle2 size={20} />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-emerald-950">
                      All products and warranties are up to date
                    </p>
                    <p className="mt-0.5 text-xs text-emerald-700">
                      No expiring warranties within 30 days and no pending transfer requests.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* =================================================
              TWO COLUMN LAYOUT: RECENT ACTIVITY & PREVIEW
          ================================================= */}
          <div className="grid gap-8 lg:grid-cols-3">

            {/* Left 2 Cols: Quick Inventory Highlights */}
            <div className="lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">Recent Additions</h2>
                  <p className="text-xs text-slate-500">Latest products registered in your vault</p>
                </div>
                <Link
                  to="/products"
                  className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700"
                >
                  View full inventory ({products.length})
                  <ArrowRight size={14} />
                </Link>
              </div>

              {loading ? (
                <div className="grid gap-4 sm:grid-cols-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="h-32 rounded-xl bg-slate-100" />
                      <div className="mt-3 h-4 w-3/4 rounded bg-slate-100" />
                      <div className="mt-2 h-3 w-1/2 rounded bg-slate-100" />
                    </div>
                  ))}
                </div>
              ) : previewProducts.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
                  <Package size={32} className="mx-auto text-slate-400" />
                  <p className="mt-2 text-sm font-semibold">No products in inventory</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-3">
                  {previewProducts.map((product) => {
                    const expiry = getWarrantyExpiry(product);
                    const days = getDaysRemaining(expiry);
                    return (
                      <Link
                        key={product.productId || product._id}
                        to={`/products/${encodeURIComponent(product.productId || product._id)}`}
                        state={{ product }}
                        className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-blue-300 hover:shadow-md"
                      >
                        <div>
                          <div className="relative flex h-36 items-center justify-center overflow-hidden rounded-xl bg-slate-50">
                            {product.productImage ? (
                              <img
                                src={product.productImage}
                                alt={product.productName}
                                className="h-full w-full object-contain p-3 transition duration-300 group-hover:scale-105"
                              />
                            ) : (
                              <Package size={28} className="text-slate-400" />
                            )}
                            <span className="absolute right-2 top-2 rounded-full border border-slate-200 bg-white/95 px-2 py-0.5 text-[9px] font-bold text-slate-700">
                              {product.status || "Active"}
                            </span>
                          </div>

                          <div className="mt-3">
                            <p className="truncate text-sm font-bold text-slate-900 group-hover:text-blue-600">
                              {product.productName}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {product.brand || product.category || "General"}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 border-t border-slate-100 pt-2 text-[11px] font-semibold">
                          {days != null ? (
                            days <= 30 && days >= 0 ? (
                              <span className="text-amber-600">Expires in {days}d</span>
                            ) : days < 0 ? (
                              <span className="text-rose-600">Expired</span>
                            ) : (
                              <span className="text-emerald-600">{days}d warranty left</span>
                            )
                          ) : (
                            <span className="text-slate-400">No expiry date</span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}

              {/* Quick Actions Shortcuts Bar */}
              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Quick Actions
                </h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Link
                    to="/register-product"
                    className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 transition hover:border-blue-200 hover:bg-blue-50/50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
                      <Plus size={18} />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Add Product</p>
                      <p className="text-[10px] text-slate-500">Scan invoice with AI</p>
                    </div>
                  </Link>

                  <Link
                    to="/transfer-ownership"
                    className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 transition hover:border-indigo-200 hover:bg-indigo-50/50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
                      <Repeat size={18} />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Transfer Item</p>
                      <p className="text-[10px] text-slate-500">Move ownership on-chain</p>
                    </div>
                  </Link>

                  <Link
                    to="/transfer-requests"
                    className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 transition hover:border-emerald-200 hover:bg-emerald-50/50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
                      <Inbox size={18} />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Transfer Requests</p>
                      <p className="text-[10px] text-slate-500">
                        {pendingTransfers.received > 0 ? `${pendingTransfers.received} pending` : "Check pending"}
                      </p>
                    </div>
                  </Link>
                </div>
              </div>
            </div>

            {/* Right 1 Col: Recent Activity Timeline */}
            <div>
              <div className="mb-4">
                <h2 className="text-lg font-bold text-slate-950">Recent Activity</h2>
                <p className="text-xs text-slate-500">Chronological ledger of your events</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                {recentActivities.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500">No recent activity found.</p>
                ) : (
                  <div className="relative space-y-4">
                    {recentActivities.map((act, index) => (
                      <div key={act.id + index} className="flex items-start gap-3 text-xs">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                          {act.type === "transferred" ? <Repeat size={12} /> : <ShieldCheck size={12} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <Link
                            to={`/products/${encodeURIComponent(act.productId)}`}
                            className="font-bold text-slate-900 hover:text-blue-600"
                          >
                            {act.title}
                          </Link>
                          <p className="mt-0.5 truncate text-[11px] text-slate-500">
                            {act.subtitle}
                          </p>
                          <p className="mt-1 text-[10px] text-slate-400">
                            {formatDate(act.date)} · <span className="text-emerald-600 font-semibold">{act.status}</span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>
      </main>
    </div>
  );
}

function SummaryCard({ icon, iconClass, number, title, subtitle, link, badge, badgeClass }) {
  const content = (
    <div className="group relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl transition duration-300 group-hover:scale-105 ${iconClass}`}>
          {icon}
        </div>
        {badge && (
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${badgeClass}`}>
            {badge}
          </span>
        )}
      </div>

      <div className="mt-4">
        <span className="text-3xl font-extrabold tracking-tight text-slate-950">
          {number}
        </span>
        <p className="mt-1 text-sm font-bold text-slate-900">{title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
      </div>
    </div>
  );

  return link ? <Link to={link}>{content}</Link> : content;
}
