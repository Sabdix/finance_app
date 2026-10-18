import type { Report, ReportCategory } from './types'

export interface CategoryMeta {
  name: string
  groupName: string
}

export interface ActivityRow {
  categoryId: number | null
  month: string
  /** Signo del movimiento: negativo = gasto, positivo = reembolso. */
  amount: number
}

/**
 * Arma el reporte de gasto por categoría y mes. Las categorías sin gasto en el periodo no aparecen;
 * el resto se ordena de mayor a menor gasto total.
 */
export function buildReport(
  months: string[],
  categories: Map<number, CategoryMeta>,
  activity: ActivityRow[],
  income: { month: string; amount: number }[]
): Report {
  const index = new Map(months.map((m, i) => [m, i]))
  const rows = new Map<number | null, ReportCategory>()

  for (const a of activity) {
    const i = index.get(a.month)
    if (i === undefined) continue
    let row = rows.get(a.categoryId)
    if (!row) {
      const meta = a.categoryId === null ? undefined : categories.get(a.categoryId)
      row = {
        categoryId: a.categoryId,
        name: meta?.name ?? 'Sin categoría',
        groupName: meta?.groupName ?? 'Sin categoría',
        amounts: months.map(() => 0),
        total: 0
      }
      rows.set(a.categoryId, row)
    }
    row.amounts[i] -= a.amount
    row.total -= a.amount
  }

  const incomeByMonth = months.map(() => 0)
  for (const r of income) {
    const i = index.get(r.month)
    if (i !== undefined) incomeByMonth[i] += r.amount
  }

  const list = [...rows.values()].filter((r) => r.amounts.some((v) => v !== 0)).sort((a, b) => b.total - a.total)
  return {
    months,
    income: incomeByMonth,
    spending: months.map((_, i) => list.reduce((s, r) => s + r.amounts[i], 0)),
    categories: list
  }
}
