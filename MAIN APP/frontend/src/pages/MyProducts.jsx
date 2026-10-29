import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  Box,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Filter,
  Grid,
  List,
  Package,
  Plus,
  Repeat,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Wrench,
  X,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import WorkspaceLayout from "../components/WorkspaceLayout";
import { useAuthFlow } from "../auth/useAuthFlow";
import { apiGet } from "../lib/api";

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
  if (!dateValue) return "Not specified";
  const d = new Date(dateValue);
  return Number.isNaN(d.getTime()) ? "Not specified" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function MyProducts() {
  const { token } = useAuthFlow();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilter = searchParams.get("filter") || "all";

  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All categories");
  const [warrantyFilter, setWarrantyFilter] = useState(
    ["active", "expiring", "expired"].includes(initialFilter) ? initialFilter : "all"
  );
  const [sortOrder, setSortOrder] = useState("newest");
  const [viewMode, setViewMode] = useState("grid"); // 'grid' | 'table'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const fetchProducts = async () => {
      try {
        const data = await apiGet("/api/products", token);
        if (!Array.isArray(data)) throw new Error("The product service returned invalid data.");
        if (isMounted) setProducts(data);
      } catch (fetchError) {
        console.error("My Products load error:", fetchError);
        if (isMounted) setError(fetchError.message || "Unable to load your products.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchProducts();

    const handleTransfersChanged = () => { if (isMounted) fetchProducts(); };
    const handleProductsChanged = () => { if (isMounted) fetchProducts(); };
    const handleFocus = () => { if (isMounted) fetchProducts(); };

    window.addEventListener("blockwarranty:transfers-changed", handleTransfersChanged);
    window.addEventListener("blockwarranty:products-changed", handleProductsChanged);
    window.addEventListener("focus", handleFocus);
    return () => {
      isMounted = false;
      window.removeEventListener("blockwarranty:transfers-changed", handleTransfersChanged);
      window.removeEventListener("blockwarranty:products-changed", handleProductsChanged);
      window.removeEventListener("focus", handleFocus);
    };
  }, [token]);

  // Unique categories
  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category).filter(Boolean))].sort(),
    [products]
  );

  // Filter and sort products
  const now = Date.now();
  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return products
      .filter((product) => {
        // Text search
        const matchesQuery = !query || [
          product.productName,
          product.brand,
          product.category,
          product.productId,
          product.invoiceNumber,
        ].some((value) => String(value || "").toLowerCase().includes(query));

        // Category filter
        const matchesCategory =
          categoryFilter === "All categories" || product.category === categoryFilter;

        // Warranty filter
        const expiry = getWarrantyExpiry(product);
        const days = expiry ? (expiry.getTime() - now) / 86400000 : null;
        const hasWarranty = Number(product.warrantyPeriod) > 0;

        let matchesWarranty = true;
        if (warrantyFilter === "active") {
          matchesWarranty = hasWarranty && (days == null || days > 30);
        } else if (warrantyFilter === "expiring") {
          matchesWarranty = hasWarranty && days != null && days >= 0 && days <= 30;
        } else if (warrantyFilter === "expired") {
          matchesWarranty = product.status === "Expired" || (hasWarranty && days != null && days < 0);
        }

        return matchesQuery && matchesCategory && matchesWarranty;
      })
      .sort((left, right) => {
        if (sortOrder === "name") {
          return String(left.productName || "").localeCompare(right.productName || "");
        }
        if (sortOrder === "expiry") {
          const expLeft = getWarrantyExpiry(left)?.getTime() || Infinity;
          const expRight = getWarrantyExpiry(right)?.getTime() || Infinity;
          return expLeft - expRight;
        }
        const leftDate = new Date(left.createdAt || left.purchaseDate || 0).getTime();
        const rightDate = new Date(right.createdAt || right.purchaseDate || 0).getTime();
        return sortOrder === "oldest" ? leftDate - rightDate : rightDate - leftDate;
      });
  }, [products, search, categoryFilter, warrantyFilter, sortOrder, now]);

  // Overall counts
  const counts = useMemo(() => {
    let active = 0;
    let expiring = 0;
    let expired = 0;
    products.forEach((p) => {
      const expiry = getWarrantyExpiry(p);
      const days = expiry ? (expiry.getTime() - now) / 86400000 : null;
      const hasWarranty = Number(p.warrantyPeriod) > 0;
      if (p.status === "Expired" || (hasWarranty && days != null && days < 0)) {
        expired++;
      } else if (hasWarranty && days != null && days >= 0 && days <= 30) {
        expiring++;
      } else if (hasWarranty) {
        active++;
      }
    });
    return { total: products.length, active, expiring, expired };
  }, [products, now]);

  const clearAllFilters = () => {
    setSearch("");
    setCategoryFilter("All categories");
    setWarrantyFilter("all");
    setSortOrder("newest");
    setSearchParams({});
  };

  const hasActiveFilters = search || categoryFilter !== "All categories" || warrantyFilter !== "all";

  return (
    <WorkspaceLayout>
      {/* Header */}
      <div className="mb-7">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700">My Products</span>
            </div>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
              My Products
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              Manage your registered items, inspect on-chain warranty details, and file service records.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/register-product"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
            >
              <Plus size={17} />
              Register product
            </Link>
          </div>
        </div>
      </div>

      {/* Metrics Bar */}
      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Inventory metrics">
        <button
          type="button"
          onClick={() => setWarrantyFilter("all")}
          className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${
            warrantyFilter === "all" ? "border-blue-500 bg-blue-50/50 shadow-sm" : "border-slate-200 bg-white hover:bg-slate-50"
          }`}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <Package size={18} />
          </span>
          <div>
            <p className="text-xs text-slate-500">All Products</p>
            <p className="text-xl font-bold text-slate-900">{counts.total}</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setWarrantyFilter("active")}
          className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${
            warrantyFilter === "active" ? "border-emerald-500 bg-emerald-50/50 shadow-sm" : "border-slate-200 bg-white hover:bg-slate-50"
          }`}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <ShieldCheck size={18} />
          </span>
          <div>
            <p className="text-xs text-slate-500">Active Warranties</p>
            <p className="text-xl font-bold text-emerald-700">{counts.active}</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setWarrantyFilter("expiring")}
          className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${
            warrantyFilter === "expiring" ? "border-amber-500 bg-amber-50/50 shadow-sm" : "border-slate-200 bg-white hover:bg-slate-50"
          }`}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <Clock3 size={18} />
          </span>
          <div>
            <p className="text-xs text-slate-500">Expiring Soon</p>
            <p className="text-xl font-bold text-amber-700">{counts.expiring}</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setWarrantyFilter("expired")}
          className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${
            warrantyFilter === "expired" ? "border-rose-500 bg-rose-50/50 shadow-sm" : "border-slate-200 bg-white hover:bg-slate-50"
          }`}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
            <ShieldAlert size={18} />
          </span>
          <div>
            <p className="text-xs text-slate-500">Expired</p>
            <p className="text-xl font-bold text-rose-700">{counts.expired}</p>
          </div>
        </button>
      </section>

      {/* Main Workspace Card with Search, Multi-Filter, Sorting & View Toggle */}
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        
        {/* Controls Toolbar */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-950">My Products</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {loading ? "Loading items..." : `Showing ${filteredProducts.length} of ${products.length} products`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative min-w-[220px] flex-1 sm:w-64 sm:flex-initial">
              <Search
                size={16}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, brand, or ID..."
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {/* Category Dropdown */}
            <div className="relative">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="Filter category"
                className="h-10 appearance-none rounded-xl border border-slate-200 bg-white pl-3.5 pr-8 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option>All categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <SlidersHorizontal size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>

            {/* Sort Dropdown */}
            <div className="relative">
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                aria-label="Sort products"
                className="h-10 appearance-none rounded-xl border border-slate-200 bg-white pl-3.5 pr-8 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="name">Name A–Z</option>
                <option value="expiry">Expiry (Soonest)</option>
              </select>
              <ArrowDownUp size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>

            {/* View Mode Toggle: Grid / Table */}
            <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                aria-label="Grid view"
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
                  viewMode === "grid" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                }`}
              >
                <Grid size={15} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                aria-label="Table view"
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
                  viewMode === "table" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                }`}
              >
                <List size={15} />
              </button>
            </div>

            {/* Clear filters shortcut */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
              >
                <X size={14} />
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Content Body */}
        {error ? (
          <StatePanel icon={<Box size={24} />} title="Products could not be loaded" message={error} />
        ) : loading ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-2xl border border-slate-200 p-4">
                <div className="h-44 rounded-xl bg-slate-100" />
                <div className="mt-4 h-4 w-3/4 rounded bg-slate-100" />
                <div className="mt-2 h-3 w-1/2 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <StatePanel
            icon={<Package size={26} />}
            title="Your inventory is empty"
            message="Register a product to track its blockchain passport, invoice, warranty term, and maintenance history."
            action={
              <Link
                to="/register-product"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-700"
              >
                <Plus size={15} />
                Register a product
              </Link>
            }
          />
        ) : filteredProducts.length === 0 ? (
          <StatePanel
            icon={<Search size={24} />}
            title="No matching products found"
            message="No products match your current search and filters. Try clearing filters or using another keyword."
            action={
              <button
                type="button"
                onClick={clearAllFilters}
                className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-blue-600 hover:bg-slate-50"
              >
                Clear all filters
              </button>
            }
          />
        ) : viewMode === "grid" ? (
          /* Grid Card Layout */
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredProducts.map((product) => (
              <InventoryProductCard key={product.productId || product._id} product={product} />
            ))}
          </div>
        ) : (
          /* Table View Layout */
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3.5">Product</th>
                  <th className="px-4 py-3.5">Category</th>
                  <th className="px-4 py-3.5">Purchase Date</th>
                  <th className="px-4 py-3.5">Warranty Status</th>
                  <th className="px-4 py-3.5">Registration</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredProducts.map((product) => {
                  const expiry = getWarrantyExpiry(product);
                  const days = getDaysRemaining(expiry);
                  return (
                    <tr key={product.productId || product._id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 p-1">
                            {product.productImage ? (
                              <img src={product.productImage} alt="" className="h-full w-full object-contain" />
                            ) : (
                              <Package size={16} className="text-slate-400" />
                            )}
                          </div>
                          <div>
                            <Link
                              to={`/products/${encodeURIComponent(product.productId || product._id)}`}
                              state={{ product }}
                              className="font-bold text-slate-900 hover:text-blue-600"
                            >
                              {product.productName}
                            </Link>
                            <p className="text-[11px] text-slate-500">{product.brand || "Brand not specified"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-medium text-slate-600">
                        {product.category || "General"}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">
                        {formatDate(product.purchaseDate)}
                      </td>
                      <td className="px-4 py-3.5">
                        {days != null ? (
                          days <= 30 && days >= 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
                              <Clock3 size={11} /> Expires in {days}d
                            </span>
                          ) : days < 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-bold text-rose-800">
                              Expired
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                              <ShieldCheck size={11} /> {days}d active
                            </span>
                          )
                        ) : (
                          <span className="text-slate-400">None</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-700">
                          {product.blockchainStatus === "confirmed" ? "On-chain" : product.status || "Active"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            to={`/products/${encodeURIComponent(product.productId || product._id)}`}
                            state={{ product }}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-600"
                          >
                            Passport
                          </Link>
                          <Link
                            to={`/transfer-ownership?productId=${encodeURIComponent(product.productId)}`}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 hover:text-indigo-600"
                          >
                            Transfer
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer info bar */}
        {!loading && products.length > 0 && (
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500">
            <p>
              Showing <span className="font-semibold text-slate-700">{filteredProducts.length}</span> of{" "}
              <span className="font-semibold text-slate-700">{products.length}</span> items
            </p>
            <div className="inline-flex items-center gap-1.5 text-slate-400">
              <CheckCircle2 size={14} className="text-blue-600" />
              <span>All products are cryptographically linked to your wallet</span>
            </div>
          </div>
        )}
      </section>
    </WorkspaceLayout>
  );
}

function InventoryProductCard({ product }) {
  const expiry = getWarrantyExpiry(product);
  const days = getDaysRemaining(expiry);
  const isExpiring = days != null && days <= 30 && days >= 0;
  const isExpired = days != null && days < 0;

  return (
    <div className="group flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-md">
      <div className="flex flex-1 flex-col">
        {/* Product Image Header */}
        <div className="relative flex h-48 shrink-0 items-center justify-center overflow-hidden bg-slate-50 p-4">
          {product.productImage ? (
            <img
              src={product.productImage}
              alt={product.productName}
              className="h-full w-full object-contain transition duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-slate-400">
              <Package size={32} />
              <span className="text-[11px]">No image</span>
            </div>
          )}

          {/* Blockchain Verified Pill */}
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/95 px-2.5 py-1 text-[10px] font-bold text-slate-700 shadow-sm backdrop-blur-sm">
            <ShieldCheck size={12} className="text-blue-600" />
            Verified
          </span>

          {/* Warranty Badge */}
          {days != null ? (
            <span
              className={`absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold shadow-sm backdrop-blur-sm ${
                isExpired
                  ? "bg-rose-100/90 text-rose-800"
                  : isExpiring
                  ? "bg-amber-100/95 text-amber-800 border border-amber-300"
                  : "bg-emerald-100/90 text-emerald-800"
              }`}
            >
              {isExpired ? "Expired" : isExpiring ? `⚠️ ${days}d left` : `${days}d left`}
            </span>
          ) : null}
        </div>

        {/* Card Body */}
        <div className="flex flex-1 flex-col justify-between p-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {[product.brand, product.category].filter(Boolean).join(" · ") || "Product"}
            </p>
            <h3 className="mt-1 line-clamp-2 text-base font-bold text-slate-900 group-hover:text-blue-600" title={product.productName}>
              {product.productName}
            </h3>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2.5 text-[11px]">
            <div>
              <p className="text-slate-400">Purchased</p>
              <p className="font-semibold text-slate-700">{formatDate(product.purchaseDate)}</p>
            </div>
            <div>
              <p className="text-slate-400">Warranty Term</p>
              <p className="font-semibold text-slate-700">
                {product.warrantyPeriod ? `${product.warrantyPeriod} ${product.warrantyUnit || "Years"}` : "None"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Card Actions Footer */}
      <div className="flex shrink-0 items-center gap-2 border-t border-slate-100 p-3 bg-slate-50/50">
        <Link
          to={`/products/${encodeURIComponent(product.productId || product._id)}`}
          state={{ product }}
          className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-blue-600 py-2 text-xs font-bold text-white transition hover:bg-blue-700"
        >
          Passport
          <ArrowRight size={13} />
        </Link>
        <Link
          to={`/transfer-ownership?productId=${encodeURIComponent(product.productId)}`}
          title="Transfer on-chain ownership"
          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
        >
          <Repeat size={14} />
        </Link>
      </div>
    </div>
  );
}

function StatePanel({ icon, title, message, action }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
        {icon}
      </div>
      <h3 className="mt-4 text-base font-bold text-slate-900">{title}</h3>
      <p className="mt-1.5 max-w-sm text-xs leading-5 text-slate-500">{message}</p>
      {action}
    </div>
  );
}
