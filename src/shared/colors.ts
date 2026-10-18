/** Paleta para distinguir cuentas. Tonos medios que se leen bien sobre fondo claro. */
export const ACCOUNT_COLORS = [
  { hex: '#4f46e5', name: 'Índigo' },
  { hex: '#2563eb', name: 'Azul' },
  { hex: '#0284c7', name: 'Celeste' },
  { hex: '#0d9488', name: 'Turquesa' },
  { hex: '#059669', name: 'Verde' },
  { hex: '#65a30d', name: 'Lima' },
  { hex: '#d97706', name: 'Ámbar' },
  { hex: '#ea580c', name: 'Naranja' },
  { hex: '#dc2626', name: 'Rojo' },
  { hex: '#db2777', name: 'Rosa' },
  { hex: '#9333ea', name: 'Morado' },
  { hex: '#475569', name: 'Gris' }
] as const

export const isHexColor = (s: unknown): s is string => typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s)

/** El primer color de la paleta que ninguna cuenta usa; si todos se usan, el menos repetido. */
export function nextAccountColor(used: string[]): string {
  const count = (hex: string): number => used.filter((u) => u.toLowerCase() === hex).length
  return ACCOUNT_COLORS.reduce((best, c) => (count(c.hex) < count(best.hex) ? c : best)).hex
}
