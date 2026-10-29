import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Building2,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Wallet,
  Globe,
  Mail,
  FileText,
  BadgeCheck,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { useWallet } from "../../blockchain/useWallet";
import { CHAIN_NAME } from "../../blockchain/contractConfig";

export default function SupplierRegister() {
  const navigate = useNavigate();
  const {
    user,
    walletAddress,
    isConnected,
    isCorrectNetwork,
    connectWallet,
    switchToSepolia,
    signer,
    registerSupplierProfile,
  } = useWallet();

  const [step, setStep] = useState(1);

  const [formData, setFormData] = useState({
    companyName: user?.supplierProfile?.companyName || user?.name || "",
    brandName: user?.supplierProfile?.brandName || "",
    taxId: user?.supplierProfile?.taxId || "",
    businessEmail: user?.supplierProfile?.businessEmail || user?.email || "",
    website: user?.supplierProfile?.website || "",
    phone: user?.supplierProfile?.phone || "",
    registeredAddress: user?.supplierProfile?.registeredAddress || "",
    authorizedBrands: user?.supplierProfile?.authorizedBrands?.join(", ") || "",
  });

  const [loading, setLoading] = useState(false);
  const [connectingWallet, setConnectingWallet] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const isAlreadySupplier = user?.role === "supplier";

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleStep1Submit = (e) => {
    e.preventDefault();
    setError("");

    if (
      !formData.companyName.trim() ||
      !formData.brandName.trim() ||
      !formData.taxId.trim() ||
      !formData.businessEmail.trim()
    ) {
      setError("Please fill in all required fields (Company Name, Brand Name, Tax ID, and Corporate Email).");
      return;
    }

    setStep(2);
  };

  const handleConnectWallet = async () => {
    setError("");
    setConnectingWallet(true);
    try {
      await connectWallet();
    } catch (err) {
      setError(err.message || "Failed to connect MetaMask wallet.");
    } finally {
      setConnectingWallet(false);
    }
  };

  const handleCompleteRegistration = async () => {
    setError("");
    setLoading(true);

    try {
      if (!isCorrectNetwork) {
        await switchToSepolia();
      }

      const payload = {
        companyName: formData.companyName.trim(),
        brandName: formData.brandName.trim(),
        taxId: formData.taxId.trim(),
        businessEmail: formData.businessEmail.trim(),
        website: formData.website.trim(),
        phone: formData.phone.trim(),
        registeredAddress: formData.registeredAddress.trim(),
        authorizedBrands: formData.authorizedBrands
          .split(",")
          .map((b) => b.trim())
          .filter(Boolean),
      };

      await registerSupplierProfile(payload, signer);
      setSuccess(true);
      setTimeout(() => {
        navigate("/supplier/dashboard");
      }, 1200);
    } catch (err) {
      setError(err.message || "Failed to complete supplier registration.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      {/* Standalone Header without Sidebar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 px-4 sm:px-8 py-3.5 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
              <ShieldCheck size={20} />
            </span>
            <div>
              <span className="block text-sm font-black tracking-tight text-slate-900 leading-tight">
                BlockWarranty
              </span>
              <span className="block text-[9px] font-bold uppercase tracking-wider text-blue-600 leading-tight">
                Supplier Portal
              </span>
            </div>
          </Link>

          <Link
            to="/products"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-50 transition"
          >
            <ArrowLeft size={14} /> Back to Dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10 space-y-8">

        {/* Header */}
        <div className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50/70 via-white to-slate-50 p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-500/20">
                <Building2 size={28} />
              </span>
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-blue-700">
                  Manufacturer & Brand Partner Portal
                </span>
                <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                  {isAlreadySupplier ? "Verified Supplier Profile" : "Register as Authorized Supplier"}
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  Establish root-of-trust identity to issue genuine warranties, validate customer invoices, and approve claims.
                </p>
              </div>
            </div>

            {/* Stepper Indicator */}
            {!isAlreadySupplier && (
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold shadow-sm">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    step === 1 ? "bg-blue-600 text-white" : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {step > 1 ? "✓" : "1"}
                </span>
                <span className={step === 1 ? "text-blue-900 font-extrabold" : "text-slate-500"}>
                  Profile
                </span>
                <span className="text-slate-300">→</span>
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    step === 2 ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  2
                </span>
                <span className={step === 2 ? "text-blue-900 font-extrabold" : "text-slate-500"}>
                  Wallet Binding
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Already Registered State */}
        {isAlreadySupplier && !success ? (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-6 sm:p-8 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md">
              <CheckCircle2 size={30} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-emerald-950">You are already a Verified Supplier</h2>
              <p className="text-sm text-emerald-800 mt-1">
                Company: <span className="font-semibold">{user?.supplierProfile?.companyName || user?.name}</span> | Brand:{" "}
                <span className="font-semibold">{user?.supplierProfile?.brandName}</span>
              </p>
            </div>
            <div className="pt-2">
              <Link
                to="/supplier/dashboard"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-800"
              >
                Go to Supplier Dashboard <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        ) : (
          <div>
            {/* Error Message */}
            {error && (
              <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <AlertCircle size={20} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div className="mb-6 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                <CheckCircle2 size={20} className="shrink-0" />
                <span>Supplier registration successful! Redirecting to Command Center…</span>
              </div>
            )}

            {/* STEP 1: Corporate Profile (No wallet required yet!) */}
            {step === 1 && (
              <form onSubmit={handleStep1Submit} className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 sm:p-10 shadow-sm">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Step 1: Corporate & Brand Details</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Enter your organization’s legal registration details. No crypto wallet connection is required for this step.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  {/* Company Legal Name */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      Legal Company Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="companyName"
                      value={formData.companyName}
                      onChange={handleChange}
                      placeholder="e.g. Apple Demo Supplies Private Limited"
                      required
                      className="mt-2 block w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                    />
                  </div>

                  {/* Trade / Brand Name */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      Brand / Trade Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="brandName"
                      value={formData.brandName}
                      onChange={handleChange}
                      placeholder="e.g. Apple"
                      required
                      className="mt-2 block w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                    />
                  </div>

                  {/* GSTIN / Tax ID */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      GSTIN / Tax ID / EIN <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="taxId"
                      value={formData.taxId}
                      onChange={handleChange}
                      placeholder="e.g. 27AABCU9603R1ZM"
                      required
                      className="mt-2 block w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 uppercase"
                    />
                    <p className="mt-1 text-[11px] text-slate-400">Official business registration or tax identification number.</p>
                  </div>

                  {/* Corporate Email */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      Corporate Business Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      name="businessEmail"
                      value={formData.businessEmail}
                      onChange={handleChange}
                      placeholder="supplier-demo@example.com"
                      required
                      className="mt-2 block w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                    />
                  </div>

                  {/* Official Website */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      Official Website
                    </label>
                    <input
                      type="url"
                      name="website"
                      value={formData.website}
                      onChange={handleChange}
                      placeholder="https://www.apple.com"
                      className="mt-2 block w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                    />
                  </div>

                  {/* Contact Phone */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      Business Phone
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="+91 90000 12345"
                      className="mt-2 block w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                    />
                  </div>

                  {/* Registered Business Address */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      Registered Business Address
                    </label>
                    <textarea
                      name="registeredAddress"
                      value={formData.registeredAddress}
                      onChange={handleChange}
                      rows={2}
                      placeholder="1 Infinite Loop, Cupertino, CA, or Registered Corporate HQ Address"
                      className="mt-2 block w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                    />
                  </div>

                  {/* Authorized Brands */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      Authorized Brands (Comma separated)
                    </label>
                    <input
                      type="text"
                      name="authorizedBrands"
                      value={formData.authorizedBrands}
                      onChange={handleChange}
                      placeholder="e.g. Apple, Beats, iPhone, iPad"
                      className="mt-2 block w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                    />
                    <p className="mt-1 text-[11px] text-slate-400">Brands your account is authorized to seed inventory and validate warranties for.</p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  <Link
                    to="/products"
                    className="rounded-xl px-5 py-3 text-sm font-bold text-slate-600 hover:bg-slate-100 transition"
                  >
                    Cancel
                  </Link>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-700 transition"
                  >
                    Continue to Wallet Binding <ArrowRight size={16} />
                  </button>
                </div>
              </form>
            )}

            {/* STEP 2: Wallet Binding & Signature */}
            {step === 2 && (
              <div className="space-y-6">
                {/* Summary Card of Profile */}
                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">{formData.companyName}</h3>
                      <p className="text-xs text-slate-500">
                        Brand: <span className="font-semibold text-slate-700">{formData.brandName}</span> | Tax ID:{" "}
                        <span className="font-mono font-semibold text-slate-700">{formData.taxId}</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Edit Details
                    </button>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-4 text-xs text-slate-600 sm:grid-cols-4">
                    <div>
                      <span className="block text-slate-400">Email:</span>
                      <span className="font-medium text-slate-800 truncate block">{formData.businessEmail}</span>
                    </div>
                    <div>
                      <span className="block text-slate-400">Phone:</span>
                      <span className="font-medium text-slate-800">{formData.phone || "—"}</span>
                    </div>
                    <div>
                      <span className="block text-slate-400">Website:</span>
                      <span className="font-medium text-slate-800 truncate block">{formData.website || "—"}</span>
                    </div>
                    <div>
                      <span className="block text-slate-400">Authorized:</span>
                      <span className="font-medium text-slate-800 truncate block">{formData.authorizedBrands || formData.brandName}</span>
                    </div>
                  </div>
                </div>

                {/* Signer Wallet Binding Container */}
                <div className="rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-50/50 via-white to-slate-50 p-6 sm:p-10 shadow-sm space-y-6">
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-0.5 text-xs font-bold text-blue-800">
                      <Wallet size={14} /> Step 2: Bind Root-of-Trust Signer
                    </span>
                    <h2 className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">
                      Bind Your Authorized Signer Wallet
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      BlockWarranty utilizes this Ethereum wallet as the manufacturer root-of-trust. Serial pre-seeding and warranty lifecycle events will be cryptographically signed by this address.
                    </p>
                  </div>

                  {/* Wallet Connection Status */}
                  {!isConnected ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center space-y-4">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                        <Wallet size={28} />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-slate-900">Connect MetaMask Wallet</h3>
                        <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
                          Connect the wallet you want designated as the authoritative manufacturer signer for{" "}
                          <span className="font-semibold text-slate-700">{formData.brandName}</span>.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleConnectWallet}
                        disabled={connectingWallet}
                        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-md hover:bg-blue-700 transition"
                      >
                        {connectingWallet ? (
                          <>
                            <LoaderCircle size={18} className="animate-spin" /> Connecting MetaMask…
                          </>
                        ) : (
                          <>
                            <Wallet size={18} /> Connect MetaMask
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                            <BadgeCheck size={22} />
                          </span>
                          <div>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                              Signer Wallet Connected
                            </span>
                            <p className="font-mono text-sm font-bold text-slate-900 break-all">{walletAddress}</p>
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                              Network: {CHAIN_NAME}
                            </span>
                          </div>
                        </div>

                        {!isCorrectNetwork && (
                          <button
                            type="button"
                            onClick={switchToSepolia}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100"
                          >
                            <RefreshCw size={14} /> Switch to Sepolia
                          </button>
                        )}
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-600 space-y-2">
                        <div className="flex items-center gap-2 font-bold text-slate-900">
                          <ShieldCheck size={16} className="text-blue-600" /> Gas-Free Cryptographic Verification
                        </div>
                        <p>
                          Clicking below will prompt a one-time signature request in MetaMask. This signature does not cost any gas and securely binds this wallet to{" "}
                          <span className="font-semibold text-slate-800">{formData.companyName}</span>.
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <button
                          type="button"
                          onClick={() => setStep(1)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 transition"
                        >
                          <ArrowLeft size={16} /> Back to Details
                        </button>

                        <button
                          type="button"
                          onClick={handleCompleteRegistration}
                          disabled={loading}
                          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50 transition"
                        >
                          {loading ? (
                            <>
                              <LoaderCircle size={18} className="animate-spin" /> Authorizing in MetaMask…
                            </>
                          ) : (
                            <>
                              Authorize & Complete Registration <ArrowRight size={16} />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
