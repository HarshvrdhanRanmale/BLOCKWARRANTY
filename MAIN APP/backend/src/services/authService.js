const crypto = require('crypto');
const { ethers } = require('ethers');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const config = require('../config/env');
const User = require('../models/User');
const Challenge = require('../models/Challenge');
const googleOAuthClient = new OAuth2Client();

class AuthService {
  /**
   * Validate and normalize EVM address (checksum form)
   */
  normalizeAddress(address) {
    if (!address || typeof address !== 'string') {
      throw new Error('Wallet address is required');
    }
    if (!ethers.isAddress(address)) {
      throw new Error('Invalid EVM wallet address format');
    }
    return ethers.getAddress(address); // EIP-55 checksum address
  }

  /**
   * Generate an authentication challenge nonce for the specified wallet.
   * Stores challenge in MongoDB; old challenge for the same wallet is replaced.
   */
  async generateChallenge(walletAddress) {
    const normalized = this.normalizeAddress(walletAddress);
    const key = normalized.toLowerCase();

    const nonce = crypto.randomBytes(16).toString('hex');
    const now = new Date();
    const expiresAt = new Date(Date.now() + config.CHALLENGE_TTL_MS);

    const message = [
      'Welcome to BlockWarranty!',
      '',
      'Sign this message to securely access your BlockWarranty account.',
      '',
      `Wallet Address: ${normalized}`,
      `Nonce: ${nonce}`,
      `Issued At: ${now.toISOString()}`,
      `Expires At: ${expiresAt.toISOString()}`,
      '',
      'This signature does not cost any gas.'
    ].join('\n');

    // Upsert: replace any existing challenge for this wallet
    await Challenge.findOneAndUpdate(
      { walletAddress: key },
      { walletAddress: key, nonce, message, expiresAt },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    return {
      walletAddress: normalized,
      nonce,
      message,
      expiresAt: expiresAt.getTime()
    };
  }

  /**
   * Verify signature and issue JWT. Fully async — reads/writes MongoDB.
   */
  async verifySignature(walletAddress, message, signature) {
    if (!walletAddress || !message || !signature) {
      throw new Error('walletAddress, message, and signature are required');
    }

    const normalized = this.normalizeAddress(walletAddress);
    const key = normalized.toLowerCase();

    // Fetch challenge from DB
    const challenge = await Challenge.findOne({ walletAddress: key });
    if (!challenge) {
      throw new Error(
        'No active authentication challenge found for this address. Please request a new nonce.'
      );
    }

    if (Date.now() > challenge.expiresAt.getTime()) {
      await Challenge.deleteOne({ walletAddress: key });
      throw new Error('Authentication challenge has expired. Please request a new nonce.');
    }

    // Verify submitted message matches the issued challenge
    if (challenge.message.trim() !== message.trim()) {
      throw new Error('Authentication message does not match the challenge issued.');
    }

    // Cryptographically recover signer address
    let recoveredAddress;
    try {
      recoveredAddress = ethers.verifyMessage(message, signature);
    } catch (err) {
      throw new Error(`Cryptographic signature verification failed: ${err.message}`);
    }

    if (recoveredAddress.toLowerCase() !== key) {
      throw new Error(
        `Signature mismatch: recovered address ${recoveredAddress} does not match expected address ${normalized}`
      );
    }

    // Consume challenge — prevents replay attacks
    await Challenge.deleteOne({ walletAddress: key });

    const now = new Date();

    // Upsert user — create on first login, update on subsequent logins
    let user = await User.findOne({ walletAddress: key });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = new User({
        walletAddress: key,
        walletAddressChecksum: normalized,
        name: '',
        email: '',
        role: 'user',
        profileComplete: false,
        lastLoginAt: now
      });
    } else {
      user.lastLoginAt = now;
    }

    await user.save();

    // Issue JWT
    const token = jwt.sign(
      {
        jti: crypto.randomUUID(),
        walletAddress: normalized,
        sub: normalized,
        role: user.role
      },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN }
    );

