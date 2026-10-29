import { useEffect, useState, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Boxes,
  ArrowLeft,
  UploadCloud,
  Download,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  FileSpreadsheet,
  ShieldCheck,
  PackageCheck,
  Copy,
  Check,
  Ban,
  Clock,
  Layers,
  FileText,
  LoaderCircle,
  ExternalLink,
  Info,
  Sparkles,
  Plus,
  HelpCircle,
  Lock,
  Binary,
  Hash,
  Shield,
  ArrowRight,
  CheckCheck,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import WorkspaceLayout from "../../components/WorkspaceLayout";
import { useWallet } from "../../blockchain/useWallet";
import { apiGet, apiPost, apiDelete, API_BASE_URL } from "../../lib/api";
import { parseCsvText } from "../../lib/csvParser";
import {
  registerProductOnChain,
  ensureSepoliaNetwork,
  hashString,
} from "../../blockchain/contractService";
import { CONTRACT_ADDRESS } from "../../blockchain/contractConfig";

export default function SupplierInventory() {
  const { user, token, signer, provider, walletAddress, isConnected, connectWallet } = useWallet();
  const brand = user?.supplierProfile?.brandName || "Authorized Brand";

  // Data state
  const [items, setItems] = useState([]);
  const [metrics, setMetrics] = useState({
    totalUnits: 0,
    unclaimedUnits: 0,
    registeredUnits: 0,
    voidedUnits: 0,
  });
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  // Pagination state (25 units per page)
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;

  // Filter & Search state
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [copiedSerial, setCopiedSerial] = useState(null);

  // Floating Action Button (FAB) hover state
  const [isFabHovered, setIsFabHovered] = useState(false);

  // Import Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalPhase, setModalPhase] = useState("upload"); // 'upload' | 'preview' | 'success'
  const [csvFile, setCsvFile] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  const [validationResult, setValidationResult] = useState(null);
  const [validating, setValidating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState(null);
  const [batchMetadata, setBatchMetadata] = useState({
    purchaseOrderNumber: "",
    shipmentReference: "",
  });

  // Merkle Blockchain Anchoring state
  const [anchoring, setAnchoring] = useState(false);
  const [anchorTxHash, setAnchorTxHash] = useState("");
  const [anchorError, setAnchorError] = useState("");
  const [batchAnchorLoading, setBatchAnchorLoading] = useState(null);

  // Cryptographic Proof Inspector Modal state
  const [inspectingItem, setInspectingItem] = useState(null);

  const fileInputRef = useRef(null);

  // Fetch Inventory and Metrics
  const fetchInventory = async () => {
    setLoading(true);
    setFetchError("");
    try {
      const queryParams = new URLSearchParams();
      if (statusFilter !== "all") queryParams.append("status", statusFilter);
      if (searchTerm.trim()) queryParams.append("search", searchTerm.trim());

      const data = await apiGet(`/api/supplier/inventory?${queryParams.toString()}`, token);
      if (data && data.success) {
        setItems(data.items || []);
        if (data.metrics) setMetrics(data.metrics);
      }
    } catch (err) {
      setFetchError(err.message || "Failed to load supplier inventory.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
    fetchInventory();
  }, [statusFilter, searchTerm]);

  useEffect(() => {
    if (!isModalOpen && !inspectingItem) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (isModalOpen) resetModal();
        if (inspectingItem) setInspectingItem(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isModalOpen, inspectingItem]);

  // Derived pagination variables
  const totalPages = Math.ceil(items.length / PAGE_SIZE) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return items.slice(start, start + PAGE_SIZE);
  }, [items, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  // Handle Copy to Clipboard
  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedSerial(text);
    setTimeout(() => setCopiedSerial(null), 1800);
  };

  // Download official CSV template
  const handleDownloadTemplate = () => {
    window.open(`${API_BASE_URL}/api/supplier/inventory/template`, "_blank");
  };

  // Handle CSV file selection and parsing
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      alert("Please upload a standard CSV file (.csv).");
      return;
    }

    setCsvFile(file);
    const text = await file.text();
    const rows = parseCsvText(text);

    if (rows.length === 0) {
      alert("The selected file is empty or missing headers. Please download the template.");
      return;
    }

    setParsedRows(rows);
    setValidating(true);
    setModalPhase("preview");

    try {
      const res = await apiPost("/api/supplier/inventory/validate", { rows }, token);
      setValidationResult(res);
    } catch (err) {
      alert(err.message || "Validation failed on the server.");
      setModalPhase("upload");
    } finally {
      setValidating(false);
    }
  };

  // Anchor on-chain first, and ONLY IF successful, save to the database atomically!
  const handleAnchorAndCommitBatch = async () => {
    if (!validationResult || !validationResult.isValid) return;

    setAnchoring(true);
    setAnchorError("");

    try {
      if (!window.ethereum) {
        throw new Error("MetaMask is required to sign transactions.");
      }

      await ensureSepoliaNetwork(provider);

      let activeSigner = signer;
      if (!activeSigner && window.ethereum) {
        const { BrowserProvider } = await import("ethers");
        const p = new BrowserProvider(window.ethereum);
        activeSigner = await p.getSigner();
      }

      if (!activeSigner) {
        throw new Error("Wallet signer not available. Please connect your Web3 wallet.");
      }

      const batchId = validationResult.importBatchId;
      const batchKey = validationResult.batchKey;
      const merkleRoot = validationResult.merkleRoot;

      const nowSec = Math.floor(Date.now() / 1000);
      // Valid contract warranty timeframe: warrantyExpiry must be >= warrantyStart
      const expirySec = nowSec + (5 * 365 * 86400); // 5-year standard commitment validity
      const metaHash = hashString(batchId);

      // STEP 1: Execute single lightweight transaction on Sepolia (~45,000 gas)
      const { receipt } = await registerProductOnChain(activeSigner, {
        productKey: batchKey,
        serialNumberHash: merkleRoot,
        purchaseDate: nowSec,
        warrantyStart: nowSec,
        warrantyExpiry: expirySec,
        metadataHash: metaHash,
      });

      const txHash = receipt?.hash || "";
      setAnchorTxHash(txHash);

      // STEP 2: ONLY AFTER on-chain receipt is verified, commit units to DB!
      const res = await apiPost(
        "/api/supplier/inventory/import",
        {
          rows: parsedRows,
          metadata: batchMetadata,
          txHash,
          blockNumber: receipt?.blockNumber ? Number(receipt.blockNumber) : undefined,
          importBatchId: batchId,
          merkleRoot,
          batchKey,
        },
        token
      );

      setCommitResult(res);
      setModalPhase("success");
      fetchInventory();
    } catch (err) {
      console.error("Anchoring & commit error:", err);
      const reason =
        err.reason ||
        err.shortMessage ||
        err.data?.message ||
        err.message ||
        "Failed to anchor batch to Sepolia blockchain.";
      setAnchorError(
        reason.includes("user rejected") || reason.includes("ACTION_REJECTED")
          ? "Transaction cancelled in MetaMask. Nothing was saved to the database."
          : reason
      );
    } finally {
      setAnchoring(false);
    }
  };

  // Clear supplier test inventory from database
  const handleClearInventory = async () => {
    if (!window.confirm("Are you sure you want to clear your test inventory from the database? This cannot be undone.")) {
      return;
    }
    try {
      await apiDelete("/api/supplier/inventory/clear", token);
      await fetchInventory();
    } catch (err) {
      alert(err.message || "Failed to clear test inventory.");
    }
  };

  const resetModal = () => {
    setIsModalOpen(false);
    setModalPhase("upload");
    setCsvFile(null);
    setParsedRows([]);
    setValidationResult(null);
    setCommitResult(null);
    setAnchorTxHash("");
    setAnchorError("");
    setAnchoring(false);
    setBatchMetadata({ purchaseOrderNumber: "", shipmentReference: "" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <WorkspaceLayout>
      <div className="mx-auto max-w-7xl space-y-6 pb-24">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
          <Link to="/supplier/dashboard" className="hover:text-slate-700 transition">
            Supplier Portal
          </Link>
          <span>/</span>
          <span className="text-slate-800 font-semibold">Inventory Registry</span>
        </div>

        {/* Executive Header (Streamlined, No Bulky Import Box) */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                Inventory & Serial Registry
              </h1>
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 border border-blue-100">
                {brand}
              </span>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-slate-500 max-w-2xl">
              Authoritative hardware ledger. Physical serial numbers registered here are cryptographically verified upon customer purchase.
            </p>
          </div>

          {/* Minimalist Top Actions */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:border-slate-300 hover:bg-slate-50 transition"
              title="Download pre-formatted CSV template"
            >
              <Download size={14} className="text-slate-500" />
              <span>CSV Template</span>
            </button>
          </div>
        </div>

        {/* Executive Stat Cards */}
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
          {/* Total Units */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4.5 shadow-xs transition hover:border-slate-300">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Units</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Boxes size={15} />
              </span>
            </div>
            <p className="mt-2 text-2xl font-black tracking-tight text-slate-900">{metrics.totalUnits || 0}</p>
            <span className="mt-1 inline-block text-[11px] font-medium text-slate-400">All registered batches</span>
          </div>

          {/* In-Stock / Unclaimed */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4.5 shadow-xs transition hover:border-slate-300">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">In-Stock</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <PackageCheck size={15} />
              </span>
            </div>
            <p className="mt-2 text-2xl font-black tracking-tight text-emerald-700">{metrics.unclaimedUnits || 0}</p>
            <span className="mt-1 inline-block text-[11px] font-medium text-emerald-600/80">Available for claim</span>
          </div>

          {/* Customer Registered */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4.5 shadow-xs transition hover:border-slate-300">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Registered</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <ShieldCheck size={15} />
              </span>
            </div>
            <p className="mt-2 text-2xl font-black tracking-tight text-indigo-700">{metrics.registeredUnits || 0}</p>
            <span className="mt-1 inline-block text-[11px] font-medium text-indigo-600/80">Active warranties</span>
          </div>

          {/* Voided */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4.5 shadow-xs transition hover:border-slate-300">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Voided / Defect</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                <Ban size={15} />
              </span>
            </div>
            <p className="mt-2 text-2xl font-black tracking-tight text-slate-600">{metrics.voidedUnits || 0}</p>
            <span className="mt-1 inline-block text-[11px] font-medium text-slate-400">Revoked units</span>
          </div>
        </div>

        {/* Filter Tabs and Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
          {/* Segmented Control Tabs */}
          <div className="inline-flex rounded-xl border border-slate-200/90 bg-slate-100/80 p-1">
            {[
              { id: "all", label: "All Units", count: metrics.totalUnits },
              { id: "unclaimed", label: "In-Stock", count: metrics.unclaimedUnits },
              { id: "registered", label: "Registered", count: metrics.registeredUnits },
              { id: "voided", label: "Voided", count: metrics.voidedUnits },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  statusFilter === tab.id
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-md px-1.5 py-0.2 text-[10px] font-bold ${
                    statusFilter === tab.id ? "bg-slate-100 text-slate-700" : "text-slate-400"
                  }`}
                >
                  {tab.count || 0}
                </span>
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search serial, model, or SKU…"
              className="w-full rounded-xl border border-slate-200/90 bg-white pl-8 pr-7 py-2 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 shadow-xs"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Inventory Registry Table */}
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-14 text-center text-slate-400">
              <LoaderCircle size={28} className="animate-spin text-blue-600" />
              <p className="mt-2.5 text-xs font-semibold text-slate-600">Syncing inventory registry…</p>
            </div>
          ) : fetchError ? (
            <div className="p-10 text-center text-red-600">
              <AlertCircle size={26} className="mx-auto" />
              <p className="mt-2 text-xs font-bold">{fetchError}</p>
              <button
                type="button"
                onClick={fetchInventory}
                className="mt-3 rounded-lg bg-slate-100 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
              >
                Retry
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="p-14 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <Boxes size={24} />
              </div>
              <h2 className="mt-3 text-sm font-bold text-slate-800">No Physical Units Found</h2>
              <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
                {searchTerm || statusFilter !== "all"
                  ? "No records matched your search query or filter."
                  : "Use the floating blue button in the bottom right corner to import your first CSV batch."}
              </p>
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
              >
                <UploadCloud size={14} /> Import CSV Batch
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-3">Product Line</th>
                    <th className="px-5 py-3">Manufacturer Serial</th>
                    <th className="px-5 py-3">Warranty Term</th>
                    <th className="px-5 py-3">Product & Warranty IDs</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Merkle Commitment</th>
                    <th className="px-5 py-3">Import Batch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {paginatedItems.map((item) => (
                    <tr key={item._id} className="hover:bg-slate-50/60 transition-colors group">
                      {/* Product Line */}
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-900 leading-tight">{item.productName}</div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          <span className="font-medium text-slate-600">{item.modelNumber}</span>
                          {item.variant && <span className="text-slate-400"> • {item.variant}</span>}
                        </div>
                      </td>

                      {/* Manufacturer Serial */}
                      <td className="px-5 py-3.5">
                        <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/70 px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-800">
                          <span>{item.manufacturerSerialNumber}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(item.manufacturerSerialNumber)}
                            title="Copy serial"
                            className="text-slate-400 hover:text-slate-700 transition"
                          >
                            {copiedSerial === item.manufacturerSerialNumber ? (
                              <Check size={12} className="text-emerald-600" />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Warranty Terms */}
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 border border-blue-100">
                          {item.warrantyDurationMonths}M
                        </span>
                        <span className="block mt-0.5 text-[10px] text-slate-400">
                          {item.warrantyStartRule === "purchase_date" ? "From purchase" : "From activation"}
                        </span>
                      </td>

                      {/* IDs */}
                      <td className="px-5 py-3.5 font-mono text-[11px] leading-tight">
                        <div className="text-slate-700 truncate max-w-[150px]">{item.productId}</div>
                        <div className="mt-0.5 text-slate-400 truncate max-w-[150px]">{item.warrantyId}</div>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3.5">
                        {item.status === "unclaimed" && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-100">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            In-Stock
                          </span>
                        )}
                        {item.status === "registered" && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 border border-indigo-100">
                            <CheckCircle2 size={12} />
                            Registered
                          </span>
                        )}
                        {item.status === "voided" && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 border border-slate-200">
                            <Ban size={12} />
                            Voided
                          </span>
                        )}
                      </td>

                      {/* Merkle Commitment & Proof */}
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col gap-1.5 items-start">
                          {item.blockchainAnchored ? (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                                <ShieldCheck size={11} className="text-emerald-600" />
                                On-Chain Anchored
                              </span>
                              {item.blockchainTxHash && (
                                <a
                                  href={`https://sepolia.etherscan.io/tx/${item.blockchainTxHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Verify on Sepolia Etherscan"
                                  className="text-slate-400 hover:text-blue-600 transition"
                                >
                                  <ExternalLink size={11} />
                                </a>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 border border-slate-200">
                                <Clock size={11} className="text-slate-500" />
                                Off-Chain
                              </span>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => setInspectingItem(item)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition"
                          >
                            <Binary size={12} className="text-blue-500" />
                            <span>Inspect Proof</span>
                          </button>
                        </div>
                      </td>

                      {/* Batch & Date */}
                      <td className="px-5 py-3.5 text-[11px] text-slate-500 font-mono">
                        <div className="truncate max-w-[140px] text-slate-700">{item.importBatchId}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "—"}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls (25 products per page) */}
            {items.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-xs text-slate-500">
                <div className="font-medium">
                  Showing <span className="font-bold text-slate-900">{Math.min((currentPage - 1) * PAGE_SIZE + 1, items.length)}</span> to{" "}
                  <span className="font-bold text-slate-900">{Math.min(currentPage * PAGE_SIZE, items.length)}</span> of{" "}
                  <span className="font-bold text-slate-900">{items.length}</span> physical units
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                      disabled={currentPage === 1}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-2xs"
                    >
                      <ChevronLeft size={13} />
                      <span>Prev</span>
                    </button>

                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter((page) => {
                          return (
                            page === 1 ||
                            page === totalPages ||
                            Math.abs(page - currentPage) <= 1
                          );
                        })
                        .map((page, idx, arr) => {
                          const prev = arr[idx - 1];
                          const showEllipsis = prev && page - prev > 1;
                          return (
                            <span key={page} className="flex items-center">
                              {showEllipsis && <span className="px-1 text-slate-400 font-bold">…</span>}
                              <button
                                type="button"
                                onClick={() => setCurrentPage(page)}
                                className={`h-7 w-7 rounded-lg text-xs font-bold transition ${
                                  currentPage === page
                                    ? "bg-blue-600 text-white shadow-xs"
                                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                }`}
                              >
                                {page}
                              </button>
                            </span>
                          );
                        })}
                    </div>

                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-2xs"
                    >
                      <span>Next</span>
                      <ChevronRight size={13} />
                    </button>
                  </div>
                )}
              </div>
            )}
            </>
          )}
        </div>

        {/* =========================================================================
            THE "BLUE BALL" FLOATING ACTION BUTTON (FAB) & POP-UP TRIGGER
        ========================================================================= */}
        <div
          className="fixed bottom-8 right-8 z-40 flex items-center gap-3"
          onMouseEnter={() => setIsFabHovered(true)}
          onMouseLeave={() => setIsFabHovered(false)}
        >
          {/* Animated Hover Pill Label */}
          <div
            className={`transition-all duration-200 pointer-events-none origin-right ${
              isFabHovered
                ? "opacity-100 translate-x-0 scale-100"
                : "opacity-0 translate-x-2 scale-95"
            }`}
          >
            <div className="rounded-full bg-slate-900/90 text-white px-3.5 py-1.5 text-xs font-bold tracking-wide shadow-lg backdrop-blur-md whitespace-nowrap flex items-center gap-1.5">
              <UploadCloud size={14} className="text-blue-400" />
              <span>Import Inventory CSV</span>
            </div>
          </div>

          {/* The Blue Ball Button */}
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            aria-label="Import Inventory CSV"
            title="Import Inventory CSV"
            className="group relative flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-[0_10px_25px_-5px_rgba(37,99,235,0.5)] transition-all duration-300 hover:scale-110 hover:bg-blue-700 hover:shadow-[0_15px_30px_-5px_rgba(37,99,235,0.6)] active:scale-95 focus:outline-none focus:ring-4 focus:ring-blue-300"
          >
            {/* Subtle Pulse Halo */}
            <span className="absolute -inset-1 rounded-full bg-blue-400/20 opacity-0 group-hover:opacity-100 group-hover:animate-ping" />
            <UploadCloud size={24} strokeWidth={2.2} className="relative z-10 transition-transform duration-200 group-hover:-translate-y-0.5" />
          </button>
        </div>

        {/* =========================================================================
            POP-UP MODAL: BULK CSV IMPORT
        ========================================================================= */}
        {isModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/60 backdrop-blur-xs overflow-hidden"
            onClick={resetModal}
          >
            <div
              className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Sticky Header with Close Button */}
              <div className="flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4 shrink-0 z-10">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
                    <UploadCloud size={18} />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-base font-black text-slate-900 tracking-tight truncate">Bulk Inventory CSV Import</h2>
                    <p className="text-xs text-slate-500 truncate">
                      Batch-register manufacturer serial numbers onto the ledger.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={resetModal}
                  title="Close (Esc)"
                  aria-label="Close modal"
                  className="ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition shadow-2xs"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Scrollable Content Body */}
              <div className="flex-1 overflow-y-auto px-6 py-5">

              {/* PHASE 1: Upload */}
              {modalPhase === "upload" && (
                <div className="mt-5 space-y-4">
                  {/* Dropzone */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center hover:border-blue-500 hover:bg-blue-50/20 transition group"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 group-hover:bg-blue-100 group-hover:text-blue-600 transition">
                      <FileSpreadsheet size={24} />
                    </div>
                    <h3 className="mt-2.5 text-xs font-bold text-slate-900">Select or drop your .CSV file</h3>
                    <p className="mt-0.5 text-[11px] text-slate-400">Strictly standard CSV format (one unit per row)</p>
                  </div>

                  {/* Template download helper pill */}
                  <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs border border-slate-100">
                    <span className="text-slate-600 font-medium">Need the official schema format?</span>
                    <button
                      type="button"
                      onClick={handleDownloadTemplate}
                      className="inline-flex items-center gap-1 font-bold text-blue-600 hover:text-blue-800"
                    >
                      <Download size={13} /> Download Template
                    </button>
                  </div>

                  {/* Optional Metadata */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Purchase Order # (Optional)
                      </label>
                      <input
                        type="text"
                        value={batchMetadata.purchaseOrderNumber}
                        onChange={(e) => setBatchMetadata({ ...batchMetadata, purchaseOrderNumber: e.target.value })}
                        placeholder="e.g. PO-APL-2026-01"
                        className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Shipment Lot Ref (Optional)
                      </label>
                      <input
                        type="text"
                        value={batchMetadata.shipmentReference}
                        onChange={(e) => setBatchMetadata({ ...batchMetadata, shipmentReference: e.target.value })}
                        placeholder="e.g. LOT-IN-401"
                        className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* PHASE 2: Validation Preview */}
              {modalPhase === "preview" && (
                <div className="mt-5 space-y-4">
                  {validating ? (
                    <div className="py-12 text-center text-slate-500">
                      <LoaderCircle size={28} className="animate-spin text-blue-600 mx-auto" />
                      <p className="mt-2 text-xs font-bold text-slate-800">Validating physical units against database…</p>
                    </div>
                  ) : validationResult && !validationResult.isValid ? (
                    /* Error State */
                    <div className="space-y-3">
                      <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-red-900 flex items-start gap-2.5">
                        <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-xs font-extrabold">Batch Import Blocked ({validationResult.errorCount} Issues Found)</div>
                          <p className="text-[11px] text-red-700 mt-0.5">
                            Fix the rows identified below in your CSV. No partial batches are committed.
                          </p>
                        </div>
                      </div>

                      <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 text-xs">
                        {validationResult.errors.map((err, i) => (
                          <div key={i} className="p-2.5 bg-white">
                            <span className="rounded bg-red-100 px-1.5 py-0.2 text-[10px] font-bold text-red-800">
                              Row {err.rowNumber}
                            </span>
                            <span className="ml-2 font-mono text-[11px] text-slate-600">Serial: {err.serial}</span>
                            <ul className="mt-1 list-disc pl-5 text-[11px] text-red-600">
                              {err.reasons.map((r, rIdx) => (
                                <li key={rIdx}>{r}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-end pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setModalPhase("upload");
                            setValidationResult(null);
                          }}
                          className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                        >
                          Cancel & Re-upload
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Valid State */
                    <div className="space-y-3">
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-2.5 text-emerald-900">
                        <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                        <div>
                          <span className="text-xs font-extrabold">Validation Passed!</span>
                          <span className="text-xs text-emerald-700 ml-1.5">
                            All {validationResult?.totalRows} units verified with zero duplicate serials.
                          </span>
                        </div>
                      </div>

                      <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 text-xs">
                        <table className="w-full text-left">
                          <thead className="bg-slate-50 sticky top-0 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-100">
                            <tr>
                              <th className="px-3 py-1.5">Row</th>
                              <th className="px-3 py-1.5">Product</th>
                              <th className="px-3 py-1.5">Model</th>
                              <th className="px-3 py-1.5">Serial</th>
                              <th className="px-3 py-1.5">Term</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-700">
                            {validationResult?.rows?.slice(0, 30).map((r) => (
                              <tr key={r.rowNumber} className="hover:bg-slate-50">
                                <td className="px-3 py-1.5 font-mono text-slate-400">{r.rowNumber}</td>
                                <td className="px-3 py-1.5 font-semibold text-slate-900">{r.data.productName}</td>
                                <td className="px-3 py-1.5 text-slate-500">{r.data.modelNumber}</td>
                                <td className="px-3 py-1.5 font-mono font-bold text-slate-800">{r.data.manufacturerSerialNumber}</td>
                                <td className="px-3 py-1.5 text-slate-600">{r.data.warrantyDurationMonths}M</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Anchor Error Banner if transaction was rejected or failed */}
                      {anchorError && (
                        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2">
                          <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <span className="font-bold">Transaction Failed: </span>
                            <span>{anchorError}</span>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => {
                            setModalPhase("upload");
                            setValidationResult(null);
                            setAnchorError("");
                          }}
                          disabled={anchoring}
                          className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
                        >
                          Back
                        </button>

                        <button
                          type="button"
                          onClick={handleAnchorAndCommitBatch}
                          disabled={anchoring || !validationResult?.isValid}
                          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 active:scale-98 transition disabled:opacity-50"
                        >
                          {anchoring ? (
                            <>
                              <LoaderCircle size={14} className="animate-spin" />
                              <span>Signing on MetaMask & Anchoring…</span>
                            </>
                          ) : (
                            <>
                              <ShieldCheck size={14} />
                              <span>Anchor to Blockchain & Commit {validationResult?.totalRows} Units</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* PHASE 3: Merkle Root Generated & Successfully Anchored */}
              {modalPhase === "success" && (
                <div className="py-2 space-y-4 animate-in fade-in zoom-in-95 duration-200">
                  {/* Single Clean Success Banner (Customer Theme) */}
                  <div className="flex items-start gap-3.5 rounded-2xl bg-emerald-50/90 border border-emerald-200/90 p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
                      <CheckCircle2 size={22} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-emerald-950">
                          Batch Anchored & Registered On-Chain!
                        </h3>
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                          {commitResult?.insertedCount} Units
                        </span>
                      </div>
                      <p className="text-xs text-emerald-700 mt-1 leading-relaxed">
                        Confirmed on Ethereum Sepolia testnet. Physical serial numbers are secured with a cryptographic Merkle root.
                      </p>
                    </div>
                  </div>

                  {/* Cryptographic Merkle Root Commitment Card (Customer UI Matching Light Theme) */}
                  <div className="rounded-2xl border border-slate-200/90 bg-slate-50/70 p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                          <Lock size={14} />
                        </span>
                        <div>
                          <div className="text-xs font-bold text-slate-900 tracking-wide uppercase">Batch Merkle Root</div>
                          <div className="text-[10px] text-slate-500">Cryptographic Commitment (32 Bytes)</div>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-100">
                        <Sparkles size={11} /> 1 Single Tx Commitment
                      </span>
                    </div>

                    {/* Merkle Root Box */}
                    <div>
                      <label className="text-[10px] font-bold tracking-wider uppercase text-slate-500">
                        Merkle Root Hash (Keccak256)
                      </label>
                      <div className="mt-1 flex items-center justify-between rounded-xl bg-white px-3.5 py-2.5 font-mono text-xs text-slate-900 border border-slate-200 shadow-2xs">
                        <span className="truncate select-all pr-2 font-semibold text-blue-700">
                          {commitResult?.merkleRoot || "0x000..."}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(commitResult?.merkleRoot)}
                          className="shrink-0 text-slate-400 hover:text-slate-700 transition"
                          title="Copy Merkle root"
                        >
                          {copiedSerial === commitResult?.merkleRoot ? (
                            <Check size={14} className="text-emerald-600" />
                          ) : (
                            <Copy size={14} />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
                      <div className="rounded-xl bg-white p-3 border border-slate-200/80 shadow-2xs">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Batch ID</span>
                        <span className="font-mono text-[11px] text-slate-800 font-semibold truncate block mt-0.5">
                          {commitResult?.importBatchId}
                        </span>
                      </div>
                      <div className="rounded-xl bg-white p-3 border border-slate-200/80 shadow-2xs">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Target Smart Contract</span>
                        <span className="font-mono text-[11px] text-slate-800 font-semibold truncate block mt-0.5">
                          Sepolia Testnet
                        </span>
                      </div>
                    </div>

                    {/* Explainer / Security Assurance */}
                    <div className="rounded-xl bg-blue-50/70 border border-blue-100/90 p-3 text-[11px] text-blue-900/90 leading-relaxed">
                      <span className="font-bold text-blue-950">How it works: </span>
                      Writing this single 32-byte root to Ethereum secures all {commitResult?.insertedCount} serials in ~45,000 gas (&lt;$0.02). Serial numbers remain private and are verified with a 400-byte proof upon customer claim.
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-2 flex items-center justify-between gap-3">
                    {anchorTxHash ? (
                      <a
                        href={`https://sepolia.etherscan.io/tx/${anchorTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition"
                      >
                        <span>View on Sepolia Etherscan</span>
                        <ExternalLink size={13} />
                      </a>
                    ) : (
                      <div />
                    )}
                    <button
                      type="button"
                      onClick={resetModal}
                      className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            CRYPTOGRAPHIC PROOF INSPECTOR MODAL
        ========================================================================= */}
        {inspectingItem && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/60 backdrop-blur-xs overflow-hidden"
            onClick={() => setInspectingItem(null)}
          >
            <div
              className="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Sticky Header with Always-Visible Close Button */}
              <div className="flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4 shrink-0 z-10">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                    <Hash size={18} />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-base font-black text-slate-900 tracking-tight truncate">
                      Cryptographic Merkle Proof
                    </h2>
                    <p className="text-xs text-slate-500 truncate">
                      Unit Serial: {inspectingItem.manufacturerSerialNumber}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setInspectingItem(null)}
                  title="Close (Esc)"
                  aria-label="Close modal"
                  className="ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition shadow-2xs"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Scrollable Content Body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                {/* Unit Identity */}
                <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Product</span>
                    <span className="font-semibold text-slate-900 block truncate">{inspectingItem.productName}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Serial Number</span>
                    <span className="font-mono font-bold text-slate-900 block truncate">{inspectingItem.manufacturerSerialNumber}</span>
                  </div>
                </div>

                {/* Leaf Hash */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Unit Leaf Hash (32 Bytes)
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      keccak256(productId + warrantyId + serial + duration)
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5 font-mono text-xs text-blue-700 font-semibold border border-slate-200">
                    <span className="truncate pr-2">{inspectingItem.merkleLeaf || "Computed on batch import"}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(inspectingItem.merkleLeaf)}
                      className="text-slate-400 hover:text-slate-700 transition"
                      title="Copy leaf hash"
                    >
                      {copiedSerial === inspectingItem.merkleLeaf ? (
                        <Check size={13} className="text-emerald-600" />
                      ) : (
                        <Copy size={13} />
                      )}
                    </button>
                  </div>
                </div>

                {/* Sibling Proof Path */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Sibling Proof Path ({inspectingItem.merkleProof?.length || 0} Nodes)
                    </span>
                    <span className="text-[10px] font-semibold text-blue-600">
                      O(log N) Verification
                    </span>
                  </div>

                  {inspectingItem.merkleProof && inspectingItem.merkleProof.length > 0 ? (
                    <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 text-xs font-mono">
                      {inspectingItem.merkleProof.map((proofHash, pIdx) => (
                        <div key={pIdx} className="flex items-center justify-between p-2 bg-white hover:bg-slate-50">
                          <span className="text-[10px] font-bold text-slate-400 mr-2">Level {pIdx}</span>
                          <span className="truncate text-slate-700 text-[11px] flex-1">{proofHash}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(proofHash)}
                            className="ml-2 text-slate-400 hover:text-slate-600 transition"
                          >
                            <Copy size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-500">
                      Single-item batch (Root equals Leaf hash).
                    </div>
                  )}
                </div>

                {/* Blockchain Status Indicator */}
                <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-xs text-blue-900 space-y-1">
                  <div className="flex items-center gap-2 font-bold">
                    <ShieldCheck size={15} className="text-blue-600" />
                    <span>
                      {inspectingItem.blockchainAnchored
                        ? "Anchored on Ethereum Sepolia"
                        : "Batch Commitment Pending Blockchain Anchor"}
                    </span>
                  </div>
                  <p className="text-[11px] text-blue-700">
                    {inspectingItem.blockchainAnchored && inspectingItem.blockchainTxHash ? (
                      <a
                        href={`https://sepolia.etherscan.io/tx/${inspectingItem.blockchainTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold underline hover:text-blue-900 inline-flex items-center gap-1"
                      >
                        View Sepolia Transaction <ExternalLink size={11} />
                      </a>
                    ) : (
                      "When anchored, this unit can be verified by customers via the smart contract using verifyProof(proof, root, leaf)."
                    )}
                  </p>
                </div>

                {/* Modal Close Button */}
                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setInspectingItem(null)}
                    className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </WorkspaceLayout>
  );
}
