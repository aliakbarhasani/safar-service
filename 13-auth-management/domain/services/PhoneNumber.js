/**
 * Normalize supported Iranian/Afghan mobile numbers to the national form used
 * by the existing Safar Service client and user records. Other international
 * numbers retain E.164 form. One representation keeps OTP lookup and per-phone
 * rate limiting consistent without silently migrating existing user records.
 */
function normalizePhoneNumber(value) {
  if (typeof value !== 'string') return null;

  const compact = value
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[\s().-]/g, '');

  if (!compact || !/^\+?\d+$/.test(compact)) return null;

  // Iran: canonical national form 09xxxxxxxxx.
  if (/^\+989\d{9}$/.test(compact)) return `0${compact.slice(3)}`;
  if (/^00989\d{9}$/.test(compact)) return `0${compact.slice(4)}`;
  if (/^989\d{9}$/.test(compact)) return `0${compact.slice(2)}`;
  if (/^09\d{9}$/.test(compact)) return compact;
  if (/^9\d{9}$/.test(compact)) return `0${compact}`;

  // Afghanistan: canonical national form 07xxxxxxxx.
  if (/^\+937\d{8}$/.test(compact)) return `0${compact.slice(3)}`;
  if (/^00937\d{8}$/.test(compact)) return `0${compact.slice(4)}`;
  if (/^937\d{8}$/.test(compact)) return `0${compact.slice(2)}`;
  if (/^07\d{8}$/.test(compact)) return compact;
  if (/^7\d{8}$/.test(compact)) return `0${compact}`;

  // Other countries must provide an explicit international prefix.
  if (/^\+[1-9]\d{7,14}$/.test(compact)) return compact;
  if (/^00[1-9]\d{7,14}$/.test(compact)) return `+${compact.slice(2)}`;

  return null;
}

module.exports = { normalizePhoneNumber };
