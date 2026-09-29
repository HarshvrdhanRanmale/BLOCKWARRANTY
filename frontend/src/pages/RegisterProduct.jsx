import {
  Package,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  Info,
  CheckCircle2,
  Upload,
  FileText,
  Sparkles,
  X,
  RefreshCw,
} from "lucide-react";

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Sidebar from "../components/Sidebar";

function RegisterProduct() {
  const [sidebarPinnedOpen, setSidebarPinnedOpen] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const sidebarOpen = sidebarPinnedOpen || sidebarHovered;

  const [currentStep, setCurrentStep] = useState(1);

  const [invoiceFile, setInvoiceFile] = useState(null);
  const [invoicePreview, setInvoicePreview] = useState("");

  const [extracting, setExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [extractionError, setExtractionError] = useState("");
  const [showAllPricing, setShowAllPricing] = useState(false);

  const [imagePreview, setImagePreview] = useState("");

  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const invoiceInputRef = useRef(null);
  const imageInputRef = useRef(null);

 const [formData, setFormData] = useState({
  productName: "",
  brand: "",
  category: "",
  purchaseDate: "",

  warrantyPeriod: "",
  warrantyUnit: "Years",

  invoiceNumber: "",

  currency: "",
  unitPrice: "",
  quantity: "",
  lineItemAmount: "",
  subtotal: "",
  discount: "",
  shippingCost: "",
  tax: "",
  total: "",
  amountPaid: "",
  balanceDue: "",

  description: "",
  productImage: "",
  invoiceFile: "",
});

  useEffect(() => {
    if (!successMessage) return;

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });

    const timer = setTimeout(() => {
      setSuccessMessage("");
    }, 5000);

    return () => clearTimeout(timer);
  }, [successMessage]);

  // =========================================================
  // FORM CHANGE
  // =========================================================

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // =========================================================
  // INVOICE UPLOAD
  // =========================================================

  const handleInvoiceChange = (e) => {
    const file = e.target.files?.[0];

    if (!file) return;

    const allowedTypes = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/jpg",
    ];

    if (!allowedTypes.includes(file.type)) {
      setErrorMessage(
        "Please upload a PDF, JPG, JPEG, or PNG invoice."
      );
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage("Invoice size must be less than 10 MB.");
      return;
    }

    setErrorMessage("");
    setExtractionError("");
    setInvoiceFile(file);

    if (file.type.startsWith("image/")) {
      const reader = new FileReader();

      reader.onloadend = () => {
        setInvoicePreview(reader.result);
      };

      reader.readAsDataURL(file);
    } else {
      setInvoicePreview("");
    }

    extractInvoice(file);
  };

  // =========================================================
  // MISTRAL INVOICE EXTRACTION
  // =========================================================

  const extractInvoice = async (file) => {
    setExtracting(true);
    setErrorMessage("");
    setExtractionError("");

    try {
      const formDataToSend = new FormData();

      formDataToSend.append("invoice", file);

      const response = await fetch(
        "http://localhost:5000/api/extract-invoice",
        {
          method: "POST",
          body: formDataToSend,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        const serverError = data.error ? `: ${data.error}` : "";
        throw new Error(
          `${data.message || "Invoice extraction failed."}${serverError}`
        );
      }

      const extracted = data.extractedData || {};

      setExtractedData(extracted);

      setFormData((prev) => ({
  ...prev,

  productName: extracted.productName || "",
  brand: extracted.brand || "",
  category: extracted.category || "",
  purchaseDate: extracted.purchaseDate || "",

  warrantyPeriod: extracted.warrantyPeriod || "",
  warrantyUnit: extracted.warrantyUnit || "Years",

  invoiceNumber: extracted.invoiceNumber || "",

  currency: extracted.currency || "",
  unitPrice: extracted.unitPrice || "",
  quantity: extracted.quantity || "",
  lineItemAmount: extracted.lineItemAmount || "",
  subtotal: extracted.subtotal || "",
  discount: extracted.discount || "",
  shippingCost: extracted.shippingCost || "",
  tax: extracted.tax || "",
  total: extracted.total || "",
  amountPaid: extracted.amountPaid || "",
  balanceDue: extracted.balanceDue || "",

  description: extracted.description || "",
}));

      setCurrentStep(2);
    } catch (error) {
      console.error(
        "Invoice extraction error:",
        error
      );

      const message = String(error.message || "");
      const rateLimited =
        message.includes("429") || /rate.?limit/i.test(message);
      setExtractionError(
        rateLimited
          ? "Invoice extraction is temporarily rate-limited. You can retry shortly or enter the product details manually."
          : message.split(": API error occurred")[0] || "Failed to process the invoice."
      );
    } finally {
      setExtracting(false);
    }
  };

  // =========================================================
  // REMOVE INVOICE
  // =========================================================

  const removeInvoice = () => {
    setInvoiceFile(null);
    setInvoicePreview("");
    setExtractedData(null);
    setExtractionError("");
    setCurrentStep(1);
    setErrorMessage("");

    if (invoiceInputRef.current) {
      invoiceInputRef.current.value = "";
    }
  };

  // =========================================================
  // PRODUCT IMAGE
  // =========================================================

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];

    if (!file) return;

    if (
      ![
        "image/png",
        "image/jpeg",
        "image/webp",
      ].includes(file.type)
    ) {
      setErrorMessage(
        "Please upload a PNG, JPG, or WEBP image."
      );
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage(
        "Product image must be less than 5 MB."
      );
      return;
    }

    setErrorMessage("");

    const reader = new FileReader();

    reader.onloadend = () => {
      setImagePreview(reader.result);

      setFormData((prev) => ({
        ...prev,
        productImage: reader.result,
      }));
    };

    reader.readAsDataURL(file);
  };

  // =========================================================
  // REGISTER PRODUCT
  // =========================================================

  const handleSubmit = async (e) => {
    e.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch(
        "http://localhost:5000/api/products",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(formData),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            data.message ||
            "Registration failed."
        );
      }

      console.log(
        "Registered product:",
        data.product
      );

      setSuccessMessage(
        `Product registered successfully! Product ID: ${data.product.productId}`
      );

      // Reset everything
      setFormData({
  productName: "",
  brand: "",
  category: "",
  purchaseDate: "",

  warrantyPeriod: "",
  warrantyUnit: "Years",

  invoiceNumber: "",

  currency: "",
  unitPrice: "",
  quantity: "",
  lineItemAmount: "",
  subtotal: "",
  discount: "",
  shippingCost: "",
  tax: "",
  total: "",
  amountPaid: "",
  balanceDue: "",

  description: "",
  productImage: "",
  invoiceFile: "",
});

      setInvoiceFile(null);
      setInvoicePreview("");
      setExtractedData(null);
      setImagePreview("");
      setCurrentStep(1);

      if (invoiceInputRef.current) {
        invoiceInputRef.current.value = "";
      }

      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
    } catch (error) {
      console.error(
        "Registration error:",
        error
      );

      setErrorMessage(
        error.message ||
          "Failed to register product."
      );
    }
  };

  // =========================================================
  // STEP NAVIGATION
  // =========================================================

  const goToReview = () => {
    setErrorMessage("");

    if (!formData.productName) {
      setErrorMessage(
        "Product name is required before review."
      );
      return;
    }

    setCurrentStep(3);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <header
        className="
          hidden
          sticky
          top-0
          z-50
          border-b
          border-slate-200
          bg-[#F8FAFC]/95
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
                bg-[#2563EB]
                shadow-[0_12px_28px_rgba(37,99,235,0.22)]
              "
            >
              <ShieldCheck
                size={24}
                strokeWidth={2.3}
                className="text-white"
              />
            </div>

            <div>
              <h1
                className="
                  text-lg
                  font-extrabold
                  tracking-tight
                  text-[#0F172A]
                  sm:text-xl
                "
              >
                BlockWarranty
              </h1>

              <p
                className="
                  text-[8px]
                  font-medium
                  uppercase
                  tracking-[0.25em]
                  text-[#64748B]
                "
              >
                Products. People. Protected.
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-8 lg:flex">

            <Link
              to="/"
              className="
                text-sm
                font-medium
                text-[#64748B]
                hover:text-[#2563EB]
              "
            >
              Home
            </Link>

            <Link
              to="/dashboard"
              className="
                text-sm
                font-medium
                text-[#64748B]
                hover:text-[#2563EB]
              "
            >
              Dashboard
            </Link>

            <Link
              to="/register-product"
              className="
                rounded-full
                bg-[#E0EFFF]
                px-5
                py-2.5
                text-sm
                font-semibold
                text-[#2563EB]
              "
            >
              Register Product
            </Link>

            <Link
              to="/verify"
              className="
                text-sm
                font-medium
                text-[#64748B]
                hover:text-[#2563EB]
              "
            >
              Verify
            </Link>

          </nav>

          <div className="hidden items-center sm:flex">
            <button
              className="
                flex
                items-center
                gap-3
                rounded-full
                border
                border-slate-200
                bg-white
                px-4
                py-2.5
                shadow-sm
              "
            >
              <span
                className="
                  h-2
                  w-2
                  rounded-full
                  bg-[#16A34A]
                "
              />

              <span className="text-xs font-semibold">
                0x1234...ABCD
              </span>

              <ChevronDown
                size={14}
                className="text-[#64748B]"
              />
            </button>
          </div>

        </div>
      </header>

      {/* =====================================================
          SIDEBAR
      ===================================================== */}

      <Sidebar
        sidebarOpen={sidebarHovered}
        setSidebarOpen={setSidebarPinnedOpen}
        pinnedOpen={sidebarPinnedOpen}
        onHoverChange={setSidebarHovered}
        pinnedMode
        showBrand
        topOffset={0}
      />

      {/* =====================================================
          MAIN
      ===================================================== */}

      <main
        className={`
          min-h-screen
          min-w-0
          transition-[margin]
          duration-500
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
            max-w-[1250px]
            px-5
            py-8
            sm:px-8
            lg:px-10
            lg:py-10
          "
        >

          {/* =================================================
              INTRO
          ================================================= */}

          <section className="mb-8">

            <div className="mb-3 flex items-center gap-2">
              <span
                className="
                  h-2
                  w-2
                  rounded-full
                  bg-[#2563EB]
                "
              />

              <p
                className="
                  text-[11px]
                  font-semibold
                  uppercase
                  tracking-[0.22em]
                  text-[#64748B]
                "
              >
                Product Registration
              </p>
            </div>

            <div
              className="
                flex
                flex-col
                gap-5
                md:flex-row
                md:items-end
                md:justify-between
              "
            >

              <div>
                <h2
                  className="
                    text-3xl
                    font-extrabold
                    tracking-[-0.04em]
                    text-[#0F172A]
                    sm:text-4xl
                  "
                >
                  Register a New Product
                </h2>

                <p
                  className="
                    mt-2
                    max-w-2xl
                    text-sm
                    leading-6
                    text-[#64748B]
                    sm:text-base
                  "
                >
                  Upload your invoice and let AI extract
                  the product and warranty information
                  automatically.
                </p>
              </div>

              <Link
                to="/dashboard"
                className="
                  inline-flex
                  w-fit
                  items-center
                  gap-2
                  text-sm
                  font-semibold
                  text-[#2563EB]
                "
              >
                Back to Dashboard
                <ArrowRight size={16} />
              </Link>

            </div>
          </section>

          {/* =================================================
              ERROR / SUCCESS
          ================================================= */}

          {successMessage && (
            <div
              className="
                mb-6
                flex
                items-center
                gap-3
                rounded-2xl
                border
                border-green-200
                bg-green-50
                px-5
                py-4
                text-sm
                font-semibold
                text-green-700
              "
            >
              <CheckCircle2 size={20} />
              {successMessage}
            </div>
          )}

          {errorMessage && (
            <div
              className="
                mb-6
                rounded-2xl
                border
                border-red-200
                bg-red-50
                px-5
                py-4
                text-sm
                font-semibold
                text-red-700
              "
            >
              {errorMessage}
            </div>
          )}

          {/* =================================================
              STEP INDICATOR
          ================================================= */}

          <StepIndicator
            currentStep={currentStep}
          />

          {/* =================================================
              CONTENT
          ================================================= */}

          <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_300px]">

            <div>

              {/* =============================================
                  STEP 1 — UPLOAD
              ============================================= */}

              {currentStep === 1 && (
                <UploadInvoiceStep
                  invoiceFile={invoiceFile}
                  invoicePreview={invoicePreview}
                  extracting={extracting}
                  extractionError={extractionError}
                  invoiceInputRef={invoiceInputRef}
                  handleInvoiceChange={handleInvoiceChange}
                  removeInvoice={removeInvoice}
                  retryExtraction={() => invoiceFile && extractInvoice(invoiceFile)}
                  continueManually={() => {
                    setExtractionError("");
                    setCurrentStep(3);
                  }}
                />
              )}

              {/* =============================================
                  STEP 2 — EXTRACTED DATA
              ============================================= */}

              {currentStep === 2 && (
                <ExtractedDataStep
                  extractedData={extractedData}
                  invoiceFile={invoiceFile}
                  onContinue={() => setCurrentStep(3)}
                  onBack={() => setCurrentStep(1)}
                />
              )}

              {/* =============================================
                  STEP 3 — REVIEW
              ============================================= */}

              {currentStep === 3 && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setCurrentStep(4);
                  }}
                  className="
                    overflow-hidden
                    rounded-[28px]
                    border
                    border-slate-200
                    bg-white
                    shadow-[0_12px_40px_rgba(15,23,42,0.05)]
                  "
                >

                  <div
                    className="
                      border-b
                      border-slate-100
                      bg-gradient-to-r
                      from-[#F8FAFC]
                      to-[#E0EFFF]/45
                      px-6
                      py-6
                      sm:px-8
                    "
                  >
                    <div className="flex items-center gap-4">

                      <div
                        className="
                          flex
                          h-12
                          w-12
                          items-center
                          justify-center
                          rounded-2xl
                          bg-[#E0EFFF]
                          text-[#2563EB]
                        "
                      >
                        <Sparkles size={23} />
                      </div>

                      <div>
                        <h3 className="text-base font-bold">
                          Review & Edit Details
                        </h3>

                        <p className="mt-0.5 text-xs text-[#64748B]">
                          Check the AI-extracted information
                          before registering the product.
                        </p>
                      </div>

                    </div>
                  </div>

                  <div className="px-6 py-7 sm:px-8">

                    <div className="grid gap-6 md:grid-cols-2">

                      <FormField
                        label="Product Name"
                        required
                        name="productName"
                        placeholder="e.g. MacBook Air M2"
                        value={formData.productName}
                        onChange={handleChange}
                      />

                      <FormField
                        label="Brand"
                        name="brand"
                        placeholder="e.g. Apple"
                        value={formData.brand}
                        onChange={handleChange}
                      />

                      <CategoryField
                        value={formData.category}
                        onChange={handleChange}
                      />

                      <div>
                        <label
                          className="
                            mb-2
                            block
                            text-sm
                            font-semibold
                          "
                        >
                          Purchase Date
                          <span className="ml-1 text-red-500">
                            *
                          </span>
                        </label>

                        <input
                          type="date"
                          name="purchaseDate"
                          required
                          value={formData.purchaseDate}
                          onChange={handleChange}
                          className={inputClass}
                        />
                      </div>

                      <div>
                        <label
                          className="
                            mb-2
                            block
                            text-sm
                            font-semibold
                          "
                        >
                          Warranty Period
                          
                        </label>

                        <div className="flex gap-3">

                          <input
                            type="number"
                            min="1"
                            name="warrantyPeriod"
                            placeholder="e.g. 2"
                            value={formData.warrantyPeriod}
                            onChange={handleChange}
                            className={inputClass}
                          />

                          <div className="relative w-[125px] shrink-0">

                            <select
                              name="warrantyUnit"
                              value={formData.warrantyUnit}
                              onChange={handleChange}
                              className={`${inputClass} appearance-none pr-9`}
                            >
                              <option>Years</option>
                              <option>Months</option>
                              <option>Days</option>
                            </select>

                            <ChevronDown
                              size={16}
                              className="
                                pointer-events-none
                                absolute
                                right-3
                                top-1/2
                                -translate-y-1/2
                                text-[#64748B]
                              "
                            />
                          </div>
                        </div>
                      </div>

                      <FormField
                        label="Invoice Number"
                        name="invoiceNumber"
                        placeholder="Invoice number"
                        value={formData.invoiceNumber}
                        onChange={handleChange}
                      />

                      {/* OPTIONAL PRICING INFORMATION */}

<div className="md:col-span-2 mt-2">
  <div className="rounded-2xl border border-[#BFDBFE] bg-[#E0EFFF]/40 p-5">

    <div className="mb-5">
      <h4 className="text-sm font-bold text-[#0F172A]">
        Pricing Information
      </h4>

      <p className="mt-1 text-xs text-[#64748B]">
        Add any pricing details available on your invoice. These fields are optional.
      </p>
    </div>

    <div className="grid gap-5 sm:grid-cols-2">

      {(showAllPricing || formData.currency) && (
        <FormField
          label="Currency"
          name="currency"
          placeholder="e.g. INR, USD, EUR"
          value={formData.currency}
          onChange={handleChange}
        />
      )}

      {(showAllPricing || formData.unitPrice) && (
        <FormField
          label="Unit Price"
          name="unitPrice"
          placeholder="Unit price"
          value={formData.unitPrice}
          onChange={handleChange}
        />
      )}

      {(showAllPricing || formData.quantity) && (
        <FormField
          label="Quantity"
          name="quantity"
          placeholder="Quantity"
          value={formData.quantity}
          onChange={handleChange}
        />
      )}

      {(showAllPricing || formData.lineItemAmount) && (
        <FormField
          label="Product / Line Amount"
          name="lineItemAmount"
          placeholder="Line item amount"
          value={formData.lineItemAmount}
          onChange={handleChange}
        />
      )}

      {(showAllPricing || formData.subtotal) && (
        <FormField
          label="Subtotal"
          name="subtotal"
          placeholder="Subtotal"
          value={formData.subtotal}
          onChange={handleChange}
        />
      )}

      {(showAllPricing || formData.discount) && (
        <FormField
          label="Discount"
          name="discount"
          placeholder="Discount"
          value={formData.discount}
          onChange={handleChange}
        />
      )}

      {(showAllPricing || formData.shippingCost) && (
        <FormField
          label="Shipping Cost"
          name="shippingCost"
          placeholder="Shipping cost"
          value={formData.shippingCost}
          onChange={handleChange}
        />
      )}

      {(showAllPricing || formData.tax) && (
        <FormField
          label="Tax"
          name="tax"
          placeholder="Tax"
          value={formData.tax}
          onChange={handleChange}
        />
      )}

      {(showAllPricing || formData.total) && (
        <FormField
          label="Invoice Total"
          name="total"
          placeholder="Total amount"
          value={formData.total}
          onChange={handleChange}
        />
      )}

      {(showAllPricing || formData.amountPaid) && (
        <FormField
          label="Amount Paid"
          name="amountPaid"
          placeholder="Amount paid"
          value={formData.amountPaid}
          onChange={handleChange}
        />
      )}

      {(showAllPricing || formData.balanceDue) && (
        <FormField
          label="Balance Due"
          name="balanceDue"
          placeholder="Balance due"
          value={formData.balanceDue}
          onChange={handleChange}
        />
      )}

    </div>

    <div className="mt-5 border-t border-[#BFDBFE] pt-4">

      <p className="text-xs text-[#64748B]">
        Some invoices contain additional information that AI may not detect.
      </p>

      <button
        type="button"
        onClick={() => setShowAllPricing(!showAllPricing)}
        className="mt-2 text-sm font-semibold text-[#2563EB] hover:text-[#1D4EDB]"
      >
        {showAllPricing ? "− Hide extra details" : "+ Add more details"}
      </button>

    </div>

  </div>
</div>

                      <div className="md:col-span-2">

                        <label
                          className="
                            mb-2
                            block
                            text-sm
                            font-semibold
                          "
                        >
                          Product Description
                          <span
                            className="
                              ml-2
                              text-xs
                              font-medium
                              text-[#94A3B8]
                            "
                          >
                            Optional
                          </span>
                        </label>

                        <textarea
                          name="description"
                          rows={4}
                          value={formData.description}
                          onChange={handleChange}
                          placeholder="Add any additional product information..."
                          className="
                            w-full
                            resize-none
                            rounded-xl
                            border
                            border-slate-200
                            px-4
                            py-3.5
                            text-sm
                            outline-none
                            focus:border-[#2563EB]
                            focus:ring-4
                            focus:ring-[#E0EFFF]
                          "
                        />

                      </div>

                      {/* PRODUCT IMAGE */}

                      <ProductImageUpload
                        imagePreview={imagePreview}
                        imageInputRef={imageInputRef}
                        handleImageChange={handleImageChange}
                      />

                    </div>

                    <div className="my-7 h-px bg-slate-100" />

                    <div
                      className="
                        flex
                        flex-col
                        gap-3
                        sm:flex-row
                        sm:justify-between
                      "
                    >

                      <button
                        type="button"
                        onClick={() => setCurrentStep(2)}
                        className="
                          inline-flex
                          h-12
                          items-center
                          justify-center
                          gap-2
                          rounded-xl
                          border
                          border-slate-200
                          px-5
                          text-sm
                          font-semibold
                          text-[#334155]
                          hover:bg-slate-50
                        "
                      >
                        <ArrowLeft size={17} />
                        Back
                      </button>

                      <button
                        type="submit"
                        className="
                          inline-flex
                          h-12
                          items-center
                          justify-center
                          gap-2.5
                          rounded-xl
                          bg-[#2563EB]
                          px-6
                          text-sm
                          font-semibold
                          text-white
                          shadow-[0_10px_24px_rgba(37,99,235,0.22)]
                          hover:bg-[#1D4EDB]
                        "
                      >
                        Continue
                        <ArrowRight size={17} />
                      </button>

                    </div>
                  </div>
                </form>
              )}

              {/* =============================================
                  STEP 4 — REGISTER
              ============================================= */}

              {currentStep === 4 && (
                <form
                  onSubmit={handleSubmit}
                  className="
                    overflow-hidden
                    rounded-[28px]
                    border
                    border-slate-200
                    bg-white
                    shadow-[0_12px_40px_rgba(15,23,42,0.05)]
                  "
                >

                  <div className="px-6 py-8 sm:px-8">

                    <div className="text-center">

                      <div
                        className="
                          mx-auto
                          flex
                          h-16
                          w-16
                          items-center
                          justify-center
                          rounded-2xl
                          bg-[#E0EFFF]
                          text-[#2563EB]
                        "
                      >
                        <ShieldCheck size={32} />
                      </div>

                      <h3
                        className="
                          mt-5
                          text-2xl
                          font-extrabold
                        "
                      >
                        Ready to Register
                      </h3>

                      <p
                        className="
                          mx-auto
                          mt-2
                          max-w-lg
                          text-sm
                          leading-6
                          text-[#64748B]
                        "
                      >
                        Your product information has been
                        reviewed. Register it to create the
                        digital warranty record.
                      </p>

                    </div>

                    <div
                      className="
                        mx-auto
                        mt-8
                        max-w-2xl
                        rounded-2xl
                        border
                        border-[#BFDBFE]
                        bg-[#E0EFFF]/50
                        p-5
                      "
                    >

                      <div className="grid gap-4 sm:grid-cols-2">

                        <SummaryItem
                          label="Product"
                          value={formData.productName}
                        />

                        <SummaryItem
                          label="Brand"
                          value={formData.brand}
                        />

                        <SummaryItem
                          label="Category"
                          value={formData.category}
                        />

                        <SummaryItem
                          label="Purchase Date"
                          value={formData.purchaseDate}
                        />

                        <SummaryItem
  label="Warranty"
  value={
    formData.warrantyPeriod
      ? `${formData.warrantyPeriod} ${formData.warrantyUnit}`
      : "Not specified"
  }
/>

                        <SummaryItem
                          label="Invoice"
                          value={
                            formData.invoiceNumber ||
                            "Not provided"
                          }
                        />

                        {formData.total && (
  <SummaryItem
    label="Invoice Total"
    value={`${formData.currency || ""} ${formData.total}`}
  />
)}

{formData.amountPaid && (
  <SummaryItem
    label="Amount Paid"
    value={`${formData.currency || ""} ${formData.amountPaid}`}
  />
)}

{formData.balanceDue && (
  <SummaryItem
    label="Balance Due"
    value={`${formData.currency || ""} ${formData.balanceDue}`}
  />
)}

                      </div>
                    </div>

                    <div
                      className="
                        mt-8
                        flex
                        flex-col
                        gap-3
                        sm:flex-row
                        sm:justify-center
                      "
                    >

                      <button
                        type="button"
                        onClick={() => setCurrentStep(3)}
                        className="
                          inline-flex
                          h-12
                          items-center
                          justify-center
                          gap-2
                          rounded-xl
                          border
                          border-slate-200
                          px-6
                          text-sm
                          font-semibold
                          text-[#334155]
                          hover:bg-slate-50
                        "
                      >
                        <ArrowLeft size={17} />
                        Edit Details
                      </button>

                      <button
                        type="submit"
                        className="
                          inline-flex
                          h-12
                          items-center
                          justify-center
                          gap-2.5
                          rounded-xl
                          bg-[#2563EB]
                          px-7
                          text-sm
                          font-semibold
                          text-white
                          shadow-[0_10px_24px_rgba(37,99,235,0.22)]
                          hover:bg-[#1D4EDB]
                        "
                      >
                        Register Product
                        <CheckCircle2 size={18} />
                      </button>

                    </div>

                  </div>
                </form>
              )}

            </div>

            {/* =================================================
                SIDE INFORMATION
            ================================================= */}

            <aside className="space-y-5">

              <div
                className="
                  rounded-[24px]
                  border
                  border-[#BFDBFE]
                  bg-[#E0EFFF]/60
                  p-6
                "
              >

                <div
                  className="
                    mb-5
                    flex
                    h-11
                    w-11
                    items-center
                    justify-center
                    rounded-xl
                    bg-[#2563EB]
                    text-white
                  "
                >
                  <Sparkles size={21} />
                </div>

                <h3 className="text-base font-bold">
                  AI-Powered Registration
                </h3>

                <p
                  className="
                    mt-2
                    text-xs
                    leading-5
                    text-[#64748B]
                  "
                >
                  Gemini analyzes your invoice and
                  automatically extracts the product
                  information for you.
                </p>

                <div className="mt-5 space-y-3">

                  <Feature text="Automatic data extraction" />

                  <Feature text="Review before registration" />

                  <Feature text="Automatic Product ID" />

                  <Feature text="Warranty record creation" />

                </div>
              </div>

              <div
                className="
                  rounded-[24px]
                  border
                  border-slate-200
                  bg-white
                  p-6
                  shadow-[0_8px_30px_rgba(15,23,42,0.04)]
                "
              >

                <p
                  className="
                    text-[10px]
                    font-bold
                    uppercase
                    tracking-[0.18em]
                    text-[#64748B]
                  "
                >
                  Registration Flow
                </p>

                <div className="mt-5 space-y-5">

                  <ProcessStep
                    number="01"
                    title="Upload Invoice"
                    active={currentStep === 1}
                  />

                  <ProcessStep
                    number="02"
                    title="AI Extraction"
                    active={currentStep === 2}
                  />

                  <ProcessStep
                    number="03"
                    title="Review & Edit"
                    active={currentStep === 3}
                  />

                  <ProcessStep
                    number="04"
                    title="Register Product"
                    active={currentStep === 4}
                  />

                </div>
              </div>

            </aside>

          </div>
        </div>
      </main>
    </div>
  );
}

// =========================================================
// STEP INDICATOR
// =========================================================

function StepIndicator({ currentStep }) {
  const steps = [
    "Upload Invoice",
    "AI Extraction",
    "Review & Edit",
    "Register",
  ];

  return (
    <div
      className="
        overflow-x-auto
        rounded-2xl
        border
        border-slate-200
        bg-white
        p-4
      "
    >
      <div className="flex min-w-[650px] items-center">

        {steps.map((step, index) => {
          const number = index + 1;
          const active = number === currentStep;
          const completed = number < currentStep;

          return (
            <div
              key={step}
              className="flex flex-1 items-center"
            >

              <div className="flex items-center gap-3">

                <div
                  className={`
                    flex
                    h-9
                    w-9
                    shrink-0
                    items-center
                    justify-center
                    rounded-full
                    text-xs
                    font-bold
                    ${
                      active || completed
                        ? "bg-[#2563EB] text-white"
                        : "bg-[#F1F5F9] text-[#64748B]"
                    }
                  `}
                >
                  {completed ? (
                    <CheckCircle2 size={17} />
                  ) : (
                    number
                  )}
                </div>

                <span
                  className={`
                    whitespace-nowrap
                    text-xs
                    font-semibold
                    ${
                      active
                        ? "text-[#0F172A]"
                        : "text-[#64748B]"
                    }
                  `}
                >
                  {step}
                </span>

              </div>

              {index < steps.length - 1 && (
                <div
                  className={`
                    mx-4
                    h-px
                    flex-1
                    ${
                      completed
                        ? "bg-[#2563EB]"
                        : "bg-slate-200"
                    }
                  `}
                />
              )}

            </div>
          );
        })}

      </div>
    </div>
  );
}

// =========================================================
// UPLOAD INVOICE STEP
// =========================================================

function UploadInvoiceStep({
  invoiceFile,
  invoicePreview,
  extracting,
  extractionError,
  invoiceInputRef,
  handleInvoiceChange,
  removeInvoice,
  retryExtraction,
  continueManually,
}) {
  return (
    <div
      className="
        overflow-hidden
        rounded-[28px]
        border
        border-slate-200
        bg-white
        shadow-[0_12px_40px_rgba(15,23,42,0.05)]
      "
    >

      <div
        className="
          border-b
          border-slate-100
          bg-gradient-to-r
          from-[#F8FAFC]
          to-[#E0EFFF]/45
          px-6
          py-6
          sm:px-8
        "
      >

        <div className="flex items-center gap-4">

          <div
            className="
              flex
              h-12
              w-12
              items-center
              justify-center
              rounded-2xl
              bg-[#E0EFFF]
              text-[#2563EB]
            "
          >
            <FileText size={23} />
          </div>

          <div>
            <h3 className="text-base font-bold">
              Upload Your Invoice
            </h3>

            <p className="mt-0.5 text-xs text-[#64748B]">
              AI will automatically read the invoice
              and extract the product details.
            </p>
          </div>

        </div>
      </div>

      <div className="px-6 py-8 sm:px-8">

        <input
          ref={invoiceInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          onChange={handleInvoiceChange}
          className="hidden"
        />

        {!invoiceFile ? (
          <button
            type="button"
            onClick={() =>
              invoiceInputRef.current?.click()
            }
            className="
              group
              flex
              min-h-[330px]
              w-full
              flex-col
              items-center
              justify-center
              rounded-3xl
              border-2
              border-dashed
              border-[#BFDBFE]
              bg-[#F8FAFC]
              px-6
              transition-all
              hover:border-[#2563EB]
              hover:bg-[#E0EFFF]/40
            "
          >

            <div
              className="
                mb-5
                flex
                h-16
                w-16
                items-center
                justify-center
                rounded-2xl
                bg-[#E0EFFF]
                text-[#2563EB]
                transition
                group-hover:scale-105
              "
            >
              <Upload size={28} />
            </div>

            <p
              className="
                text-lg
                font-bold
                text-[#0F172A]
              "
            >
              Upload Invoice
            </p>

            <p
              className="
                mt-2
                max-w-md
                text-center
                text-sm
                leading-6
                text-[#64748B]
              "
            >
              Upload a PDF or image of your purchase
              invoice. AI will extract the details
              automatically.
            </p>

            <span
              className="
                mt-5
                rounded-xl
                bg-[#2563EB]
                px-5
                py-2.5
                text-sm
                font-semibold
                text-white
              "
            >
              Choose Invoice
            </span>

            <p
              className="
                mt-4
                text-xs
                text-[#94A3B8]
              "
            >
              PDF, JPG, JPEG or PNG • Max 10 MB
            </p>

          </button>
        ) : (
          <div>

            <div
              className="
                overflow-hidden
                rounded-3xl
                border
                border-[#BFDBFE]
                bg-[#E0EFFF]/40
              "
            >

              {invoicePreview && (
                <div
                  className="
                    flex
                    min-h-[250px]
                    items-center
                    justify-center
                    border-b
                    border-[#BFDBFE]
                    bg-white
                    p-5
                  "
                >
                  <img
                    src={invoicePreview}
                    alt="Invoice preview"
                    className="
                      max-h-[400px]
                      max-w-full
                      rounded-xl
                      object-contain
                      shadow-sm
                    "
                  />
                </div>
              )}

              {!invoicePreview && (
                <div
                  className="
                    flex
                    min-h-[220px]
                    flex-col
                    items-center
                    justify-center
                    bg-white
                  "
                >
                  <FileText
                    size={55}
                    className="text-[#2563EB]"
                  />

                  <p className="mt-4 text-sm font-bold">
                    PDF Invoice
                  </p>
                </div>
              )}

              <div className="p-5">

                <div
                  className="
                    flex
                    flex-col
                    gap-4
                    sm:flex-row
                    sm:items-center
                    sm:justify-between
                  "
                >

                  <div className="flex items-center gap-3">

                    <CheckCircle2
                      size={20}
                      className="text-[#16A34A]"
                    />

                    <div>
                      <p className="text-sm font-bold">
                        {invoiceFile.name}
                      </p>

                      <p
                        className="
                          mt-1
                          text-xs
                          text-[#64748B]
                        "
                      >
                        {(
                          invoiceFile.size /
                          1024 /
                          1024
                        ).toFixed(2)}{" "}
                        MB
                      </p>
                    </div>

                  </div>

                  <button
                    type="button"
                    onClick={removeInvoice}
                    className="
                      inline-flex
                      items-center
                      gap-2
                      text-xs
                      font-semibold
                      text-red-600
                      hover:text-red-700
                    "
                  >
                    <X size={15} />
                    Remove
                  </button>

                </div>

              </div>
            </div>

            {extracting && (
              <div
                className="
                  mt-5
                  flex
                  items-center
                  gap-3
                  rounded-2xl
                  border
                  border-[#BFDBFE]
                  bg-[#E0EFFF]/50
                  px-5
                  py-4
                "
              >
                <RefreshCw
                  size={20}
                  className="animate-spin text-[#2563EB]"
                />

                <div>
                  <p className="text-sm font-bold">
                    AI is analyzing your invoice...
                  </p>

                  <p className="mt-1 text-xs text-[#64748B]">
                    This may take a few seconds.
                  </p>
                </div>
              </div>
            )}

            {extractionError && !extracting && (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5">
                <p className="text-sm font-semibold text-red-700">
                  {extractionError}
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={retryExtraction}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1D4EDB]"
                  >
                    <RefreshCw size={15} />
                    Retry extraction
                  </button>
                  <button
                    type="button"
                    onClick={continueManually}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#334155] hover:bg-slate-50"
                  >
                    Enter details manually
                  </button>
                </div>
              </div>
            )}

          </div>
        )}

        <div
          className="
            mt-7
            flex
            items-start
            gap-3
            rounded-2xl
            border
            border-slate-200
            bg-[#F8FAFC]
            p-4
          "
        >
          <Info
            size={18}
            className="
              mt-0.5
              shrink-0
              text-[#2563EB]
            "
          />

          <p
            className="
              text-xs
              leading-5
              text-[#64748B]
            "
          >
            Make sure the invoice is clear and readable.
            AI will extract the product name, brand,
            purchase date, invoice number and warranty
            information when available.
          </p>
        </div>

      </div>
    </div>
  );
}

// =========================================================
// EXTRACTED DATA STEP
// =========================================================

function ExtractedDataStep({
  extractedData,
  invoiceFile,
  onContinue,
  onBack,
}) {
  return (
    <div
      className="
        overflow-hidden
        rounded-[28px]
        border
        border-slate-200
        bg-white
        shadow-[0_12px_40px_rgba(15,23,42,0.05)]
      "
    >

      <div
        className="
          border-b
          border-slate-100
          bg-gradient-to-r
          from-[#F8FAFC]
          to-[#E0EFFF]/45
          px-6
          py-6
          sm:px-8
        "
      >

        <div className="flex items-center gap-4">

          <div
            className="
              flex
              h-12
              w-12
              items-center
              justify-center
              rounded-2xl
              bg-[#E0EFFF]
              text-[#2563EB]
            "
          >
            <Sparkles size={23} />
          </div>

          <div>
            <h3 className="text-base font-bold">
              AI Extraction Complete
            </h3>

            <p className="mt-0.5 text-xs text-[#64748B]">
              Gemini found the following information
              from your invoice.
            </p>
          </div>

        </div>
      </div>

      <div className="px-6 py-7 sm:px-8">

        {invoiceFile && (
          <div
            className="
              mb-6
              flex
              items-center
              gap-3
              rounded-2xl
              border
              border-green-200
              bg-green-50
              px-4
              py-3
            "
          >
            <CheckCircle2
              size={18}
              className="text-green-600"
            />

            <p
              className="
                text-sm
                font-semibold
                text-green-700
              "
            >
              Invoice analyzed successfully
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">

          <ExtractedItem
            label="Product Name"
            value={extractedData?.productName}
          />

          <ExtractedItem
            label="Brand"
            value={extractedData?.brand}
          />

          <ExtractedItem
            label="Category"
            value={extractedData?.category}
          />

          <ExtractedItem
            label="Purchase Date"
            value={extractedData?.purchaseDate}
          />

          <ExtractedItem
            label="Invoice Number"
            value={extractedData?.invoiceNumber}
          />

          <ExtractedItem
            label="Warranty"
            value={
              extractedData?.warrantyPeriod
                ? `${extractedData.warrantyPeriod} ${extractedData.warrantyUnit}`
                : ""
            }
          />

        </div>

        {extractedData?.description && (
          <div className="mt-4">
            <ExtractedItem
              label="Description"
              value={extractedData.description}
            />
          </div>
        )}

        <div
          className="
            mt-7
            rounded-2xl
            border
            border-[#BFDBFE]
            bg-[#E0EFFF]/50
            p-4
          "
        >
          <div className="flex items-start gap-3">

            <Info
              size={18}
              className="
                mt-0.5
                shrink-0
                text-[#2563EB]
              "
            />

            <p
              className="
                text-xs
                leading-5
                text-[#475569]
              "
            >
              AI extraction is not always perfect.
              You will be able to review and edit every
              field before registering the product.
            </p>

          </div>
        </div>

        <div
          className="
            mt-7
            flex
            flex-col
            gap-3
            sm:flex-row
            sm:justify-between
          "
        >

          <button
            type="button"
            onClick={onBack}
            className="
              inline-flex
              h-12
              items-center
              justify-center
              gap-2
              rounded-xl
              border
              border-slate-200
              px-5
              text-sm
              font-semibold
              text-[#334155]
              hover:bg-slate-50
            "
          >
            <ArrowLeft size={17} />
            Back
          </button>

          <button
            type="button"
            onClick={onContinue}
            className="
              inline-flex
              h-12
              items-center
              justify-center
              gap-2
              rounded-xl
              bg-[#2563EB]
              px-6
              text-sm
              font-semibold
              text-white
              shadow-[0_10px_24px_rgba(37,99,235,0.22)]
              hover:bg-[#1D4EDB]
            "
          >
            Review & Edit
            <ArrowRight size={17} />
          </button>

        </div>

      </div>
    </div>
  );
}

// =========================================================
// EXTRACTED ITEM
// =========================================================

function ExtractedItem({ label, value }) {
  return (
    <div
      className="
        rounded-xl
        border
        border-slate-200
        bg-white
        p-4
      "
    >
      <p
        className="
          text-[10px]
          font-bold
          uppercase
          tracking-[0.12em]
          text-[#94A3B8]
        "
      >
        {label}
      </p>

      <p
        className="
          mt-1
          text-sm
          font-semibold
          text-[#0F172A]
        "
      >
        {value || "Not detected"}
      </p>
    </div>
  );
}

// =========================================================
// PRODUCT IMAGE
// =========================================================

function ProductImageUpload({
  imagePreview,
  imageInputRef,
  handleImageChange,
}) {
  return (
    <div className="md:col-span-2">

      <label
        className="
          mb-2
          block
          text-sm
          font-semibold
        "
      >
        Product Image
        <span
          className="
            ml-2
            text-xs
            font-medium
            text-[#94A3B8]
          "
        >
          Optional
        </span>
      </label>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleImageChange}
        className="hidden"
      />

      {!imagePreview ? (
        <button
          type="button"
          onClick={() =>
            imageInputRef.current?.click()
          }
          className="
            group
            flex
            min-h-[170px]
            w-full
            flex-col
            items-center
            justify-center
            rounded-2xl
            border-2
            border-dashed
            border-[#BFDBFE]
            bg-[#F8FAFC]
            hover:border-[#2563EB]
            hover:bg-[#E0EFFF]/40
          "
        >

          <div
            className="
              mb-3
              flex
              h-12
              w-12
              items-center
              justify-center
              rounded-xl
              bg-[#E0EFFF]
              text-[#2563EB]
            "
          >
            <Upload size={21} />
          </div>

          <p className="text-sm font-semibold">
            Upload Product Image
          </p>

          <p
            className="
              mt-1
              text-xs
              text-[#64748B]
            "
          >
            PNG, JPG or WEBP • Max 5 MB
          </p>

        </button>
      ) : (
        <div
          className="
            rounded-2xl
            border
            border-[#BFDBFE]
            bg-[#E0EFFF]
            p-4
          "
        >

          <div className="flex items-center gap-5">

            <div
              className="
                flex
                h-32
                w-32
                shrink-0
                overflow-hidden
                rounded-xl
                bg-white
              "
            >
              {imagePreview && (
                <img
                  src={imagePreview}
                  alt="Product preview"
                  className="
                    h-full
                    w-full
                    object-contain
                  "
                />
              )}
            </div>

            <div>

              <div className="flex items-center gap-2">

                <CheckCircle2
                  size={17}
                  className="text-[#16A34A]"
                />

                <p className="text-sm font-semibold">
                  Image uploaded
                </p>

              </div>

              <button
                type="button"
                onClick={() =>
                  imageInputRef.current?.click()
                }
                className="
                  mt-2
                  text-xs
                  font-semibold
                  text-[#2563EB]
                "
              >
                Change image
              </button>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================
// CATEGORY FIELD
// =========================================================

function CategoryField({ value, onChange }) {
  return (
    <div>

      <label
        className="
          mb-2
          block
          text-sm
          font-semibold
        "
      >
        Category
        <span className="ml-1 text-red-500">
          *
        </span>
      </label>

      <div className="relative">

        <select
          name="category"
          required
          value={value}
          onChange={onChange}
          className={`${inputClass} appearance-none pr-10`}
        >

          <option value="">
            Select category
          </option>

          <option value="Laptop">
            Laptop
          </option>

          <option value="Smartphone">
            Smartphone
          </option>

          <option value="Headphones">
            Headphones
          </option>

          <option value="Smartwatch">
            Smartwatch
          </option>

          <option value="Tablet">
            Tablet
          </option>

          <option value="Electronics">
            Electronics
          </option>

          <option value="Software">
            Software
          </option>

          <option value="Other">
            Other
          </option>

        </select>

        <ChevronDown
          size={17}
          className="
            pointer-events-none
            absolute
            right-4
            top-1/2
            -translate-y-1/2
            text-[#64748B]
          "
        />

      </div>
    </div>
  );
}

// =========================================================
// FORM FIELD
// =========================================================

function FormField({
  label,
  required,
  name,
  placeholder,
  value,
  onChange,
}) {
  return (
    <div>

      <label
        className="
          mb-2
          block
          text-sm
          font-semibold
        "
      >
        {label}

        {required && (
          <span className="ml-1 text-red-500">
            *
          </span>
        )}
      </label>

      <input
        name={name}
        required={required}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={inputClass}
      />

    </div>
  );
}

// =========================================================
// SUMMARY ITEM
// =========================================================

function SummaryItem({ label, value }) {
  return (
    <div>
      <p
        className="
          text-[10px]
          font-bold
          uppercase
          tracking-[0.12em]
          text-[#64748B]
        "
      >
        {label}
      </p>

      <p
        className="
          mt-1
          text-sm
          font-semibold
          text-[#0F172A]
        "
      >
        {value || "Not provided"}
      </p>
    </div>
  );
}

// =========================================================
// FEATURE
// =========================================================

function Feature({ text }) {
  return (
    <div className="flex items-center gap-2.5">

      <CheckCircle2
        size={16}
        className="shrink-0 text-[#2563EB]"
      />

      <span
        className="
          text-xs
          font-medium
          text-[#334155]
        "
      >
        {text}
      </span>

    </div>
  );
}

// =========================================================
// PROCESS STEP
// =========================================================

function ProcessStep({
  number,
  title,
  active = false,
}) {
  return (
    <div className="flex items-center gap-3">

      <div
        className={`
          flex
          h-9
          w-9
          shrink-0
          items-center
          justify-center
          rounded-full
          text-[10px]
          font-bold
          ${
            active
              ? "bg-[#2563EB] text-white"
              : "bg-[#F1F5F9] text-[#64748B]"
          }
        `}
      >
        {number}
      </div>

      <span
        className={`
          text-xs
          font-semibold
          ${
            active
              ? "text-[#0F172A]"
              : "text-[#64748B]"
          }
        `}
      >
        {title}
      </span>

    </div>
  );
}

// =========================================================
// COMMON INPUT CLASS
// =========================================================

const inputClass = `
  h-12
  w-full
  rounded-xl
  border
  border-slate-200
  bg-white
  px-4
  text-sm
  text-[#0F172A]
  outline-none
  transition
  placeholder:text-[#94A3B8]
  hover:border-slate-300
  focus:border-[#2563EB]
  focus:ring-4
  focus:ring-[#E0EFFF]
`;

export default RegisterProduct;