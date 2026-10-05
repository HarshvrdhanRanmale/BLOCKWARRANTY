const crypto = require('crypto');
const { ethers } = require('ethers');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');
const Challenge = require('../models/Challenge');

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
  async verifySignature(walletAddress, message, signature, profile = {}) {
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

    // Build profile fields from Google OAuth userInfo (if provided)
    const providedName = profile?.name ? String(profile.name).trim() : '';
    const providedEmail = profile?.email ? String(profile.email).trim().toLowerCase() : '';

    const now = new Date();

    // Upsert user — create on first login, update on subsequent logins
    let user = await User.findOne({ walletAddress: key });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = new User({
        walletAddress: key,
        walletAddressChecksum: normalized,
        name: providedName,
        email: providedEmail,
        role: 'user',
        profileComplete: Boolean(providedName),
        lastLoginAt: now
      });
    } else {
      // Only fill in missing data — never overwrite user-set values
      if (!user.name && providedName) {
        user.name = providedName;
        user.profileComplete = true;
      }
      if (!user.email && providedEmail) {
        user.email = providedEmail;
      }
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

  /**
   * Update profile fields (name, email) for an existing or new user.
   */
  async updateProfile(walletAddress, { name, email }) {
    const normalized = this.normalizeAddress(walletAddress);
    const key = normalized.toLowerCase();
    const now = new Date();

    const update = { lastLoginAt: now };
    if (typeof name !== 'undefined') update.name = String(name).trim();
    if (typeof email !== 'undefined') update.email = String(email).trim().toLowerCase();
    // profileComplete = true if name ends up non-empty
    update.profileComplete = Boolean(
      (update.name !== undefined ? update.name : '') ||
        (await User.findOne({ walletAddress: key }).then(u => u?.name || ''))
    );

    const user = await User.findOneAndUpdate(
      { walletAddress: key },
      {
        $set: update,
        $setOnInsert: {
          walletAddress: key,
          walletAddressChecksum: normalized,
          role: 'user'
        }
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

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
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLoginAt: user.lastLoginAt
    };
  }
}

module.exports = new AuthService();
