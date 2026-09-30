import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  FileText,
  LockKeyhole,
  Package,
  QrCode,
  ShieldCheck,
  Tag,
} from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";
import WorkspaceLayout from "../components/WorkspaceLayout";

function ProductDetails() {
  const { productId } = useParams();
  const location = useLocation();
  const selectedProduct = location.state?.product;
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(
    !selectedProduct ||
      String(selectedProduct.productId || selectedProduct._id) !== productId
  );
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const fetchProduct = async () => {
      const productFromNavigation =
        selectedProduct &&
        String(selectedProduct.productId || selectedProduct._id) === productId;
      if (productFromNavigation) {
        setProduct(selectedProduct);
        setError("");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      try {
        let response = await fetch(
          `http://localhost:5000/api/products/${encodeURIComponent(productId || "")}`
        );
        const contentType = response.headers.get("content-type") || "";

        if (response.status === 404 || !contentType.includes("application/json")) {
          response = await fetch("http://localhost:5000/api/products");
        }

        const responseContentType = response.headers.get("content-type") || "";
        if (!responseContentType.includes("application/json")) {
          throw new Error("The product service returned an unexpected response.");
        }

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || "Unable to load this product.");
        }

        const productFromResponse = Array.isArray(data)
          ? data.find((item) =>
              [item.productId, item._id].some((id) => String(id) === productId)
            )
          : data.product;

        if (!productFromResponse) {
          throw new Error("This product could not be found in your collection.");
        }
        if (isMounted) setProduct(productFromResponse);
      } catch (fetchError) {
        console.error("Product details load error:", fetchError);
        if (isMounted) setError(fetchError.message || "Unable to load this product.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchProduct();
    return () => {
      isMounted = false;
    };
  }, [productId, selectedProduct]);

  return (
    <WorkspaceLayout>
      <Link
        to="/products"
        className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-blue-700"
      >
        <ArrowLeft size={16} />
        Back to My Products
      </Link>

      {loading ? (
        <div className="animate-pulse rounded-3xl border border-slate-200 bg-white p-8">
          <div className="h-64 rounded-2xl bg-slate-100" />
          <div className="mt-7 h-6 w-1/3 rounded bg-slate-100" />
          <div className="mt-4 h-4 w-1/2 rounded bg-slate-100" />
        </div>
      ) : error || !product ? (
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
            <Package size={24} />
          </div>
          <h1 className="mt-4 text-xl font-bold text-slate-950">
            {error ? "Product details unavailable" : "Product not found"}
          </h1>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
            {error || "This product may have been removed or its link may be incorrect."}
          </p>
          <Link
            to="/products"
            className="mt-6 inline-flex h-10 items-center rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800"
          >
            Return to My Products
          </Link>
        </div>
      ) : (
        <ProductDetailContent product={product} />
      )}
    </WorkspaceLayout>
  );
}

