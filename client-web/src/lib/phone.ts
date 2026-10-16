/**
 * Normalize supported Iranian and Afghan mobile numbers to their national form.
 * Keeping the national prefix (09 / 07) preserves compatibility with existing
 * accounts created before international-format input was supported.
 */
export function normalizeMobilePhone(value: string): string {
  const compact = value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[^\d+]/g, "");

  if (compact.startsWith("+98")) return "0" + compact.slice(3);
  if (compact.startsWith("0098")) return "0" + compact.slice(4);
  if (compact.startsWith("98") && compact.length === 12) return "0" + compact.slice(2);

  if (compact.startsWith("+93")) return "0" + compact.slice(3);
  if (compact.startsWith("0093")) return "0" + compact.slice(4);
  if (compact.startsWith("93") && compact.length === 11) return "0" + compact.slice(2);

  if (/^9\d{9}$/.test(compact) || /^7\d{8}$/.test(compact)) {
    return "0" + compact;
  }

  return compact;
}

export function isSupportedMobilePhone(value: string): boolean {
  return /^(?:09\d{9}|07\d{8})$/.test(value);
}
