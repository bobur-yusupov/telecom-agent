export function normaliseMobileNumber(raw: string): string | null {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('992')) digits = digits.slice(3)
  if (digits.startsWith('0')) digits = digits.slice(1)
  return digits.length === 9 ? digits : null
}
