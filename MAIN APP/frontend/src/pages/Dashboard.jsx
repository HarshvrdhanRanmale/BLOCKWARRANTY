import {
  Package,
  Plus,
  ArrowRight,
  ShieldCheck,
  Clock3,
  ExternalLink,
  ChevronDown,
  Menu,
  X,
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

function Dashboard() {
  const { user } = useAuthFlow();
  const accountName = user?.name?.trim() || user?.email?.trim().split("@")[0] || "there";
  const displayName = accountName.split(/[\s._-]+/)[0] || "there";
  const [mobileMenu, setMobileMenu] = useState(false);
  const { isOpen: sidebarOpen, toggle: toggleSidebar } = useSidebarPreference();
const [products, setProducts] = useState([]);
const [productsLoaded, setProductsLoaded] = useState(false);

useEffect(() => {
  const fetchProducts = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/products`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("blockwarranty_token") || ""}` },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch products");
      }

      const data = await response.json();

      const formattedProducts = data.map((product) => {
        const warranty = product.warrantyPeriod
          ? `${product.warrantyPeriod} ${(product.warrantyUnit || "Years").toLowerCase()}`
          : "Not specified";
        return {
          ...product,
          name: product.productName,
          id: product.productId,
          warranty,
          status: product.status,
          image: product.productImage,
          imageSourceUrl: product.productImageSourceUrl,
          imageLicense: product.productImageLicense,
          imageArtist: product.productImageArtist,
          gradient: "bg-[#E0EFFF]",
          days: warranty,
        };
      });

      setProducts(formattedProducts);
      setProductsLoaded(true);
    } catch (error) {
      console.error("Error fetching products:", error);
    }
  };

  fetchProducts();
  // Refresh after an ownership transfer completes (buyer paid, ownership moved
  // on-chain) so the dashboard reflects the latest on-chain ownership without a
  // manual reload. The backend re-verifies on-chain ownership on every fetch.
  const handleTransfersChanged = () => fetchProducts();
  const handleProductsChanged = () => fetchProducts();
  const handleFocus = () => fetchProducts();
  window.addEventListener("blockwarranty:transfers-changed", handleTransfersChanged);
  window.addEventListener("blockwarranty:products-changed", handleProductsChanged);
  window.addEventListener("focus", handleFocus);
  return () => {
    window.removeEventListener("blockwarranty:transfers-changed", handleTransfersChanged);
    window.removeEventListener("blockwarranty:products-changed", handleProductsChanged);
    window.removeEventListener("focus", handleFocus);
  };
}, []);

  const now = Date.now();
  const warrantyCounts = products.reduce((counts, product) => {
    const status = product.status || "Active";
    const hasWarranty = Number(product.warrantyPeriod) > 0;

    // Match the product collection's existing summary: Active and Transferred
    // records with a warranty term are covered records. Expiry is only counted
    // when the product record itself is explicitly marked Expired.
    if (["Active", "Transferred"].includes(status) && hasWarranty) {
      counts.active += 1;
    }
    if (status === "Expired") counts.expired += 1;

    const expiry = getWarrantyExpiry(product);
    if (!expiry || !["Active", "Transferred"].includes(status)) return counts;

    const daysRemaining = (expiry.getTime() - now) / 86400000;
    if (hasWarranty && daysRemaining >= 0 && daysRemaining <= 30) counts.expiringSoon += 1;
    return counts;
  }, { active: 0, expiringSoon: 0, expired: 0 });

  return (
    <div className="min-h-screen bg-[#F5F1EC] text-[#171717]">

      {/* =====================================================
          TOP HEADER
          THIS STAYS FIXED AT THE TOP OF THE LAYOUT
      ===================================================== */}

      <header
        className="
          hidden
          sticky
          top-0
          z-50
          border-b
          border-[#E5E0DA]
          bg-[#F5F1EC]/95
          backdrop-blur-xl
        "
      >
        <div
          className="
            mx-auto
            flex
            h-[76px]
            max-w-[1600px]
            items-center
            justify-between
            px-5
            sm:px-8
            lg:px-10
          "
        >

          {/* Logo */}

          <Link
            to="/"
            className="flex items-center gap-3"
          >
            <div
              className="
                flex
                h-11
                w-11
                items-center
                justify-center
                rounded-2xl
                bg-[#8B1E3F]
                shadow-[0_12px_28px_rgba(139,30,63,0.22)]
              "
            >
              <ShieldCheck
                size={24}
                strokeWidth={2.3}
                className="text-white"
              />
            </div>

            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-[#171717] sm:text-xl">
                BlockWarranty
              </h1>

              <p className="text-[8px] font-medium uppercase tracking-[0.25em] text-[#6B7280]">
                Products. People. Protected.
              </p>
            </div>
          </Link>


          {/* Desktop navigation */}

          <nav className="hidden items-center gap-8 lg:flex">

            <Link
              to="/"
              className="
                text-sm
                font-medium
                text-[#6B7280]
                transition
                hover:text-[#8B1E3F]
              "
            >
              Home
            </Link>

            <Link
              to="/dashboard"
              className="
                rounded-full
                bg-[#F3DDE4]
                px-5
                py-2.5
                text-sm
                font-semibold
                text-[#8B1E3F]
              "
            >
              Dashboard
            </Link>

            <Link
              to="/register-product"
              className="
                text-sm
                font-medium
                text-[#6B7280]
                transition
                hover:text-[#8B1E3F]
              "
            >
              Register Product
            </Link>

          </nav>


          {/* Wallet */}

          <div className="hidden items-center gap-3 sm:flex">

            <button
              className="
                group
                flex
                items-center
                gap-3
                rounded-full
                border
                border-[#E5E0DA]
                bg-white
                px-4
                py-2.5
                shadow-sm
                transition-all
                duration-300
                hover:-translate-y-0.5
                hover:border-[#F3DDE4]
                hover:shadow-lg
              "
            >
              <span
                className="
                  h-2
                  w-2
                  rounded-full
                  bg-[#16A34A]
                  shadow-[0_0_10px_rgba(22,163,74,0.5)]
                "
              />

              <span className="text-xs font-semibold text-[#171717]">
                0x1234...ABCD
              </span>

              <ChevronDown
                size={14}
                className="
                  text-[#6B7280]
                  transition
                  group-hover:rotate-180
                "
              />
            </button>

          </div>


          {/* Mobile menu */}

          <button
            onClick={() => setMobileMenu(!mobileMenu)}
            className="
              rounded-xl
              border
              border-[#E5E0DA]
              bg-white
              p-2.5
              shadow-sm
              lg:hidden
            "
          >
            {mobileMenu ? (
              <X size={21} />
            ) : (
              <Menu size={21} />
            )}
          </button>

        </div>


        {/* Mobile navigation */}

        {mobileMenu && (
          <div
            className="
              border-t
              border-[#E5E0DA]
              bg-white
              px-5
              py-5
              lg:hidden
            "
          >
            <div className="flex flex-col gap-2">

              <Link
                to="/"
                className="rounded-xl px-4 py-3 text-sm font-medium hover:bg-slate-50"
                onClick={() => setMobileMenu(false)}
              >
                Home
              </Link>

              <Link
                to="/dashboard"
                className="
                  rounded-xl
                  bg-[#F3DDE4]
                  px-4
                  py-3
                  text-sm
                  font-semibold
                  text-[#8B1E3F]
                "
                onClick={() => setMobileMenu(false)}
              >
                Dashboard
              </Link>

              <Link
                to="/register-product"
                className="rounded-xl px-4 py-3 text-sm font-medium hover:bg-slate-50"
                onClick={() => setMobileMenu(false)}
              >
                Register Product
              </Link>

            </div>
          </div>
        )}

      </header>


      {/* =====================================================
          SIDEBAR + MAIN CONTENT

          IMPORTANT:
          Sidebar is INSIDE this flex container.

          Therefore when sidebar expands:
          → its width increases
          → main content automatically moves right
          → nothing overlaps
      ===================================================== */}

      <div className="min-h-screen">

  <Sidebar
    sidebarOpen={sidebarOpen}
    onToggle={toggleSidebar}
    showBrand
    topOffset={0}
  />

  <main
    className={`
      min-h-screen
      min-w-0
      transition-[margin]
      duration-500
      ease-[cubic-bezier(0.22,1,0.36,1)]
      ${
        sidebarOpen
          ? "ml-[280px]"
          : "ml-[88px]"
      }
    `}
  >

          <div
            className="
              mx-auto
              max-w-[1600px]
              px-5
              py-7
              sm:px-8
              lg:px-10
              lg:py-10
            "
          >

            {/* =================================================
                WELCOME
            ================================================= */}

            <section
              className="
                mb-8
                flex
                flex-col
                gap-5
                md:flex-row
                md:items-end
                md:justify-between
              "
            >

              <div>

                <div className="mb-2 flex items-center gap-2">

                  <span
                    className="
                      h-2
                      w-2
                      rounded-full
                      bg-[#8B1E3F]
                      shadow-[0_0_10px_rgba(20,184,166,0.6)]
                    "
                  />

                  <p
                    className="
                      text-[11px]
                      font-semibold
                      uppercase
                      tracking-[0.22em]
                      text-[#6B7280]
                    "
                  >
                    Personal Dashboard
                  </p>

                </div>

                <h2
                  className="
                    text-3xl
                    font-extrabold
                    tracking-[-0.04em]
                    text-[#171717]
                    sm:text-4xl
                  "
                >
                  Hello, {displayName}
                </h2>

                <p className="mt-2 text-sm text-[#6B7280] sm:text-base">
                  Here's an overview of your products and warranty status.
                </p>

              </div>


              <Link
                to="/register-product"
                className="
                  group
                  inline-flex
                  w-fit
                  items-center
                  gap-2.5
                  rounded-full
                  bg-[#8B1E3F]
                  px-5
                  py-3
                  text-sm
                  font-semibold
                  text-white
                  shadow-lg
                  shadow-[0_14px_28px_rgba(139,30,63,0.22)]
                  transition-all
                  duration-300
                  hover:-translate-y-1
                  hover:shadow-xl
                  hover:shadow-[0_18px_32px_rgba(139,30,63,0.28)]
                "
              >
                <Plus size={18} />

                Register Product

                <ArrowRight
                  size={17}
                  className="
                    transition-transform
                    duration-300
                    group-hover:translate-x-1
                  "
                />
              </Link>

            </section>


            {/* =================================================
                STATISTICS
            ================================================= */}

            <section
              className="
                mb-9
                grid
                gap-4
                sm:grid-cols-2
                xl:grid-cols-4
              "
            >

              <StatCard
                icon={<Package size={21} />}
                iconClass="bg-[#F3DDE4] text-[#8B1E3F]"
                number={productsLoaded ? products.length : "—"}
                title="My Products"
                subtitle="Registered products"
              />

              <StatCard
                icon={<ShieldCheck size={21} />}
                iconClass="bg-[#EAF7ED] text-[#16A34A]"
                number={productsLoaded ? warrantyCounts.active : "—"}
                title="Active Warranties"
                subtitle="Currently protected"
              />

              <StatCard
                icon={<Clock3 size={21} />}
                iconClass="bg-[#FEF3E2] text-[#D97706]"
                number={productsLoaded ? warrantyCounts.expiringSoon : "—"}
                title="Expiring Soon"
                subtitle="Within 30 days"
              />

              <StatCard
                icon={<Clock3 size={21} />}
                iconClass="bg-[#FDECEC] text-[#DC2626]"
                number={productsLoaded ? warrantyCounts.expired : "—"}
                title="Expired"
                subtitle="Needs attention"
              />

            </section>


            


            {/* =================================================
                PRODUCTS
            ================================================= */}

            <section>

              <div
                className="
                  mb-5
                  flex
                  items-end
                  justify-between
                "
              >

                <div>

                  <p
                    className="
                      text-xs
                      font-semibold
                      uppercase
                      tracking-[0.18em]
                      text-[#6B7280]
                    "
                  >
                    Your Collection
                  </p>

                  <h3
                    className="
                      mt-1
                      text-2xl
                      font-extrabold
                      tracking-tight
                    "
                  >
                    My Products
                  </h3>

                </div>


                <Link
                  to="/products"
                  className="
                    group
                    inline-flex
                    items-center
                    gap-1.5
                    text-sm
                    font-semibold
                    text-[#8B1E3F]
                  "
                >
                  View All

                  <ArrowRight
                    size={16}
                    className="
                      transition-transform
                      group-hover:translate-x-1
                    "
                  />
                </Link>

              </div>


              <div
                className="
                  grid
                  gap-5
                  md:grid-cols-2
                  xl:grid-cols-3
                "
              >

                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                  />
                ))}

              </div>

            </section>

          </div>

        </main>

      </div>

    </div>
  );
}


/* =========================================================
   STAT CARD
========================================================= */

function StatCard({
  icon,
  iconClass,
  number,
  title,
  subtitle,
}) {
  return (
    <div
      className="
        group
        rounded-[22px]
        border
        border-[#E5E0DA]
        bg-white
        p-5
        shadow-[0_8px_30px_rgba(15,23,42,0.04)]
        transition-all
        duration-300
        hover:-translate-y-1
        hover:border-[#F3DDE4]
        hover:shadow-[0_18px_45px_rgba(139,30,63,0.09)]
      "
    >

      <div className="flex items-start justify-between">

        <div
          className={`
            flex
            h-11
            w-11
            items-center
            justify-center
            rounded-2xl
            transition-transform
            duration-300
            group-hover:scale-110
            ${iconClass}
          `}
        >
          {icon}
        </div>

        <span className="text-xs font-medium text-[#6B7280]">
          Overview
        </span>

      </div>


      <div className="mt-5">

        <div className="flex items-baseline gap-2">

          <span className="text-3xl font-extrabold tracking-tight">
            {number}
          </span>

          <span className="text-sm font-semibold text-[#171717]">
            {title}
          </span>

        </div>

        <p className="mt-1 text-xs text-[#6B7280]">
          {subtitle}
        </p>

      </div>

    </div>
  );
}


/* =========================================================
   PRODUCT CARD
========================================================= */

function ProductCard({ product }) {

  const isActive = product.status === "Active";
  const productRouteId = product.productId || product._id;

  return (
    <Link
      to={`/products/${encodeURIComponent(productRouteId)}`}
      state={{ product }}
      aria-label={`View details for ${product.name}`}
      className="
        group
        overflow-hidden
        rounded-[26px]
        border
        border-[#E5E0DA]
        bg-white
        shadow-[0_8px_30px_rgba(15,23,42,0.04)]
        transition-all
        duration-500
        hover:-translate-y-2
        hover:border-[#F3DDE4]
        hover:shadow-[0_25px_60px_rgba(139,30,63,0.12)]
        focus-visible:outline-2
        focus-visible:outline-offset-2
        focus-visible:outline-[#2563EB]
      "
    >

      {/* Product image */}

      <div
        className={`
          relative
          mx-3
          mt-3
          flex
          h-[210px]
          items-center
          justify-center
          overflow-hidden
          rounded-[21px]
          ${product.gradient}
        `}
      >

        <div
          className="
            absolute
            h-36
            w-36
            rounded-full
            bg-white/70
            blur-3xl
            transition-transform
            duration-700
            group-hover:scale-150
          "
        />

        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="
              relative
              h-[200px]
              w-[200px]
              object-contain
              drop-shadow-[0_20px_20px_rgba(15,23,42,0.16)]
              transition-all
              duration-500
              group-hover:-translate-y-2
              group-hover:scale-110
            "
          />
        ) : (
          <div className="relative flex flex-col items-center gap-2 text-slate-400">
            <Package size={35} strokeWidth={1.4} />
            <span className="text-xs font-medium">No image added</span>
          </div>
        )}


        {/* Blockchain badge */}

        <div
          className="
            absolute
            right-3
            top-3
            flex
            items-center
            gap-1.5
            rounded-full
            border
            border-[#E5E0DA]
            bg-white/80
            px-2.5
            py-1.5
            text-[9px]
            font-semibold
            text-[#171717]
            shadow-sm
            backdrop-blur-md
          "
        >
          <ShieldCheck
            size={12}
            className="text-[#8B1E3F]"
          />

          On-chain
        </div>

      </div>

      {product.imageSourceUrl && (
        <p className="mx-5 mt-2 truncate text-[10px] text-slate-500">
          Image source: Wikimedia Commons
          {product.imageLicense ? ` · ${product.imageLicense}` : ""}
          {product.imageArtist ? ` · ${product.imageArtist}` : ""}
        </p>
      )}

      {/* Product details */}

      <div className="p-5">

        <div className="flex items-start justify-between gap-3">

          <div>

            <h4
              className="
                text-lg
                font-bold
                tracking-tight
                text-[#171717]
              "
            >
              {product.name}
            </h4>

            <p className="mt-1 text-xs text-[#6B7280]">
              Product ID:{" "}
              <span className="font-medium text-[#6B7280]">
                {product.id}
              </span>
            </p>

          </div>


          <span
            className="
              flex
              h-9
              w-9
              shrink-0
              items-center
              justify-center
              rounded-full
              border
              border-[#E5E0DA]
              text-[#6B7280]
              transition-all
              duration-300
              hover:border-[#8B1E3F]
              hover:bg-[#F3DDE4]
              hover:text-[#8B1E3F]
            "
            aria-hidden="true"
          >
            <ExternalLink size={15} />
          </span>

        </div>


        {/* Warranty */}

        <div className="mt-5 flex items-center justify-between">

          <div>

            <p
              className="
                text-[10px]
                font-semibold
                uppercase
                tracking-[0.16em]
                text-[#6B7280]
              "
            >
              Warranty
            </p>

           <p className="mt-1 text-sm font-semibold text-[#171717]">
              {product.warranty}
            </p>

          </div>


          <div
            className={`
              flex
              items-center
              gap-1.5
              rounded-full
              px-3
              py-1.5
              text-[10px]
              font-bold
              ${
                isActive
                  ? "bg-[#EAF7ED] text-[#16A34A]"
                  : "bg-[#FDECEC] text-[#DC2626]"
              }
            `}
          >

            <span
              className={`
                h-1.5
                w-1.5
                rounded-full
                ${
                  isActive
                    ? "bg-[#16A34A] shadow-[0_0_8px_rgba(22,163,74,0.5)]"
                    : "bg-[#DC2626]"
                }
              `}
            />

            {product.status}

          </div>

        </div>


        {/* Warranty status */}

        <div className="mt-4 rounded-xl bg-[#F5F1EC] px-3 py-2.5">

          <div className="flex items-center justify-between">

            <span className="text-xs text-[#6B7280]">
              Warranty status
            </span>

            <span
              className={`
                text-xs
                font-semibold
                ${
                  isActive
                    ? "text-[#16A34A]"
                    : "text-[#DC2626]"
                }
              `}
            >
              {product.days}
            </span>

          </div>

        </div>


        {/* Passport button */}

        <span
          className="
            group/btn
            mt-4
            flex
            w-full
            items-center
            justify-center
            gap-2
            rounded-xl
            border
            border-[#E5E0DA]
            bg-white
            py-3
            text-sm
            font-semibold
            text-[#171717]
            transition-all
            duration-300
            hover:border-[#8B1E3F]
            hover:bg-[#F3DDE4]
            hover:text-[#8B1E3F]
          "
        >
          View Product Passport

          <ArrowRight
            size={15}
            className="
              transition-transform
              duration-300
              group-hover/btn:translate-x-1
            "
          />
        </span>

      </div>

    </Link>
  );
}

export default Dashboard;
