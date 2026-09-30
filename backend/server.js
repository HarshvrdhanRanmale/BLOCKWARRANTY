const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const multer = require("multer");
const Tesseract = require("tesseract.js");

const Product = require("./models/product");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "15mb" }));

const extractTextWithTesseract = async (file) => {
  const result = await Tesseract.recognize(file.buffer, file.mimetype.includes("pdf") ? "eng" : "eng", {
    logger: (m) => {
      if (m.progress && m.progress > 0.1) {
        console.log(`Tesseract progress: ${m.progress.toFixed(2)}`);
      }
    },
  });

  return result.data?.text || "";
};

const extractInvoiceText = async (file) => {
  const text = await extractTextWithTesseract(file);
  if (!text || !text.trim()) {
    throw new Error("Local OCR returned no readable text.");
  }
  return text.trim();
};

const extractStructuredDataWithGroq = async (prompt, ocrText) => {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "qwen/qwen3.8-27b",
      messages: [
        {
          role: "user",
          content: `${prompt}\n\nOCR TEXT:\n${ocrText}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
  });

  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body?.error?.message || "Groq invoice extraction failed.");
    error.statusCode = response.status;
    throw error;
  }

  return body.choices?.[0]?.message?.content || "{}";
};

const searchProductImage = async (productName, brand) => {
  const productWords = productName.split(/\s+/).filter(Boolean);
  const relevantTerms = [...brand.split(/\s+/), ...productWords]
    .map((term) => term.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter((term) => term.length >= 2);
  const searches = [
    [brand, productName].filter(Boolean).join(" "),
    productName,
    ...productWords.slice(0, -1).map((_, index) =>
      productWords.slice(0, productWords.length - index - 1).join(" ")
    ),
  ].filter((search, index, all) => search && all.indexOf(search) === index);

  let match;
  for (const search of searches) {
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    url.search = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: search,
      gsrnamespace: "6",
      gsrlimit: "8",
      prop: "imageinfo",
      iiprop: "url|extmetadata",
      iiurlwidth: "900",
      format: "json",
    }).toString();

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "BlockWarranty/1.0 (product image lookup)",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`Wikimedia image search failed with status ${response.status}.`);
    }

    const result = await response.json();
    const pages = Object.values(result?.query?.pages || {});
    const matches = pages
      .map((page) => ({ page, image: page.imageinfo?.[0] }))
      .map((candidate) => {
        const title = candidate.page.title.toLowerCase().replace(/[^a-z0-9]/g, "");
        const relevance = relevantTerms.filter((term) => title.includes(term)).length;
        return { ...candidate, relevance };
      })
      .filter(({ image, relevance }) => image?.thumburl && relevance > 0)
      .sort((left, right) => right.relevance - left.relevance);
    match = matches[0];
    if (match) break;
  }

  if (!match) return null;

  const { page, image } = match;
  const metadata = image.extmetadata || {};
  return {
    imageUrl: image.thumburl,
    title: page.title.replace(/^File:/, ""),
    sourceUrl: image.descriptionurl,
    license: metadata.LicenseShortName?.value || "",
    artist: metadata.Artist?.value?.replace(/<[^>]*>/g, "").trim() || "",
  };
};

const normalizeStringValue = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
};

const parseStructuredAnnotation = (annotation) => {
  if (!annotation) {
    return {};
  }

  if (typeof annotation === "object") {
    return annotation;
  }

  const text = normalizeStringValue(annotation);
  const sanitized = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  if (!sanitized) {
    return {};
  }

  try {
    const parsed = JSON.parse(sanitized);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("Failed to parse Groq invoice annotation:", error.message);
    return {};
  }
};

const normalizeInvoiceExtraction = (source = {}) => {
  const data = source && typeof source === "object" ? source : {};

  const normalizeValue = (key, fallback = "") => {
    if (!(key in data)) return fallback;
    const value = data[key];
    return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
  };

  return {
    productName: normalizeValue("productName", ""),
    brand: normalizeValue("brand", ""),
    category: normalizeValue("category", "Other"),
    purchaseDate: normalizeValue("purchaseDate", ""),
    warrantyPeriod: normalizeValue("warrantyPeriod", ""),
    warrantyUnit: ["Years", "Months", "Days"].includes(normalizeValue("warrantyUnit", "Years")) ? normalizeValue("warrantyUnit", "Years") : "Years",
    invoiceNumber: normalizeValue("invoiceNumber", ""),
    currency: normalizeValue("currency", ""),
    unitPrice: normalizeValue("unitPrice", ""),
    quantity: normalizeValue("quantity", ""),
    lineItemAmount: normalizeValue("lineItemAmount", ""),
    subtotal: normalizeValue("subtotal", ""),
    discount: normalizeValue("discount", ""),
    shippingCost: normalizeValue("shippingCost", ""),
    tax: normalizeValue("tax", ""),
    total: normalizeValue("total", ""),
    amountPaid: normalizeValue("amountPaid", ""),
    balanceDue: normalizeValue("balanceDue", ""),
    description: normalizeValue("description", ""),
  };
};

// ======================================================
// MULTER CONFIGURATION
// ======================================================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

// ======================================================
// MONGODB CONNECTION
// ======================================================

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected successfully");
  })
  .catch((error) => {
    console.error(
      "MongoDB connection failed:",
      error.message
    );
  });

// ======================================================
// HOME ROUTE
// ======================================================

app.get("/", (req, res) => {
  res.json({
    message: "BlockWarranty backend is running",
  });
});

// ======================================================
// GROQ INVOICE EXTRACTION
// ======================================================

app.post(
  "/api/extract-invoice",
  upload.single("invoice"),
  async (req, res) => {
    try {
      // --------------------------------------------------
      // CHECK FILE
      // --------------------------------------------------

      if (!req.file) {
        return res.status(400).json({
          message: "No invoice file uploaded",
        });
      }

      // --------------------------------------------------
      // CHECK API KEY
      // --------------------------------------------------

if (!process.env.GROQ_API_KEY) {
  return res.status(500).json({
     message: "Groq API key is not configured.",
  });
}

const file = req.file;

console.log(`Processing invoice with Groq: ${file.originalname}`);

const prompt = `
You are an invoice analysis engine for BlockWarranty.
Extract only facts explicitly visible in the invoice.

Rules:
- Never guess, fabricate, calculate missing values, or assume a warranty.
- If a value is absent, return an empty string.
- Classify the product into exactly one of: Laptop, Smartphone, Headphones, Smartwatch, Tablet, Electronics, Software, Other. Use the product itself and its description to classify; use Other only when its type cannot reasonably be identified.
- For numeric fields, return only the number as a plain string without currency symbols or commas.
- For purchaseDate, return YYYY-MM-DD only if explicitly shown.
- For warrantyPeriod, return only the numeric value without the unit.
- For warrantyUnit, use Years, Months, or Days only when the warranty is explicitly stated.
- In the JSON, do not include extra keys or comments.

Return a JSON object with these keys only:
{
  "productName": "",
  "brand": "",
  "category": "",
  "purchaseDate": "",
  "warrantyPeriod": "",
  "warrantyUnit": "",
  "invoiceNumber": "",
  "currency": "",
  "unitPrice": "",
  "quantity": "",
  "lineItemAmount": "",
  "subtotal": "",
  "discount": "",
  "shippingCost": "",
  "tax": "",
  "total": "",
  "amountPaid": "",
  "balanceDue": "",
  "description": ""
}
`;

const ocrText = await extractInvoiceText(file);
const finalContent = await extractStructuredDataWithGroq(prompt, ocrText);

const parsedContent = parseStructuredAnnotation(finalContent);
const extractedData = normalizeInvoiceExtraction(parsedContent);

if (extractedData.category === "") {
  extractedData.category = "Other";
}

if (!extractedData.warrantyPeriod && extractedData.warrantyUnit) {
  extractedData.warrantyUnit = "";
}

console.log("Groq extraction successful:");
console.log(extractedData);

res.json({
  message: "Invoice processed successfully",
  fileName: file.originalname,
  fileType: file.mimetype,
  extractedData,
      });
    } catch (error) {
      console.error("Groq invoice extraction error:", error);

      const errorDetails = [
        error?.message,
        error?.body,
        error?.cause?.message,
      ]
        .filter(Boolean)
        .join(" ");
      const rateLimited =
        error?.statusCode === 429 ||
        /\b429\b/.test(errorDetails) ||
        /rate.?limit/i.test(errorDetails);
      const statusCode = rateLimited ? 429 : 500;
      const message =
        rateLimited
         ? "Invoice extraction is temporarily unavailable because the Groq API rate limit has been reached. Please try again later or enter the details manually."
         : "Failed to extract invoice data";

      res.status(statusCode).json({
        message,
        error: errorDetails || "Unknown invoice extraction error",
      });
    }
  }
);

app.get("/api/product-image", async (req, res) => {
  const productName = normalizeStringValue(req.query.productName);
  const brand = normalizeStringValue(req.query.brand);
  if (!productName) {
    return res.status(400).json({ message: "Product name is required for image search." });
  }

  try {
    const image = await searchProductImage(productName.slice(0, 160), brand.slice(0, 100));
    return res.json({
      image,
      message: image ? "Found a possible product image." : "No matching image was found.",
    });
  } catch (error) {
    console.error("Product image lookup failed:", error.message);
    return res.status(502).json({
      message: "Product image search is temporarily unavailable. You can upload an image instead.",
    });
  }
});

// ======================================================
// GENERATE PRODUCT ID
// ======================================================

const generateProductId = async () => {
  const count =
    await Product.countDocuments();

  return `BW-${String(
    count + 1
  ).padStart(6, "0")}`;
};

// ======================================================
// REGISTER PRODUCT
// ======================================================

app.post(
  "/api/products",
  async (req, res) => {
    try {
    const payload = { ...req.body };

    const sanitizeOptionalText = (value) => {
      if (value === undefined || value === null) return "";
      if (typeof value === "string") return value.trim();
      return String(value).trim();
    };

    const sanitizeOptionalNumber = (value) => {
      if (value === undefined || value === null || value === "") return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const sanitizedProduct = {
      ...payload,
      productName: sanitizeOptionalText(payload.productName),
      brand: sanitizeOptionalText(payload.brand),
      category: sanitizeOptionalText(payload.category) || "Other",
      purchaseDate: payload.purchaseDate ? new Date(payload.purchaseDate) : null,
      warrantyPeriod: sanitizeOptionalNumber(payload.warrantyPeriod),
      warrantyUnit: ["Years", "Months", "Days"].includes(payload.warrantyUnit) ? payload.warrantyUnit : "Years",
      invoiceNumber: sanitizeOptionalText(payload.invoiceNumber),
      currency: sanitizeOptionalText(payload.currency),
      unitPrice: sanitizeOptionalNumber(payload.unitPrice),
      quantity: sanitizeOptionalNumber(payload.quantity),
      lineItemAmount: sanitizeOptionalNumber(payload.lineItemAmount),
      subtotal: sanitizeOptionalNumber(payload.subtotal),
      discount: sanitizeOptionalNumber(payload.discount),
      shippingCost: sanitizeOptionalNumber(payload.shippingCost),
      tax: sanitizeOptionalNumber(payload.tax),
      total: sanitizeOptionalNumber(payload.total),
      amountPaid: sanitizeOptionalNumber(payload.amountPaid),
      balanceDue: sanitizeOptionalNumber(payload.balanceDue),
      description: sanitizeOptionalText(payload.description),
      productImage: sanitizeOptionalText(payload.productImage),
      productImageSourceUrl: /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/i.test(
        sanitizeOptionalText(payload.productImageSourceUrl)
      )
        ? sanitizeOptionalText(payload.productImageSourceUrl)
        : "",
      productImageLicense: sanitizeOptionalText(payload.productImageLicense),
      productImageArtist: sanitizeOptionalText(payload.productImageArtist),
      invoiceFile: sanitizeOptionalText(payload.invoiceFile),
    };

    const productId = await generateProductId();

    const product = new Product({
      ...sanitizedProduct,
      productId,
    });

    const savedProduct = await product.save();

    res.status(201).json({
      message: "Product registered successfully",
      product: savedProduct,
    });
  } catch (error) {
    console.error("Product registration error:", error);

    res.status(500).json({
      message: "Failed to register product",
      error: error.message,
    });
  }
}
);

// ======================================================
// GET ALL PRODUCTS
// ======================================================

app.get("/api/products/:productId", async (req, res) => {
  try {
    const productIdentifier = normalizeStringValue(req.params.productId);
    const lookup = [{ productId: productIdentifier }];
    if (mongoose.isValidObjectId(productIdentifier)) {
      lookup.push({ _id: productIdentifier });
    }

    const product = await Product.findOne({ $or: lookup });
    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }
    return res.json({ product });
  } catch (error) {
    console.error("Product details retrieval error:", error);
    return res.status(500).json({
      message: "Failed to fetch product details.",
      error: error.message,
    });
  }
});

app.get(
  "/api/products",
  async (req, res) => {
    try {
      const products =
        await Product.find().sort({
          createdAt: -1,
        });

      res.json(products);
    } catch (error) {
      console.error(
        "Fetch products error:",
        error
      );

      res.status(500).json({
        message:
          "Failed to fetch products",

        error: error.message,
      });
    }
  }
);

// ======================================================
// START SERVER
// ======================================================

const PORT =
  process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(
    `Server running on http://localhost:${PORT}`
  );
});