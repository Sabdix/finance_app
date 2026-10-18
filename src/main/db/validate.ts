export function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export const isIsoDate = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

export const isPositiveCents = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0

export const isDay = (n: unknown): boolean => n === null || (Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 31)
