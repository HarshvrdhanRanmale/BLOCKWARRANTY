const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    walletAddress: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    // Checksum-cased version for display
    walletAddressChecksum: {
      type: String,
      trim: true
    },
    name: {
      type: String,
      default: '',
      trim: true
    },
    email: {
      type: String,
      default: '',
      trim: true,
      lowercase: true
    },
    googleSub: {
      type: String,
      default: undefined,
      unique: true,
      sparse: true
    },
    role: {
      type: String,
      enum: ['user', 'admin', 'supplier'],
      default: 'user'
    },
    supplierProfile: {
      companyName: { type: String, default: '', trim: true },
      brandName: { type: String, default: '', trim: true },
      taxId: { type: String, default: '', trim: true },
      businessEmail: { type: String, default: '', lowercase: true, trim: true },
      website: { type: String, default: '', trim: true },
      phone: { type: String, default: '', trim: true },
      registeredAddress: { type: String, default: '', trim: true },
      authorizedBrands: [{ type: String, trim: true }],
      isVerified: { type: Boolean, default: true }
    },
    profileComplete: {
      type: Boolean,
      default: false
    },
    lastLoginAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true // Adds createdAt and updatedAt automatically
  }
);

// Virtual for serialized public representation
userSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

userSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('User', userSchema);
