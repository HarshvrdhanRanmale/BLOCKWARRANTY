/** Shared application-wide constants. Import from here, not inline. */

export const PRODUCT_CATEGORIES = [
  "Laptop",
  "Smartphone",
  "Headphones",
  "Smartwatch",
  "Tablet",
  "Electronics",
  "Software",
  "Other",
];

export const WARRANTY_UNITS = ["Days", "Months", "Years"];

export const ALLOWED_INVOICE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

export const MAX_INVOICE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const BLOCKCHAIN_STATUS = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  FAILED: "failed",
};

export const PRODUCT_STATUS = {
  ACTIVE: "Active",
  EXPIRED: "Expired",
  TRANSFERRED: "Transferred",
};

export const STORAGE_KEYS = {
  TOKEN: "blockwarranty_token",
  USER: "blockwarranty_user",
};
