const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const AppError = require('../utils/AppError');
const RefreshToken = require('../models/RefreshToken');
const User = require('../models/User');
const { USER_STATUS } = require('../constants');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function signAccessToken(user) {
  return jwt.sign({ role: user.role }, config.jwt.accessSecret, {
    subject: String(user._id),
    expiresIn: config.jwt.accessExpiresIn,
  });
}

function verifyAccessToken(token) {
  try {
    return jwt.verify(token, config.jwt.accessSecret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw AppError.unauthorized('Access token has expired', 'TOKEN_EXPIRED');
    }
    throw AppError.unauthorized('Invalid access token', 'TOKEN_INVALID');
  }
}

// Only the hash is stored, so a leaked database cannot be used to hijack sessions.
async function issueRefreshToken(user, context = {}) {
  const raw = crypto.randomBytes(48).toString('base64url');
  await RefreshToken.create({
    user: user._id,
    tokenHash: sha256(raw),
    expiresAt: new Date(Date.now() + config.refreshToken.ttlMs),
    ip: context.ip,
    userAgent: context.userAgent,
  });
  return raw;
}

async function revokeAllForUser(userId) {
  await RefreshToken.updateMany({ user: userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

/**
 * Single-use refresh tokens. Presenting an already used token means it was probably stolen,
 * so every session of that user is revoked.
 */
async function rotateRefreshToken(raw, context = {}) {
  const hash = sha256(raw);

  const claimed = await RefreshToken.findOneAndUpdate(
    { tokenHash: hash, revokedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { revokedAt: new Date() } },
    { new: true }
  );

  if (!claimed) {
    const known = await RefreshToken.findOne({ tokenHash: hash });
    if (known && known.revokedAt) {
      await revokeAllForUser(known.user);
      throw AppError.unauthorized('Refresh token reuse detected, please log in again', 'TOKEN_REUSED');
    }
    throw AppError.unauthorized('Invalid or expired refresh token', 'TOKEN_INVALID');
  }

  const user = await User.findById(claimed.user);
  if (!user || user.status !== USER_STATUS.ACTIVE) {
    throw AppError.unauthorized('Account is not available', 'TOKEN_INVALID');
  }

  const next = await issueRefreshToken(user, context);
  claimed.replacedByHash = sha256(next);
  await claimed.save();

  return { user, refreshToken: next };
}

async function revokeRefreshToken(raw) {
  await RefreshToken.updateOne({ tokenHash: sha256(raw), revokedAt: null }, { $set: { revokedAt: new Date() } });
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllForUser,
};
