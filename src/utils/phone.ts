// Normalises any Tajikistan mobile number format to a canonical 9-digit string.
// Accepts: 987654321 | +992987654321 | 992987654321 | 0987654321
// Returns null if the result is not exactly 9 digits.
export function normaliseMobileNumber(raw: string): string | null {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('992')) digits = digits.slice(3)
  if (digits.startsWith('0')) digits = digits.slice(1)
  return digits.length === 9 ? digits : null
}
