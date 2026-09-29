const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    productId: {
      type: String,
      unique: true,
      trim: true,
    },

    productName: {
      type: String,
      required: true,
      trim: true,
    },

    brand: {
      type: String,
      default: "",
      trim: true,
    },

    category: {
      type: String,
      default: "Other",
      trim: true,
    },

    purchaseDate: {
      type: Date,
      default: null,
    },

    warrantyPeriod: {
      type: Number,
      default: null,
    },

    warrantyUnit: {
      type: String,
      enum: ["Days", "Months", "Years"],
      default: "Years",
    },

    invoiceNumber: {
      type: String,
      default: "",
      trim: true,
    },

    invoiceFile: {
      type: String,
      default: "",
    },

    currency: {
      type: String,
      default: "",
      trim: true,
    },

    unitPrice: {
      type: Number,
      default: null,
    },

    quantity: {
      type: Number,
      default: null,
    },

    lineItemAmount: {
      type: Number,
      default: null,
    },

    subtotal: {
      type: Number,
      default: null,
    },

    discount: {
      type: Number,
      default: null,
    },

    shippingCost: {
      type: Number,
      default: null,
    },

    tax: {
      type: Number,
      default: null,
    },

    total: {
      type: Number,
      default: null,
    },

    amountPaid: {
      type: Number,
      default: null,
    },

    balanceDue: {
      type: Number,
      default: null,
    },

    description: {
      type: String,
      default: "",
    },

    productImage: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      default: "Active",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Product", productSchema);