function ProductDetailContent({ product }) {
  const hasWarranty =
    product.warrantyPeriod !== null &&
    product.warrantyPeriod !== undefined &&
    product.warrantyPeriod !== "";
  const amount = (value) => {
    if (value === null || value === undefined || value === "") return "Not provided";
    return `${product.currency ? `${product.currency} ` : ""}${value}`;
  };
  const date = (value) => {
    if (!value) return "Not provided";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? "Not provided"
      : new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(parsed);
  };

  return (
    <>
      <header className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
            Product record
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
            {product.productName}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {product.productId || "Product ID unavailable"}
            {product.brand ? ` · ${product.brand}` : ""}
          </p>
        </div>
        <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold ${
          product.status === "Active"
            ? "bg-emerald-50 text-emerald-700"
            : "bg-slate-100 text-slate-600"
        }`}>
          <span className={`h-2 w-2 rounded-full ${product.status === "Active" ? "bg-emerald-500" : "bg-slate-400"}`} />
          {product.status || "Active"}
        </span>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <div className="space-y-6">
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_12px_36px_rgba(15,23,42,0.04)] sm:p-5">
            <div className="flex min-h-[300px] items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 via-slate-50 to-indigo-50 p-6">
              {product.productImage ? (
                <img
                  src={product.productImage}
                  alt={product.productName}
                  className="max-h-[420px] w-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-slate-400">
                  <Package size={48} strokeWidth={1.2} />
                  <p className="text-sm font-medium">No product image available</p>
                </div>
              )}
            </div>
            {(product.productImageSourceUrl || product.productImageLicense || product.productImageArtist) && (
              <p className="mt-3 px-1 text-xs leading-5 text-slate-500">
                Image attribution:{" "}
                {product.productImageSourceUrl ? (
                  <a
                    href={product.productImageSourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-blue-700 underline"
                  >
                    Wikimedia Commons
                  </a>
                ) : null}
                {product.productImageLicense ? ` · ${product.productImageLicense}` : ""}
                {product.productImageArtist ? ` · ${product.productImageArtist}` : ""}
              </p>
            )}
          </section>
          <DetailSection icon={<Tag size={18} />} title="Product information">
            <DetailGrid items={[
              ["Product name", product.productName],
              ["Brand", product.brand],
              ["Category", product.category],
              ["Product ID", product.productId],
              ["Record status", product.status],
              ["Added to BlockWarranty", date(product.createdAt)],
            ]} />
            <div className="mt-5 border-t border-slate-100 pt-5">
              <DetailItem label="Description" value={product.description} fullWidth />
            </div>
          </DetailSection>
        </div>

        <div className="space-y-6">
          <DetailSection icon={<ShieldCheck size={18} />} title="Warranty & purchase">
            <DetailGrid items={[
              ["Warranty period", hasWarranty ? `${product.warrantyPeriod} ${product.warrantyUnit || "Years"}` : ""],
              ["Purchase date", date(product.purchaseDate)],
              ["Invoice number", product.invoiceNumber],
            ]} />
            {product.invoiceFile && (
              <a
                href={product.invoiceFile}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-900"
              >
                <FileText size={16} />
                View invoice
              </a>
            )}
          </DetailSection>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.04)] sm:p-6">
            <div className="mb-2 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <QrCode size={19} />
              </span>
              <div>
                <h2 className="text-base font-bold text-slate-950">
                  Verification & product passport
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  QR codes will be available when verification is connected.
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <QrPlaceholder
                title="Warranty verification"
                description="Scan to verify this product’s warranty."
                seed={product.productId || product._id || product.productName}
              />
              <QrPlaceholder
                title="Product passport"
                description="Access official product documents and images."
                seed={`${product.productId || product._id || product.productName}-passport`}
              />
            </div>
          </section>

          <DetailSection icon={<CalendarDays size={18} />} title="Invoice & pricing">
            <DetailGrid items={[
              ["Currency", product.currency],
              ["Unit price", amount(product.unitPrice)],
              ["Quantity", product.quantity],
              ["Product / line amount", amount(product.lineItemAmount)],
              ["Subtotal", amount(product.subtotal)],
              ["Discount", amount(product.discount)],
              ["Shipping cost", amount(product.shippingCost)],
              ["Tax", amount(product.tax)],
              ["Invoice total", amount(product.total)],
              ["Amount paid", amount(product.amountPaid)],
              ["Balance due", amount(product.balanceDue)],
            ]} />
          </DetailSection>

          <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm leading-6 text-blue-900">
            <CheckCircle2 size={18} className="mt-1 shrink-0 text-blue-700" />
            <p>This page shows the product details stored with its BlockWarranty record.</p>
          </div>
        </div>
      </div>
    </>
  );
}

function QrPlaceholder({ title, description, seed }) {
  const modules = Array.from({ length: 17 * 17 }, (_, index) => {
    const row = Math.floor(index / 17);
    const column = index % 17;
    const finderOrigins = [
      [0, 0],
      [0, 12],
      [12, 0],
    ];
    const finder = finderOrigins.find(
      ([originRow, originColumn]) =>
        row >= originRow &&
        row < originRow + 5 &&
        column >= originColumn &&
        column < originColumn + 5
    );

    if (finder) {
      const localRow = row - finder[0];
      const localColumn = column - finder[1];
      return (
        localRow === 0 ||
        localRow === 4 ||
        localColumn === 0 ||
        localColumn === 4 ||
        (localRow === 2 && localColumn === 2)
      );
    }

    const value = seed.charCodeAt((index * 7 + row + column) % seed.length);
    return (value + index * 3 + row * column) % 4 < 2;
  });

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div
        aria-hidden="true"
        className="grid h-[92px] w-[92px] shrink-0 grid-cols-[repeat(17,minmax(0,1fr))] grid-rows-[repeat(17,minmax(0,1fr))] gap-[2px] rounded-lg border border-slate-200 bg-white p-2 opacity-55"
      >
        {modules.map((isFilled, index) => (
          <span
            key={index}
            className={isFilled ? "rounded-[1px] bg-slate-800" : "rounded-[1px] bg-transparent"}
          />
        ))}
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">
          <LockKeyhole size={11} />
          Coming soon
        </span>
      </div>
    </div>
  );
}

function DetailSection({ icon, title, children }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.04)] sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
          {icon}
        </span>
        <h2 className="text-base font-bold text-slate-950">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function DetailGrid({ items }) {
  return (
    <dl className="grid gap-x-5 gap-y-5 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <DetailItem key={label} label={label} value={value} />
      ))}
    </dl>
  );
}

function DetailItem({ label, value, fullWidth = false }) {
  const hasValue = value !== null && value !== undefined && value !== "";
  return (
    <div className={fullWidth ? "sm:col-span-2" : ""}>
      <dt className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">{label}</dt>
      <dd className={`mt-1 break-words text-sm font-semibold ${hasValue ? "text-slate-800" : "text-slate-400"}`}>
        {hasValue ? value : "Not provided"}
      </dd>
    </div>
  );
}

export default ProductDetails;