    return {
      token,
      user: this._serializeUser(user),
      isNewUser
    };
  }

  /** Verify a Google ID token and link its verified profile to the authenticated wallet. */
  async linkGoogleProfile(walletAddress, credential) {
    if (!config.GOOGLE_CLIENT_ID) {
      throw Object.assign(new Error('Google sign-in is not configured on the backend.'), { status: 503 });
    }
    if (typeof credential !== 'string' || !credential.trim()) {
      throw Object.assign(new Error('A Google credential is required.'), { status: 400 });
    }

    let googleProfile;
    try {
      const ticket = await googleOAuthClient.verifyIdToken({
        idToken: credential,
        audience: config.GOOGLE_CLIENT_ID,
      });
      googleProfile = ticket.getPayload();
    } catch {
      throw Object.assign(new Error('Google could not verify this sign-in. Please try again.'), { status: 401 });
    }

    if (!googleProfile?.sub || !googleProfile.email || googleProfile.email_verified !== true) {
      throw Object.assign(new Error('Use a Google account with a verified email address.'), { status: 401 });
    }

    const normalized = this.normalizeAddress(walletAddress);
    const key = normalized.toLowerCase();
    const user = await User.findOne({ walletAddress: key }).select('+googleSub');
    if (!user) {
      throw Object.assign(new Error('Authenticate this wallet before linking Google.'), { status: 401 });
    }

    if (user.googleSub && user.googleSub !== googleProfile.sub) {
      throw Object.assign(new Error('A different Google account is already linked to this wallet.'), { status: 409 });
    }
    const linkedWallet = await User.findOne({ googleSub: googleProfile.sub }).select('walletAddress');
    if (linkedWallet && linkedWallet.walletAddress !== key) {
      throw Object.assign(new Error('This Google account is already linked to another wallet.'), { status: 409 });
    }

    user.googleSub = googleProfile.sub;
    user.name = String(googleProfile.name || '').trim();
    user.email = String(googleProfile.email).trim().toLowerCase();
    user.profileComplete = Boolean(user.name);
    user.lastLoginAt = new Date();
    await user.save();
    return this._serializeUser(user);
  }

  /**
   * Get user by wallet address (returns a plain default object if not found)
   */
  async getUser(walletAddress) {
    const normalized = this.normalizeAddress(walletAddress);
    const key = normalized.toLowerCase();

    const user = await User.findOne({ walletAddress: key });
    if (user) return this._serializeUser(user);

    return {
      walletAddress: normalized,
      name: '',
      email: '',
      role: 'user',
      profileComplete: false
    };
  }

  /**
   * Verify JWT token (synchronous — no DB call needed)
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, config.JWT_SECRET);
    } catch (err) {
      throw new Error('Invalid or expired authentication token');
    }
  }

  /**
   * Clear all challenges and users — for tests only
   */
  async clearAll() {
    await Promise.all([Challenge.deleteMany({}), User.deleteMany({})]);
  }

  /**
   * Register or upgrade authenticated wallet as a verified supplier
   */
  async registerSupplier(walletAddress, supplierData) {
    const normalized = this.normalizeAddress(walletAddress);
    const key = normalized.toLowerCase();

    let user = await User.findOne({ walletAddress: key });
    if (!user) {
      throw Object.assign(new Error('User not found. Please connect your wallet first.'), { status: 404 });
    }

    const {
      companyName,
      brandName,
      taxId,
      businessEmail,
      website = '',
      phone = '',
      registeredAddress = '',
      authorizedBrands = []
    } = supplierData;

    if (!companyName || !brandName || !taxId || !businessEmail) {
      throw Object.assign(
        new Error('Missing required supplier details: companyName, brandName, taxId, and businessEmail are required.'),
        { status: 400 }
      );
    }

    user.role = 'supplier';
    user.name = companyName.trim();
    user.email = businessEmail.trim().toLowerCase();
    user.profileComplete = true;
    user.supplierProfile = {
      companyName: companyName.trim(),
      brandName: brandName.trim(),
      taxId: taxId.trim(),
      businessEmail: businessEmail.trim().toLowerCase(),
      website: website.trim(),
      phone: phone.trim(),
      registeredAddress: registeredAddress.trim(),
      authorizedBrands: Array.isArray(authorizedBrands)
        ? authorizedBrands.map((b) => String(b).trim()).filter(Boolean)
        : [brandName.trim()],
      isVerified: true
    };

    await user.save();

    // Re-issue JWT with supplier role
    const token = jwt.sign(
      {
        jti: crypto.randomUUID(),
        walletAddress: normalized,
        sub: normalized,
        role: 'supplier'
      },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN }
    );

    return {
      token,
      user: this._serializeUser(user)
    };
  }

  /**
   * Register a supplier directly with wallet signature verification (no prior session required).
   */
  async registerSupplierDirect({ walletAddress, message, signature, supplierData }) {
    if (!walletAddress || !message || !signature) {
      throw Object.assign(
        new Error('Missing required fields: walletAddress, message, and signature must be provided.'),
        { status: 400 }
      );
    }

    const {
      companyName,
      brandName,
      taxId,
      businessEmail,
      website = '',
      phone = '',
      registeredAddress = '',
      authorizedBrands = []
    } = supplierData || {};

    if (!companyName || !brandName || !taxId || !businessEmail) {
      throw Object.assign(
        new Error('Missing required supplier details: companyName, brandName, taxId, and businessEmail are required.'),
        { status: 400 }
      );
    }

    const normalized = this.normalizeAddress(walletAddress);
    const key = normalized.toLowerCase();

    // Fetch challenge from DB
    const challenge = await Challenge.findOne({ walletAddress: key });
    if (!challenge) {
      throw Object.assign(
        new Error('No active authentication challenge found for this address. Please request a new nonce.'),
        { status: 401 }
      );
    }

    if (Date.now() > challenge.expiresAt.getTime()) {
      await Challenge.deleteOne({ walletAddress: key });
      throw Object.assign(
        new Error('Authentication challenge has expired. Please request a new nonce.'),
        { status: 401 }
      );
    }

    // Verify message matches challenge
    if (challenge.message.trim() !== message.trim()) {
      throw Object.assign(
        new Error('Authentication message does not match the challenge issued.'),
        { status: 401 }
      );
    }

    // Cryptographically recover signer address
    let recoveredAddress;
    try {
      recoveredAddress = ethers.verifyMessage(message, signature);
    } catch (err) {
      throw Object.assign(
        new Error(`Cryptographic signature verification failed: ${err.message}`),
        { status: 401 }
      );
    }

    if (recoveredAddress.toLowerCase() !== key) {
      throw Object.assign(
        new Error(`Signature mismatch: recovered address ${recoveredAddress} does not match expected address ${normalized}`),
        { status: 401 }
      );
    }

    // Consume challenge
    await Challenge.deleteOne({ walletAddress: key });

    const now = new Date();

    let user = await User.findOne({ walletAddress: key });
    if (!user) {
      user = new User({
        walletAddress: key,
        walletAddressChecksum: normalized,
        name: companyName.trim(),
        email: businessEmail.trim().toLowerCase(),
        role: 'supplier',
        profileComplete: true,
        lastLoginAt: now
      });
    } else {
      user.role = 'supplier';
      user.name = companyName.trim();
      user.email = businessEmail.trim().toLowerCase();
      user.profileComplete = true;
      user.lastLoginAt = now;
    }

    user.supplierProfile = {
      companyName: companyName.trim(),
      brandName: brandName.trim(),
      taxId: taxId.trim(),
      businessEmail: businessEmail.trim().toLowerCase(),
      website: website.trim(),
      phone: phone.trim(),
      registeredAddress: registeredAddress.trim(),
      authorizedBrands: Array.isArray(authorizedBrands)
        ? authorizedBrands.map((b) => String(b).trim()).filter(Boolean)
        : [brandName.trim()],
      isVerified: true
    };

    await user.save();

    const token = jwt.sign(
      {
        jti: crypto.randomUUID(),
        walletAddress: normalized,
        sub: normalized,
        role: 'supplier'
      },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN }
    );

    return {
      token,
      user: this._serializeUser(user)
    };
  }

  /**
   * Convert Mongoose document to plain JS object for API responses
   */
  _serializeUser(user) {
    const obj = user.toJSON ? user.toJSON() : user;
    return {
      walletAddress: user.walletAddressChecksum || user.walletAddress,
      name: user.name || '',
      email: user.email || '',
      role: user.role,
      profileComplete: user.profileComplete,
      googleLinked: Boolean(user.googleSub),
      supplierProfile: user.supplierProfile || null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLoginAt: user.lastLoginAt
    };
  }
}

module.exports = new AuthService();
