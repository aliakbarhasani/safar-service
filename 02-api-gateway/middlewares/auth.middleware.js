'use strict';

/**
 * auth.middleware.js - API Gateway (P11-1)
 *
 * احراز هویت Stateless برای توکن‌های Access امضاشده با RS256.
 * SECURITY: وریفای با همان کلید عمومی مرکزی انجام می‌شود که IAM برای صدور
 * توکن استفاده می‌کند؛ بنابراین Gateway و سایر سرویس‌ها یک Trust Boundary دارند.
 * - هدر: Authorization: Bearer <token>
 * - issuer: safar-iam
 * - type: access
 */

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const PUBLIC_KEY_PATH = path.resolve(__dirname, '../../00-infrastructure/keys/jwt_public.pem');
const IAM_ISSUER = 'safar-iam';

// کش‌کردن کلید عمومی در حافظه (جلوگیری از خواندن فایل در هر درخواست)
let publicKey = null;
function getPublicKey() {
  if (!publicKey) {
    publicKey = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
  }
  return publicKey;
}

function extractBearerToken(header) {
  if (!header || typeof header !== 'string') return null;
  const parts = header.split(' ');
  if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
    return parts[1].trim();
  }
  return null;
}

/** میدلور Express برای وریفای Access Token صادرشده توسط IAM. */
function authenticate(req, res, next) {
  const token = extractBearerToken(req.headers && req.headers.authorization);
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized: missing bearer token' });
  }

  let publicKeyPem;
  try {
    publicKeyPem = getPublicKey();
  } catch (_) {
    return res.status(500).json({ success: false, error: 'Authentication misconfigured: public key unavailable' });
  }

  try {
    const payload = jwt.verify(token, publicKeyPem, {
      algorithms: ['RS256'],
      issuer: IAM_ISSUER,
    });

    if (!payload || payload.type !== 'access') {
      return res.status(401).json({ success: false, error: 'Unauthorized: invalid access token type' });
    }

    const userId = payload.sub || payload.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: token missing subject' });
    }

    req.user = {
      userId,
      id: userId,
      role: payload.role || 'user',
      scope: payload.scope,
    };
    return next();
  } catch (err) {
    const msg = (err && err.name === 'TokenExpiredError')
      ? 'Unauthorized: token expired'
      : 'Unauthorized: invalid token';
    return res.status(401).json({ success: false, error: msg });
  }
}

module.exports = {
  authenticate,
  extractBearerToken,
  PUBLIC_KEY_PATH,
  getPublicKey,
  IAM_ISSUER,
};
