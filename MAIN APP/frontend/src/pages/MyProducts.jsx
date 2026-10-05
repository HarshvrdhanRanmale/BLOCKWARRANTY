import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  Box,
  CheckCircle2,
  Package,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { Link } from "react-router-dom";
import WorkspaceLayout from "../components/WorkspaceLayout";
import { useAuthFlow } from "../auth/useAuthFlow";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

function MyProducts() {
  const { token } = useAuthFlow();
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All categories");
  const [sortOrder, setSortOrder] = useState("newest");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const fetchProducts = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/products`, {
          headers: { Authorization: `Bearer ${token || localStorage.getItem("blockwarranty_token") || ""}` },
        });
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          throw new Error("The product service returned an unexpected response.");
        }
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || "Unable to load your products.");
        }
        if (!Array.isArray(data)) {
          throw new Error("The product service returned invalid product data.");
        }
        if (isMounted) setProducts(data);
      } catch (fetchError) {
        console.error("My Products load error:", fetchError);
        if (isMounted) {
          setError(fetchError.message || "Unable to load your products.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchProducts();
    return () => {
      isMounted = false;
    };
  }, [token]);

  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category).filter(Boolean))].sort(),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products
      .filter((product) => {
        const matchesQuery = !query || [
          product.productName,
          product.brand,
          product.category,
          product.productId,
        ].some((value) => String(value || "").toLowerCase().includes(query));
        const matchesCategory =
          categoryFilter === "All categories" || product.category === categoryFilter;
        return matchesQuery && matchesCategory;
      })
      .sort((left, right) => {
        if (sortOrder === "name") {
          return String(left.productName || "").localeCompare(right.productName || "");
        }
        const leftDate = new Date(left.createdAt || left.purchaseDate || 0).getTime();
        const rightDate = new Date(right.createdAt || right.purchaseDate || 0).getTime();
        return sortOrder === "oldest" ? leftDate - rightDate : rightDate - leftDate;
      });
  }, [products, search, categoryFilter, sortOrder]);

  const activeCount = products.filter((product) => product.status === "Active").length;
  const warrantyCount = products.filter(
    (product) => Number(product.warrantyPeriod) > 0 && product.status === "Active"
  ).length;

  return (
    <WorkspaceLayout>
      <div className="mb-8">
        <Link
          to="/dashboard"
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-blue-700"
        >
          <ArrowLeft size={16} />
          Dashboard
        </Link>
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
              Your collection
            </p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
              My Products
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Keep your registered products and warranty details organized in one place.
            </p>
          </div>
          <Link
            to="/register-product"
            className="inline-flex h-11 w-fit items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800"
          >
            <Plus size={17} />
            Register a product
          </Link>
        </div>
      </div>

      <section className="mb-7 grid gap-4 sm:grid-cols-3" aria-label="Product summary">
        <SummaryCard icon={<Package size={19} />} label="Products registered" value={products.length} />
        <SummaryCard icon={<ShieldCheck size={19} />} label="Active records" value={activeCount} />
        <SummaryCard icon={<CheckCircle2 size={19} />} label="With warranty" value={warrantyCount} />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_12px_36px_rgba(15,23,42,0.04)] sm:p-6">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Your collection</h2>
            <p className="mt-1 text-sm text-slate-500">
              {loading ? "Loading products…" : `${filteredProducts.length} of ${products.length} products`}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_auto_auto]">
            <label className="relative block">
              <Search
                size={17}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, brand, or ID"
                aria-label="Search products"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
              />
            </label>
            <label className="relative">
              <SlidersHorizontal
                size={15}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                aria-label="Filter by category"
                className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-9 pr-8 text-sm font-medium text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 sm:w-44"
              >
                <option>All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>
            <label className="relative">
              <ArrowDownUp
                size={15}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <select
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
                aria-label="Sort products"
                className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-9 pr-8 text-sm font-medium text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 sm:w-40"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="name">Name A–Z</option>
              </select>
            </label>
          </div>
        </div>

        {error ? (
          <StatePanel
            icon={<Box size={23} />}
            title="Products couldn’t be loaded"
            message={error}
          />
        ) : loading ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="animate-pulse rounded-2xl border border-slate-200 p-4">
                <div className="h-48 rounded-xl bg-slate-100" />
                <div className="mt-5 h-4 w-2/3 rounded bg-slate-100" />
                <div className="mt-3 h-3 w-1/3 rounded bg-slate-100" />
                <div className="mt-6 h-10 rounded-lg bg-slate-100" />
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <StatePanel
            icon={<Package size={24} />}
            title="Your collection is ready for its first product"
            message="Register a product to keep its purchase and warranty details together."
            action={
              <Link
                to="/register-product"
                className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800"
              >
                <Plus size={16} />
                Register a product
              </Link>
            }
          />
        ) : filteredProducts.length === 0 ? (
          <StatePanel
            icon={<Search size={23} />}
            title="No products match these filters"
            message="Try another search term or select a different category."
            action={
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setCategoryFilter("All categories");
                }}
                className="mt-4 text-sm font-semibold text-blue-700 hover:text-blue-900"
              >
                Clear filters
              </button>
            }
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredProducts.map((product) => (
              <ProductCollectionCard key={product.productId || product._id} product={product} />
            ))}
          </div>
        )}
      </section>
    </WorkspaceLayout>
  );
}

function SummaryCard({ icon, label, value }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.03)]">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
        {icon}
      </span>
      <div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="mt-0.5 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
      </div>
    </div>
  );
}

function ProductCollectionCard({ product }) {
  const status = product.status || "Active";
  const isActive = status === "Active";
  const hasImage = Boolean(product.productImage);
  const warranty =
    product.warrantyPeriod === null || product.warrantyPeriod === undefined || product.warrantyPeriod === ""
      ? "Not specified"
      : `${product.warrantyPeriod} ${product.warrantyUnit || "Years"}`;

  return (
    <Link
      to={`/products/${encodeURIComponent(product.productId || product._id)}`}
      state={{ product }}
      aria-label={`View details for ${product.productName || "product"}`}
      className="group overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_8px_26px_rgba(15,23,42,0.035)] transition duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_18px_38px_rgba(15,23,42,0.09)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      <div className="relative flex h-48 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-blue-50 via-slate-50 to-indigo-50">
        {hasImage ? (
          <img
            src={product.productImage}
            alt={product.productName || "Registered product"}
            className="h-full w-full object-contain p-5 transition duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <Package size={35} strokeWidth={1.4} />
            <span className="text-xs font-medium">No image added</span>
          </div>
        )}
        <span className={`absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-semibold shadow-sm ${
          isActive
            ? "border-emerald-100 bg-white/95 text-emerald-700"
            : "border-slate-200 bg-white/95 text-slate-600"
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-slate-400"}`} />
          {status}
        </span>
      </div>
      <div className="px-1 pb-1 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-slate-950">
              {product.productName || "Unnamed product"}
            </p>
            <p className="mt-1 truncate text-sm text-slate-500">
              {[product.brand, product.category].filter(Boolean).join(" · ") || "Category not specified"}
            </p>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700 transition group-hover:bg-blue-700 group-hover:text-white">
            <ArrowRight size={17} />
          </span>
        </div>
        <div className="mt-4 flex items-end justify-between gap-3 border-t border-slate-100 pt-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Warranty</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">{warranty}</p>
          </div>
          <span className="max-w-[55%] truncate text-right text-xs text-slate-400">
            {product.productId || "Product ID unavailable"}
          </span>
        </div>
      </div>
    </Link>
  );
}

function StatePanel({ icon, title, message, action }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center px-5 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-bold text-slate-950">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{message}</p>
      {action}
    </div>
  );
}

export default MyProducts;
