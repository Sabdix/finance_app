export type CsvValue = string | number | null | undefined

/** Centavos a texto para CSV: punto decimal, sin separador de miles y siempre dos decimales. */
export function centsToCsv(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

function cell(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  // Un texto que empieza con = + - @ se ejecutaría como fórmula al abrirlo en Excel.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text
}

/** CSV con BOM UTF-8 (para que Excel respete los acentos) y saltos de línea CRLF. */
export function toCsv(header: string[], rows: CsvValue[][]): string {
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}
