/**
 * Razorpay Test Mode checkout loader (frontend).
 *
 * This module ONLY loads the public Razorpay Checkout widget and opens it with
 * the publishable key_id returned by the backend. The KEY_SECRET never reaches
 * the browser — payment authority is always confirmed server-side.
 *
 * After the widget returns a successful response, the caller must POST the
 * {razorpay_order_id, razorpay_payment_id, razorpay_signature} fields to the
 * backend verify endpoint. The browser is never trusted to declare success.
 */

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let loadPromise = null;

/** Lazily load the Razorpay Checkout script once. Resolves to true on success. */
export function loadRazorpayCheckout() {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve) => {
    const existing = document.querySelector(`script[src="${CHECKOUT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      existing.addEventListener("error", () => resolve(false));
      if (window.Razorpay) resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
  return loadPromise;
}

/**
 * Open the Razorpay Checkout widget for a UPI test payment.
 *
 * @param {object} options
 * @param {string} options.keyId        Publishable test key_id from the backend.
 * @param {string} options.orderId      Razorpay order id.
 * @param {number} options.amountMinor  Amount in the smallest currency unit (paise).
 * @param {string} options.currency     Three-letter currency code (e.g. "INR").
 * @param {string} options.name         Merchant display name.
 * @param {string} options.description  Checkout description.
 * @param {string} [options.upiVpa]     Optional pre-filled UPI id.
 * @param {(response: {razorpay_payment_id:string, razorpay_order_id:string, razorpay_signature:string}) => void} options.handler
 * @param {(error: unknown) => void} [options.onDismiss]
 * @returns {Promise<boolean>} true if the widget opened.
 */
export async function openRazorpayCheckout({
  keyId,
  orderId,
  amountMinor,
  currency,
  name,
  description,
  upiVpa,
  handler,
  onDismiss,
}) {
  const ready = await loadRazorpayCheckout();
  if (!ready || !window.Razorpay) {
    throw new Error("Razorpay Checkout could not be loaded. Check your internet connection and try again.");
  }

  const rzp = new window.Razorpay({
    key: keyId,
    order_id: orderId,
    amount: amountMinor,
    currency,
    name,
    description,
    // Prefer UPI as the primary method for Test Mode.
    method: { upi: true, ...(upiVpa ? { upi: { vpa: upiVpa } } : {}) },
    prefill: upiVpa ? { method: "upi", vpa: upiVpa } : undefined,
    handler,
    modal: {
      ondismiss: () => {
        if (typeof onDismiss === "function") onDismiss(new Error("Payment was cancelled before completion."));
      },
    },
    theme: { color: "#2563EB" },
  });
  rzp.open();
  return true;
}
