/**
 * Shared API utility — centralises base URL, auth headers, and JSON parsing.
 * Import this instead of re-declaring API_BASE_URL in every component.
 */

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

/** Returns the stored JWT or an empty string. */
export function getToken() {
  return typeof window !== "undefined"
    ? (localStorage.getItem("blockwarranty_token") || "")
    : "";
}

/** Standard auth headers for authenticated requests. */
export function authHeaders(token) {
  const tok = token || getToken();
  return {
    "Content-Type": "application/json",
    ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
  };
}

/**
 * Typed fetch helper — parses JSON and throws on non-OK responses.
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<any>}
 */
export async function apiFetch(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";

  let data;
  if (contentType.includes("application/json")) {
    data = await response.json().catch(() => ({}));
  } else {
    const text = await response.text().catch(() => "");
    if (!response.ok) throw new Error(text || `Request failed (${response.status})`);
    return text;
  }

  if (!response.ok) {
    const msg = data?.message || data?.error || `Request failed (${response.status})`;
    const err = new Error(msg);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

/**
 * Authenticated GET helper.
 * @param {string} path  e.g. "/api/products"
 * @param {string} [token]
 */
export function apiGet(path, token) {
  return apiFetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token || getToken()}` },
  });
}

/**
 * Authenticated POST helper.
 * @param {string} path
 * @param {object} body
 * @param {string} [token]
 */
export function apiPost(path, body, token) {
  return apiFetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

/**
 * Authenticated PATCH helper.
 * @param {string} path
 * @param {object} body
 * @param {string} [token]
 */
export function apiPatch(path, body, token) {
  return apiFetch(`${API_BASE_URL}${path}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}
