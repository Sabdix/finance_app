export const CURRENCY = 'MXN'
export const LOCALE = 'es-MX'

// Todos los montos se guardan como centavos enteros y siempre se muestran con exactamente dos decimales.
const currency = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})
const plain = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatMoney(cents: number): string {
  return currency.format(cents / 100)
}

/** Centavos a texto editable, sin símbolo: 123456 -> "1,234.56". */
export function centsToInput(cents: number): string {
  return plain.format(cents / 100)
}

/**
 * Convierte texto como "1,234.5" o "$ 99" a centavos. Devuelve null si no es un monto válido
 * o si tiene más de dos decimales.
 */
export function parseMoney(text: string, { allowNegative = false } = {}): number | null {
  const clean = text.replace(/[$\s,]/g, '')
  const match = /^(-?)(\d+)(?:\.(\d{0,2}))?$/.exec(clean)
  if (!match) return null
  const [, sign, whole, frac = ''] = match
  if (sign && !allowNegative) return null
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'))
  return sign ? -cents : cents
}

/** ¿Es un texto válido mientras se escribe? Impide teclear un tercer decimal o caracteres extraños. */
export function isMoneyDraft(text: string, { allowNegative = false } = {}): boolean {
  return (allowNegative ? /^-?\$?\s*[\d,]*(\.\d{0,2})?$/ : /^\$?\s*[\d,]*(\.\d{0,2})?$/).test(text)
}
