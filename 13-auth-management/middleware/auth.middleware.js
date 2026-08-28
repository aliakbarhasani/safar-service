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

        req.user = {
          userId: decoded.userId,
          phoneNumber: decoded.phoneNumber,
          role: decoded.role,
        };

        next();
      } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
    };
  }
}

module.exports = AuthMiddleware;