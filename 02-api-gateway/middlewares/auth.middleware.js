'use strict';

/**
 * auth.middleware.js - API Gateway (P11-1)
 *
 * احراز هویت Stateless برای توکن‌های Access امضاشده با RS256.
 * - هدر:  Authorization: Bearer <token>
 * - وریفای: jsonwebtoken با الگوریتم RS256 و کلید عمومی (public.pem)
 * - موفقیت → افزودن `req.user = { userId, role, ... }` و فراخوانی next()
 * - انقضا/نا‌معتبری/فقدان توکن → 401 Unauthorized
 */

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const PUBLIC_KEY_PATH = path.join(__dirname, '..', 'infrastructure', 'keys', 'public.pem');

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

/**
 * میدلور Express برای وریفای Access Token.
 */
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
    });
    const userId = payload && (payload.sub || payload.userId);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: token missing subject' });
    }
    // اطلاعات کاربر به درخواست افزوده می‌شود
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

module.exports = { authenticate, extractBearerToken, PUBLIC_KEY_PATH, getPublicKey };