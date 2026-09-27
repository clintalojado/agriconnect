// Philippine mobile numbers arrive as 09171234567, 9171234567, +639171234567
// or 639171234567 (with or without spaces/dashes). Normalize to the
// 63XXXXXXXXXX digit form so the same number always matches.
function normalizePhone(phone) {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = `63${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("9")) digits = `63${digits}`;
  return digits || null;
}

function samePhone(a, b) {
  const na = normalizePhone(a);
  return na != null && na === normalizePhone(b);
}

module.exports = { normalizePhone, samePhone };
