/**
 * useInvoiceExtraction — handles reading an invoice image file, sending it to
 * the Groq-backed extract endpoint, and populating form fields with results.
 *
 * @param {Function} onExtracted  Called with { extractedData, productName, brand } on success
 * @param {Function} onError      Called with an error message string on failure
 */

import { useState } from "react";
import { API_BASE_URL } from "../lib/api";
import { ALLOWED_INVOICE_TYPES, MAX_INVOICE_SIZE_BYTES } from "../constants";

const INVOICE_FIELDS = [
  "productName", "brand", "category", "purchaseDate", "warrantyPeriod", "warrantyUnit",
  "invoiceNumber", "currency", "unitPrice", "quantity", "lineItemAmount", "subtotal",
  "discount", "shippingCost", "tax", "total", "amountPaid", "balanceDue", "description",
];

/** Read a file as base64 string (strip the data URL prefix). */
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("The invoice image could not be read."));
    reader.readAsDataURL(file);
  });
}

/** Read a file as a data URL (for preview). */
export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read file for preview."));
    reader.readAsDataURL(file);
  });
}

export function useInvoiceExtraction() {
  const [extracting, setExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState("");

  /**
   * Validates the file, calls the backend, returns the extracted data object.
   * Throws on validation failure so callers can show inline errors.
   */
  async function extractInvoice(file) {
    // Client-side validation
    if (!ALLOWED_INVOICE_TYPES.includes(file.type)) {
      throw new Error("Please upload a JPG, PNG, or WEBP invoice image.");
    }
    if (file.size > MAX_INVOICE_SIZE_BYTES) {
      throw new Error("Invoice image must be 10 MB or smaller.");
    }
    if (file.type === "application/pdf") {
      throw new Error("PDF invoices are not supported. Please upload a JPG or PNG image of the invoice.");
    }

    setExtracting(true);
    setExtractionError("");

    try {
      const fileData = await readFileAsBase64(file);

      const response = await fetch(`${API_BASE_URL}/api/extract-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileType: file.type, fileData }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const msg = data.message || "Invoice extraction failed.";
        // Rate limit detection
        if (response.status === 429 || /rate.?limit/i.test(msg)) {
          throw new Error("Invoice extraction is rate-limited. Please retry in a moment or enter details manually.");
        }
        throw new Error(msg);
      }

      const extracted = data.extractedData || {};

      // Return only known fields to prevent mass-assignment of unexpected values
      const safe = Object.fromEntries(INVOICE_FIELDS.map((f) => [f, extracted[f] ?? ""]));
      return safe;
    } catch (err) {
      const msg = err.message || "Failed to process the invoice.";
      setExtractionError(msg);
      throw err;
    } finally {
      setExtracting(false);
    }
  }

  function clearError() {
    setExtractionError("");
  }

  return { extracting, extractionError, extractInvoice, clearError };
}
