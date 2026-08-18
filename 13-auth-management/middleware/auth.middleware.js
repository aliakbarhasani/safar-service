const JwtService = require('../domain/services/JwtService');

class AuthMiddleware {
  constructor({ jwtService = null } = {}) {
    this.jwtService = jwtService || new JwtService();
  }

  middleware() {
    return async (req, res, next) => {
      try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Missing or invalid authorization header' });
        }

        const token = authHeader.split(' ')[1];
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