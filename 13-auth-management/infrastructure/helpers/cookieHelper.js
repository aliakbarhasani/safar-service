/**
 * cookieHelper.js
 *
 * Native, lightweight cookie parser (NO cookie-parser dependency).
 * Parses the raw `Cookie` header into a plain key-value object.
 *
 * Usage:
 *   const { parseCookies } = require('./cookieHelper');
 *   const cookies = parseCookies(req.headers.cookie);
 *   const token = cookies['access_token'];
 */

/**
 * Parse a raw Cookie header into an object of key -> value.
 * Handles the common cases:
 *   - name=value pairs separated by '; '
 *   - percent-encoding (decodeURIComponent)
 *   - missing header -> empty object
 *
 * @param {string|undefined} cookieHeader - value of `req.headers.cookie`
 * @returns {Record<string,string>}
 */
function parseCookies(cookieHeader) {
  const result = {};

  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return result;
  }

  cookieHeader.split(';').forEach((pair) => {
    const eqIndex = pair.indexOf('=');
    if (eqIndex === -1) return; // skip flags without '=' (e.g. HttpOnly/Secure)

    const name = pair.slice(0, eqIndex).trim();
    let value = pair.slice(eqIndex + 1).trim();

    if (!name) return; // skip empty names

    // percent-decode value (best-effort; keep raw on failure)
    try {
      value = decodeURIComponent(value);
    } catch {
      /* leave value as-is if it isn't valid percent-encoding */
    }

    result[name] = value;
  });

  return result;
}

module.exports = { parseCookies };
