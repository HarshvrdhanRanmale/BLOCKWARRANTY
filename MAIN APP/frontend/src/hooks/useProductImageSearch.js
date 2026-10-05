/**
 * useProductImageSearch — fetches product images from the backend image-search
 * endpoint based on product name and brand.
 *
 * Supports returning the best image first, plus a list of alternative candidate
 * marketplace images so the user can select their favorite photo.
 */

import { useRef, useState } from "react";
import { API_BASE_URL } from "../lib/api";

export function useProductImageSearch() {
  const [imageSearchStatus, setImageSearchStatus] = useState("");
  const [imageAttribution, setImageAttribution] = useState(null);
  const [availableImages, setAvailableImages] = useState([]);
  const [isClosestMatch, setIsClosestMatch] = useState(false);
  const requestId = useRef(0);

  /**
   * Searches for product images. Silently ignores stale (cancelled) responses.
   *
   * @param {string} productName
   * @param {string} [brand]
   * @param {string} [category]
   * @returns {Promise<{ image: object | null, images: object[] }>}
   */
  async function searchImage(productName, brand = "", category = "") {
    if (!productName?.trim()) {
      setImageSearchStatus("Add a product name to search for an image.");
      setAvailableImages([]);
      return { image: null, images: [] };
    }

    const id = ++requestId.current;
    setImageSearchStatus("Searching marketplaces for product photos…");
    setImageAttribution(null);

    try {
      const query = new URLSearchParams({
        productName: productName.trim(),
        brand: brand.trim(),
        category: category.trim(),
      });
      const response = await fetch(`${API_BASE_URL}/api/product-image?${query}`);
      const data = await response.json().catch(() => ({}));

      // Stale response — a newer search has already started
      if (id !== requestId.current) return { image: null, images: [] };

      if (!response.ok) {
        setImageSearchStatus(data.message || "Image search is temporarily unavailable.");
        setAvailableImages([]);
        return { image: null, images: [] };
      }

      const img = data.image;
      const imagesList = Array.isArray(data.images) && data.images.length > 0
        ? data.images
        : (img ? [img] : []);

      if (!img?.imageUrl && imagesList.length === 0) {
        setImageSearchStatus("No matching product image found. You can upload one instead.");
        setAvailableImages([]);
        setIsClosestMatch(false);
        return { image: null, images: [] };
      }

      const best = img || imagesList[0];
      setAvailableImages(imagesList);
      setIsClosestMatch(Boolean(data.isClosestMatch));
      setImageAttribution(best);

      if (data.isClosestMatch) {
        setImageSearchStatus("Found closest matching marketplace photos. Select the best one or upload your own.");
      } else {
        setImageSearchStatus(
          imagesList.length > 1
            ? `Found ${imagesList.length} matching photos from marketplaces.`
            : "Found matching product photo."
        );
      }

      return { image: best, images: imagesList };
    } catch {
      if (id !== requestId.current) return { image: null, images: [] };
      setImageSearchStatus("Image search failed. You can upload a product image manually.");
      setAvailableImages([]);
      return { image: null, images: [] };
    }
  }

  /** Call this when the invoice is cleared or a new one is uploaded. */
  function cancelPendingSearch() {
    requestId.current++;
    setImageSearchStatus("");
    setImageAttribution(null);
    setAvailableImages([]);
    setIsClosestMatch(false);
  }

  return {
    imageSearchStatus,
    imageAttribution,
    availableImages,
    isClosestMatch,
    searchImage,
    cancelPendingSearch,
    setAvailableImages,
    setImageAttribution,
  };
}
