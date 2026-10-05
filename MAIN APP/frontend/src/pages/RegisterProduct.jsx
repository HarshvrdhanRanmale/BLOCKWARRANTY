import {
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
import { useWallet } from "../blockchain/useWallet";
import {
  registerProductOnChain,
  productKey,
  serialHash,
  metadataHash,
  toUnixSeconds,
} from "../blockchain/contractService";

const PRODUCT_CATEGORIES = [
  "Laptop",
  "Smartphone",
  "Headphones",
  "Smartwatch",
  "Tablet",
  "Electronics",
  "Software",
  "Other",
];

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

async function readApiJson(response, action) {
  const contentType = response.headers.get("content-type") || "";
  const body = await response.text();

  if (!body) return {};
  if (!contentType.includes("application/json")) {
    if (action === "Invoice extraction" && response.status >= 500) {
      throw new Error("Could not connect to Groq. Start the backend in a normal Windows terminal with internet access, then retry.");
    }
    throw new Error(`${action} service returned an invalid response. Refresh the page and retry.`);
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${action} service returned unreadable data. Please retry.`);
  }
}

const createEmptyFormData = () => ({
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
  productImageSourceUrl: "",
  invoiceExtractedData: {},
});

function RegisterProduct() {
  const { token, signer, isCorrectNetwork, switchToSepolia } = useWallet();
  const [sidebarPinnedOpen, setSidebarPinnedOpen] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const sidebarOpen = sidebarPinnedOpen || sidebarHovered;

  const [currentStep, setCurrentStep] = useState(1);

  const [invoiceFile, setInvoiceFile] = useState(null);
  const [invoicePreview, setInvoicePreview] = useState("");

  const [extracting, setExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState("");
  const [showAllPricing, setShowAllPricing] = useState(false);

  const [imagePreview, setImagePreview] = useState("");
  const [imageSearchStatus, setImageSearchStatus] = useState("");
  const [imageAttribution, setImageAttribution] = useState(null);

  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const invoiceInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const imageSearchId = useRef(0);

  const [formData, setFormData] = useState(createEmptyFormData);
  const [blockchainStatus, setBlockchainStatus] = useState("not_started");
  const [blockchainTxHash, setBlockchainTxHash] = useState("");
  const [blockchainMessage, setBlockchainMessage] = useState("");

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
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      setErrorMessage(
        "Please upload a JPG, PNG, or WEBP invoice image."
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
    imageSearchId.current += 1;
    setImageSearchStatus("");
    setImageAttribution(null);
    setImagePreview("");
    setFormData((prev) => ({
      ...prev,
      productImage: "",
      productImageSourceUrl: "",
      invoiceExtractedData: {},
    }));

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
  // INVOICE EXTRACTION
  // =========================================================

  const extractInvoice = async (file) => {
    setExtracting(true);
    setErrorMessage("");
    setExtractionError("");

    try {
      if (file.type === "application/pdf") {
        throw new Error("Groq invoice extraction currently needs an image. Please upload a JPG or PNG version of this invoice.");
      }
      const fileData = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
        reader.onerror = () => reject(new Error("The selected invoice image could not be read."));
        reader.readAsDataURL(file);
      });

      const response = await fetch(
        `${API_BASE_URL}/api/extract-invoice`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, fileType: file.type, fileData }),
        }
      );

      const data = await readApiJson(response, "Invoice extraction");

      if (!response.ok) {
        const serverError = data.error ? `: ${data.error}` : "";
        throw new Error(
          `${data.message || "Invoice extraction failed."}${serverError}`
        );
      }

      const extracted = data.extractedData || {};

      setFormData((prev) => ({
        ...prev,
        invoiceExtractedData: extracted,
        productName: extracted.productName || "",
        brand: extracted.brand || "",
        category: PRODUCT_CATEGORIES.includes(extracted.category)
          ? extracted.category
          : "Other",
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

      if (extracted.productName) {
        void lookupProductImage(extracted.productName, extracted.brand || "");
      } else {
        setImageSearchStatus("Add a product name to search for an image.");
      }
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
    imageSearchId.current += 1;
    setInvoiceFile(null);
    setInvoicePreview("");
    setExtractionError("");
    setImagePreview("");
    setImageSearchStatus("");
    setImageAttribution(null);
    setFormData(createEmptyFormData());
    setCurrentStep(1);
    setErrorMessage("");

    if (invoiceInputRef.current) {
      invoiceInputRef.current.value = "";
    }
  };

  // =========================================================
  // PRODUCT IMAGE
  // =========================================================

  const lookupProductImage = async (productName, brand) => {
    const requestId = ++imageSearchId.current;
    setImageSearchStatus("Searching for a possible product image...");
    setImageAttribution(null);

    try {
      const query = new URLSearchParams({ productName, brand });
      const response = await fetch(
        `${API_BASE_URL}/api/product-image?${query.toString()}`
      );
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error(
          "The image-search API is unavailable. Restart the backend from the backend folder and try again."
        );
      }
      const data = await readApiJson(response, "Product image search");

      if (!response.ok) {
        throw new Error(data.message || "Product image search failed.");
      }

      if (requestId !== imageSearchId.current) return;

      if (!data.image?.imageUrl) {
        if (formData.productImageSourceUrl) {
          setImagePreview("");
          setFormData((prev) => ({
            ...prev,
            productImage: "",
            productImageSourceUrl: "",
          }));
        }
        setImageSearchStatus("No matching image found. You can upload one instead.");
        return;
      }

      setImagePreview(data.image.imageUrl);
      setFormData((prev) => ({
        ...prev,
        productImage: data.image.imageUrl,
        productImageSourceUrl: data.image.sourceUrl || "",
      }));
      setImageAttribution(data.image);
      setImageSearchStatus("Possible match found. Verify it or upload a different image.");
    } catch (error) {
      if (requestId !== imageSearchId.current) return;
      console.error("Product image search error:", error);
      setImageSearchStatus(
        error.message || "Image search failed. You can upload an image instead."
      );
    }
  };

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
    imageSearchId.current += 1;
    setImageSearchStatus("Using your uploaded image.");
    setImageAttribution(null);

    const reader = new FileReader();

    reader.onloadend = () => {
      setImagePreview(reader.result);

      setFormData((prev) => ({
        ...prev,
        productImage: reader.result,
        productImageSourceUrl: "",
      }));
    };

    reader.onerror = () => {
      setErrorMessage("The selected product image could not be read.");
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

    if (!signer) {
      setErrorMessage("Please connect your MetaMask wallet before registering a product.");
      return;
    }

    try {
      if (!isCorrectNetwork) {
        setBlockchainMessage("Switching network to Sepolia...");
        await switchToSepolia();
      }

      setBlockchainStatus("pending");
      setBlockchainMessage("Preparing product hashes and blockchain transaction...");

      // 1. Generate unique readable Product ID
      const pId = `BW-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      // 2. Compute local hashes
      const pKey = productKey(pId);
      const sHash = serialHash(formData.invoiceNumber || pId);
      const mHash = metadataHash({
        productName: formData.productName,
        brand: formData.brand,
        category: formData.category,
        invoiceNumber: formData.invoiceNumber,
      });

      const pDate = toUnixSeconds(formData.purchaseDate || new Date());
      const multiplier = formData.warrantyUnit === "Days" ? 86400 : formData.warrantyUnit === "Months" ? 2592000 : 31536000;
      const wStart = pDate;
      const wExpiry = formData.warrantyPeriod ? wStart + (Number(formData.warrantyPeriod) * multiplier) : wStart + (365 * 86400);

      setBlockchainMessage("Please confirm the product registration transaction in MetaMask...");

      // 3. Prompt MetaMask transaction directly on BCCC contract
      const { txHash } = await registerProductOnChain(signer, {
        productKey: pKey,
        serialNumberHash: sHash,
        purchaseDate: pDate,
        warrantyStart: wStart,
        warrantyExpiry: wExpiry,
        metadataHash: mHash,
      });

      setBlockchainStatus("submitted");
      setBlockchainTxHash(txHash);
      setBlockchainMessage("Transaction confirmed on Sepolia! Verifying and saving private metadata...");

      // 4. Send confirmed transaction hash and metadata to backend
      const invoicePayload = invoiceFile ? await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({
          name: invoiceFile.name,
          mimeType: invoiceFile.type,
          data: String(reader.result).split(",")[1] || "",
        });
        reader.onerror = () => reject(new Error("The invoice file could not be prepared for storage."));
        reader.readAsDataURL(invoiceFile);
      }) : null;

      const response = await fetch(
        `${API_BASE_URL}/api/products`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token || localStorage.getItem("blockwarranty_token") || ""}`,
          },
          body: JSON.stringify({
            ...formData,
            productId: pId,
            txHash,
            invoiceFile: invoicePayload,
          }),
        }
      );

      const data = await readApiJson(response, "Product registration");

      if (!response.ok) {
        throw new Error(data.error || data.message || "Failed to save product metadata.");
      }

      setBlockchainStatus("confirmed");
      setBlockchainMessage(`Product registered on Sepolia! Transaction: ${txHash}`);
      setSuccessMessage(
        `Product registered successfully! Product ID: ${data.product.productId}`
      );

      // Reset form
      setFormData(createEmptyFormData());
      setInvoiceFile(null);
      setInvoicePreview("");
      setImagePreview("");
      setImageSearchStatus("");
      setImageAttribution(null);
      setCurrentStep(1);
      imageSearchId.current += 1;

      if (invoiceInputRef.current) invoiceInputRef.current.value = "";
      if (imageInputRef.current) imageInputRef.current.value = "";
    } catch (error) {
      console.error("Registration error:", error);
      setBlockchainStatus("failed");
      setBlockchainMessage(error.message || "Blockchain transaction failed.");
      setErrorMessage(error.message || "Failed to register product.");
    }
  };

    // =========================================================
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

          {blockchainStatus !== "not_started" && (
            <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm">
              <div className="flex items-center gap-2 font-bold text-blue-800">
                <ShieldCheck size={18} />
                Blockchain Registration
              </div>
              <p className="mt-1 text-blue-700">Status: {blockchainStatus}</p>
              {blockchainMessage && <p className="mt-1 text-xs text-blue-600">{blockchainMessage}</p>}
              {blockchainTxHash && (
                <p className="mt-1 text-xs text-blue-600 truncate">Transaction: {blockchainTxHash}</p>
              )}
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

          <div className="mt-6">

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
                    setCurrentStep(2);
                  }}
                />
              )}

              {/* =============================================
                  STEP 2 — REVIEW & EDIT
              ============================================= */}

              {currentStep === 2 && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setErrorMessage("");
                    setCurrentStep(3);
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
                        imageSearchStatus={imageSearchStatus}
                        imageAttribution={imageAttribution}
                        onSearchImage={() =>
                          lookupProductImage(formData.productName, formData.brand)
                        }
                        imageSearching={
                          imageSearchStatus === "Searching for a possible product image..."
                        }
                        hasProductName={Boolean(formData.productName.trim())}
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
                        onClick={() => setCurrentStep(1)}
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
                  STEP 3 — CONFIRM & REGISTER
              ============================================= */}

              {currentStep === 3 && (
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

                        <div className="sm:col-span-2">
                          {imagePreview ? (
                            <img
                              src={imagePreview}
                              alt={`${formData.productName} product`}
                              className="h-48 w-full rounded-xl bg-white object-contain p-3"
                            />
                          ) : (
                            <div className="flex h-48 items-center justify-center rounded-xl bg-white text-sm text-slate-500">
                              No product image added
                            </div>
                          )}
                        </div>

                        <SummaryItem label="Product" value={formData.productName} />
                        <SummaryItem label="Brand" value={formData.brand} />
                        <SummaryItem label="Category" value={formData.category} />
                        <SummaryItem label="Purchase Date" value={formData.purchaseDate} />
                        <SummaryItem
                          label="Warranty"
                          value={
                            formData.warrantyPeriod
                              ? `${formData.warrantyPeriod} ${formData.warrantyUnit}`
                              : ""
                          }
                        />
                        <SummaryItem label="Invoice Number" value={formData.invoiceNumber} />
                        <SummaryItem label="Currency" value={formData.currency} />
                        <SummaryItem label="Unit Price" value={formData.unitPrice} />
                        <SummaryItem label="Quantity" value={formData.quantity} />
                        <SummaryItem label="Line Item Amount" value={formData.lineItemAmount} />
                        <SummaryItem label="Subtotal" value={formData.subtotal} />
                        <SummaryItem label="Discount" value={formData.discount} />
                        <SummaryItem label="Shipping Cost" value={formData.shippingCost} />
                        <SummaryItem label="Tax" value={formData.tax} />
                        <SummaryItem label="Invoice Total" value={formData.total} />
                        <SummaryItem label="Amount Paid" value={formData.amountPaid} />
                        <SummaryItem label="Balance Due" value={formData.balanceDue} />
                        <div className="sm:col-span-2">
                          <SummaryItem label="Description" value={formData.description} />
                        </div>
                        {imageAttribution?.sourceUrl && (
                          <p className="sm:col-span-2 text-xs text-slate-500">
                            Image source:{" "}
                            <a
                              href={imageAttribution.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium text-blue-700 underline"
                            >
                              Wikimedia Commons
                            </a>
                            {imageAttribution.license
                              ? ` · ${imageAttribution.license}`
                              : ""}
                            {imageAttribution.artist
                              ? ` · ${imageAttribution.artist}`
                              : ""}
                          </p>
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
    "Review & Edit",
    "Confirm & Register",
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
      <div className="flex min-w-[500px] items-center">

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
          accept=".png,.jpg,.jpeg,.webp"
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
              Upload an image of your purchase
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
              JPG, JPEG, PNG or WEBP • Max 10 MB
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
// PRODUCT IMAGE
// =========================================================

function ProductImageUpload({
  imagePreview,
  imageInputRef,
  handleImageChange,
  imageSearchStatus,
  imageAttribution,
  onSearchImage,
  imageSearching,
  hasProductName,
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
                  {imageAttribution ? "Suggested image found" : "Product image selected"}
                </p>

              </div>

              {imageSearchStatus && (
                <p className="mt-1 max-w-md text-xs text-slate-600">
                  {imageSearchStatus}
                </p>
              )}

              {imageAttribution?.sourceUrl && (
                <p className="mt-1 text-xs text-slate-500">
                  Source:{" "}
                  <a
                    href={imageAttribution.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-700 underline"
                  >
                    Wikimedia Commons
                  </a>
                  {imageAttribution.license ? ` · ${imageAttribution.license}` : ""}
                </p>
              )}

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
      {!imagePreview && imageSearchStatus && (
        <p className="mt-2 text-xs text-slate-600">{imageSearchStatus}</p>
      )}
      {imageSearchStatus && (
        <button
          type="button"
          onClick={onSearchImage}
          disabled={!hasProductName || imageSearching}
          className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-blue-700 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          <RefreshCw size={14} className={imageSearching ? "animate-spin" : ""} />
          {imageSearching ? "Searching..." : "Search for another image"}
        </button>
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

          {PRODUCT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}

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
