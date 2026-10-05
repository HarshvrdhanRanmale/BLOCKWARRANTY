import { useEffect, useRef, useState } from "react";
import { ArrowRightLeft, X, AlertTriangle } from "lucide-react";
import { ethers } from "ethers";

/**
 * TransferOwnershipModal — replaces the native window.prompt() for transferring
 * product ownership. Validates the recipient address before allowing submit.
 *
 * @param {boolean} open           Whether the modal is visible
 * @param {boolean} busy           Whether a transaction is in progress
 * @param {Function} onConfirm     Called with the validated address string
 * @param {Function} onClose       Called when user cancels
 */
export default function TransferOwnershipModal({ open, busy, onConfirm, onClose }) {
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  // Focus the input when modal opens
  useEffect(() => {
    if (open) {
      setAddress("");
      setError("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = address.trim();
    if (!trimmed) {
      setError("Please enter the recipient wallet address.");
      return;
    }
    if (!ethers.isAddress(trimmed)) {
      setError("That doesn't look like a valid Ethereum address. Please double-check it.");
      return;
    }
    setError("");
    onConfirm(trimmed);
  };

  return (
    /* Backdrop */
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="transfer-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <ArrowRightLeft size={18} />
            </span>
            <h2 id="transfer-modal-title" className="text-base font-bold text-slate-900">
              Transfer Ownership
            </h2>
          </div>
          {!busy && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Warning */}
        <div className="mx-6 mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <p className="text-sm leading-5 text-amber-800">
            This action is <strong>permanent and irreversible</strong> on the blockchain. Ensure the recipient
            address is correct before confirming.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label htmlFor="transfer-address" className="block text-sm font-semibold text-slate-700 mb-1.5">
              Recipient Wallet Address
            </label>
            <input
              ref={inputRef}
              id="transfer-address"
              type="text"
              value={address}
              onChange={(e) => { setAddress(e.target.value); setError(""); }}
              placeholder="0x..."
              disabled={busy}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
              autoComplete="off"
              spellCheck={false}
            />
            {error && (
              <p className="mt-2 text-xs font-medium text-red-600">{error}</p>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !address.trim()}
              id="btn-confirm-transfer"
              className="flex-1 rounded-xl bg-blue-700 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-800 transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Transferring…" : "Confirm Transfer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
