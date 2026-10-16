/**
 * Canonicalize supported Iranian/Afghan mobile numbers and international E.164
 * numbers. Store and rate-limit valid numbers in one representation so format
 * variations cannot split OTP records or bypass per-phone throttling.
 */
function normalizePhoneNumber(value) {
  if (typeof value !== 'string') return null;

  const compact = value
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[\s().-]/g, '');

  if (!compact || !/^\+?\d+$/.test(compact)) return null;

  // International E.164 input, or international dialing prefix "00".
  if (/^\+[1-9]\d{7,14}$/.test(compact)) return compact;
  if (/^00[1-9]\d{7,14}$/.test(compact)) return `+${compact.slice(2)}`;

  // Iran: +98 9xxxxxxxxx, 0098..., 98..., 09xxxxxxxxx or 9xxxxxxxxx.
  if (/^09\d{9}$/.test(compact)) return `+98${compact.slice(1)}`;
  if (/^9\d{9}$/.test(compact)) return `+98${compact}`;
  if (/^989\d{9}$/.test(compact)) return `+${compact}`;
  if (/^00989\d{9}$/.test(compact)) return `+${compact.slice(2)}`;

  // Afghanistan: +93 7xxxxxxxx, 0093..., 93..., 07xxxxxxxx or 7xxxxxxxx.
  if (/^07\d{8}$/.test(compact)) return `+93${compact.slice(1)}`;
  if (/^7\d{8}$/.test(compact)) return `+93${compact}`;
  if (/^937\d{8}$/.test(compact)) return `+${compact}`;
  if (/^00937\d{8}$/.test(compact)) return `+${compact.slice(2)}`;

  return null;
}

module.exports = { normalizePhoneNumber };
