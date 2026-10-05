/**
 * useProductImageSearch — fetches a product image from the backend image-search
 * endpoint (DuckDuckGo proxy) based on product name and brand.
 *
 * Uses a request-ID pattern to safely cancel stale responses when the product
 * name changes before the previous search completes.
 */

import { useRef, useState } from "react";
import { API_BASE_URL } from "../lib/api";

export function useProductImageSearch() {
  const [imageSearchStatus, setImageSearchStatus] = useState("");
  const [imageAttribution, setImageAttribution] = useState(null);
  const requestId = useRef(0);

  /**
   * Searches for a product image. Silently ignores stale (cancelled) responses.
   *
   * @param {string} productName
   * @param {string} [brand]
   * @returns {Promise<{ imageUrl: string, sourceUrl: string, title: string } | null>}
   */
  async function searchImage(productName, brand = "") {
    if (!productName?.trim()) {
      setImageSearchStatus("Add a product name to search for an image.");
      return null;
    }

    const id = ++requestId.current;
    setImageSearchStatus("Searching for a product image…");
    setImageAttribution(null);

    try {
      const query = new URLSearchParams({ productName: productName.trim(), brand: brand.trim() });
      const response = await fetch(`${API_BASE_URL}/api/product-image?${query}`);
      const data = await response.json().catch(() => ({}));

      // Stale response — a newer search has already started
      if (id !== requestId.current) return null;

      if (!response.ok) {
        setImageSearchStatus(data.message || "Image search is temporarily unavailable.");
        return null;
      }

      if (!data.image?.imageUrl) {
        setImageSearchStatus("No matching product image found. You can upload one instead.");
        return null;
      }

      const img = data.image;
      setImageAttribution({ title: img.title, sourceUrl: img.sourceUrl, license: img.license, artist: img.artist });
      setImageSearchStatus("");
      return img;
    } catch {
      if (id !== requestId.current) return null;
      setImageSearchStatus("Image search failed. You can upload a product image manually.");
      return null;
    }
  }

  /** Call this when the invoice is cleared or a new one is uploaded. */
  function cancelPendingSearch() {
    requestId.current++;
    setImageSearchStatus("");
    setImageAttribution(null);
  }

  return { imageSearchStatus, imageAttribution, searchImage, cancelPendingSearch };
}
