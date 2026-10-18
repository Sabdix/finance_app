const pad = (n: number): string => String(n).padStart(2, '0')

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function today(): string {
  return toIsoDate(new Date())
}

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number)
  return [y, m, d]
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** Fecha con el día pedido, recortado al último día del mes (p. ej. 31 → 28 en febrero). */
export function dateWithDay(year: number, month: number, day: number): string {
  const y = year + Math.floor((month - 1) / 12)
  const m = (((month - 1) % 12) + 12) % 12 + 1
  return `${y}-${pad(m)}-${pad(Math.min(day, daysInMonth(y, m)))}`
}

/** Suma meses conservando el día original cuando existe en el mes destino. */
export function addMonths(iso: string, months: number, preferredDay?: number): string {
  const [y, m, d] = parts(iso)
  return dateWithDay(y, m + months, preferredDay ?? d)
}

export function formatDate(iso: string): string {
  const [y, m, d] = parts(iso)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}

/**
 * Fecha límite de pago del primer estado de cuenta que incluirá una compra.
 * La compra entra al corte de este mes si se hizo en o antes del día de corte; si no, al siguiente.
 * El pago vence en el primer `dueDay` posterior al corte.
 */
export function firstDueDateFor(purchaseDate: string, statementDay: number, dueDay: number): string {
  const [y, m, d] = parts(purchaseDate)
  const cutMonth = d <= statementDay ? m : m + 1
  const cut = dateWithDay(y, cutMonth, statementDay)
  const sameMonthDue = dateWithDay(y, cutMonth, dueDay)
  return sameMonthDue > cut ? sameMonthDue : dateWithDay(y, cutMonth + 1, dueDay)
}

/** Mes en formato 'YYYY-MM'. */
export function currentMonth(): string {
  return today().slice(0, 7)
}

export function shiftMonth(month: string, delta: number): string {
  return dateWithDay(Number(month.slice(0, 4)), Number(month.slice(5, 7)) + delta, 1).slice(0, 7)
}

/** Todos los meses de `from` a `to`, inclusive. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let m = from; m <= to; m = shiftMonth(m, 1)) out.push(m)
  return out
}

export function formatMonthShort(month: string): string {
  const label = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1)
    .toLocaleDateString('es-MX', { month: 'short' })
    .replace('.', '')
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} ${month.slice(2, 4)}`
}

export function formatMonth(month: string): string {
  const label = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).toLocaleDateString('es-MX', {
    month: 'long',
    year: 'numeric'
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}
