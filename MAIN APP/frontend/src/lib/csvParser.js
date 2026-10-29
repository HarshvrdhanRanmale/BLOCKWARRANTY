/**
 * Robust RFC 4180 compliant CSV line tokenizer and parser.
 * Handles escaped quotes, commas inside quotes, CRLF/LF line breaks, and column normalization.
 */

export function parseCsvText(text) {
  if (!text || typeof text !== "string") return [];

  const lines = [];
  let currentRow = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        currentRow.push(currentField.trim());
        currentField = "";
      } else if (char === "\r") {
        if (nextChar === "\n") i++; // handle CRLF
        currentRow.push(currentField.trim());
        if (currentRow.some((val) => val.length > 0)) lines.push(currentRow);
        currentRow = [];
        currentField = "";
      } else if (char === "\n") {
        currentRow.push(currentField.trim());
        if (currentRow.some((val) => val.length > 0)) lines.push(currentRow);
        currentRow = [];
        currentField = "";
      } else {
        currentField += char;
      }
    }
  }

  // Push last field & row if pending
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((val) => val.length > 0)) lines.push(currentRow);
  }

  if (lines.length === 0) return [];

  // Header mapping (case-insensitive & trimmed)
  const headerKeys = lines[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));

  const canonicalFieldMap = {
    productid: "productId",
    warrantyid: "warrantyId",
    productname: "productName",
    modelnumber: "modelNumber",
    manufacturerserialnumber: "manufacturerSerialNumber",
    serialnumber: "manufacturerSerialNumber",
    serial: "manufacturerSerialNumber",
    warrantydurationmonths: "warrantyDurationMonths",
    warrantyduration: "warrantyDurationMonths",
    warrantystartrule: "warrantyStartRule",
    startrule: "warrantyStartRule",
    brand: "brand",
    variant: "variant",
    purchaseordernumber: "purchaseOrderNumber",
    ponumber: "purchaseOrderNumber",
    shipmentreference: "shipmentReference",
    shipmentref: "shipmentReference",
    receiveddate: "receivedDate",
    purchasedate: "purchaseDate",
  };

  const rows = [];
  for (let r = 1; r < lines.length; r++) {
    const rowValues = lines[r];
    // Skip empty trailing lines
    if (rowValues.length === 0 || (rowValues.length === 1 && !rowValues[0])) continue;

    const rowObj = {};
    headerKeys.forEach((key, colIndex) => {
      const canonicalKey = canonicalFieldMap[key] || key;
      rowObj[canonicalKey] = rowValues[colIndex] !== undefined ? rowValues[colIndex] : "";
    });

    rows.push(rowObj);
  }

  return rows;
}
