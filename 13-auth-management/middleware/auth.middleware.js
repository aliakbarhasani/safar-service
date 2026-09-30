const JwtService = require('../domain/services/JwtService');
const { parseCookies } = require('../infrastructure/helpers/cookieHelper');

/**
 * استخراج Hybrid توکن:
 *  ۱) ابتدا هدر Authorization: Bearer <token> (کلاینت موبایل/سرویس‌ها)
 *  ۲) در نبود آن، کوکی access_token (کلاینت وب - HttpOnly)
 */
function extractAccessToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.access_token) {
    return cookies.access_token;
  }
  return null;
}

// بررسی فعال بودن نشست در user_sessions برای jti توکن (Logout revocation).
// true = فعال، false = ابطال شده، null = دیتابیس در دسترس نیست.
let _sessionRepo = null;
async function checkSessionActive(jti) {
  try {
    if (!_sessionRepo) {
      const SessionRepository = require('../infrastructure/repositories/SessionRepository');
      _sessionRepo = new SessionRepository();
    }
    const sessionId = await _sessionRepo.findActiveByAccessTokenJti(jti);
    return sessionId ? true : false;
  } catch {
    // Database/session infrastructure failure must fail closed.
    return null;
  }
}

class AuthMiddleware {
  constructor({ jwtService = null } = {}) {
    this.jwtService = jwtService || new JwtService();
  }

  middleware() {
    return async (req, res, next) => {
      try {
        const token = extractAccessToken(req);
        if (!token) {
          return res.status(401).json({ error: 'Missing or invalid authorization header' });
        }

        const decoded = this.jwtService.verifyAccessToken(token);

        if (decoded.jti) {
          const active = await checkSessionActive(decoded.jti);

          if (active === false) {
            return res.status(401).json({ error: 'Session has been revoked. Please authenticate again.' });
          }

          if (active === null) {
            return res.status(503).json({
              error: 'Authentication service temporarily unavailable. Please try again later.',
            });
          }
        }

        req.user = {
          userId: decoded.userId,
          phoneNumber: decoded.phoneNumber,
          role: decoded.role,
        };

        return next();
      } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
    };
  }
}

module.exports = AuthMiddleware;
