import { shiftMonth } from './dates'

export interface MonthAmount {
  categoryId: number
  /** 'YYYY-MM' */
  month: string
  amount: number
}

export interface BudgetFigures {
  /** Lo que quedó disponible al cierre del mes anterior (puede ser negativo). */
  carryover: number
  assigned: number
  /** Gastos (negativos) y reembolsos (positivos) del mes. */
  activity: number
  available: number
}

/**
 * Calcula las cifras de cada cajita para `month`, arrastrando el disponible mes a mes desde el primer
 * mes con datos. Un sobregiro también se arrastra: la cajita queda en rojo hasta que la cubras.
 */
export function rollBudget(
  categoryIds: number[],
  allocations: MonthAmount[],
  activity: MonthAmount[],
  month: string
): Map<number, BudgetFigures> {
  const sums = (rows: MonthAmount[]): Map<string, number> => {
    const m = new Map<string, number>()
    for (const r of rows) {
      if (r.month > month) continue
      const key = `${r.categoryId}|${r.month}`
      m.set(key, (m.get(key) ?? 0) + r.amount)
    }
    return m
  }
  const assignedBy = sums(allocations)
  const activityBy = sums(activity)

  let first = month
  for (const r of [...allocations, ...activity]) if (r.month < first) first = r.month

  const result = new Map<number, BudgetFigures>()
  for (const id of categoryIds) {
    let carry = 0
    for (let m = first; ; m = shiftMonth(m, 1)) {
      const assigned = assignedBy.get(`${id}|${m}`) ?? 0
      const act = activityBy.get(`${id}|${m}`) ?? 0
      const available = carry + assigned + act
      if (m === month) {
        result.set(id, { carryover: carry, assigned, activity: act, available })
        break
      }
      carry = available
    }
  }
  return result
}
