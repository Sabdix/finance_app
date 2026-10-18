import type { Api } from '@shared/api'
import { monthsBetween } from '@shared/dates'
import { buildReport, type ActivityRow, type CategoryMeta } from '@shared/report'
import { CATEGORY_ACTIVITY_SQL, INFLOW_WHERE } from './budget'
import { getDb } from './db/connection'
import { check } from './db/validate'

type Row = Record<string, unknown>

const isMonth = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s)

// Gastos sin categoría: cuentan como gasto en el reporte aunque no pertenezcan a ninguna cajita.
const UNCATEGORIZED_SQL = `
  SELECT NULL AS categoryId, substr(date, 1, 7) AS month, SUM(amount) AS amount
  FROM transactions
  WHERE category_id IS NULL AND transfer_id IS NULL AND installment_plan_id IS NULL AND amount < 0
  GROUP BY 2

  UNION ALL
  SELECT NULL, substr(i.due_date, 1, 7), -SUM(i.amount)
  FROM installments i JOIN installment_plans p ON p.id = i.plan_id
  WHERE p.category_id IS NULL
  GROUP BY 2
`

export const reportApi: Pick<Api, 'getReport'> = {
  getReport(fromMonth, toMonth) {
    check(isMonth(fromMonth) && isMonth(toMonth) && fromMonth <= toMonth, 'Periodo inválido')
    const months = monthsBetween(fromMonth, toMonth)
    check(months.length <= 120, 'El periodo máximo es de 10 años')
    const db = getDb()
    const range = { from: fromMonth, to: toMonth }

    const categories = new Map<number, CategoryMeta>(
      (db.prepare(`SELECT id, name, group_name FROM categories WHERE kind = 'expense'`).all() as Row[]).map((c) => [
        c.id as number,
        { name: c.name as string, groupName: c.group_name as string }
      ])
    )
    const activity = db
      .prepare(
        `SELECT categoryId, month, amount FROM (${CATEGORY_ACTIVITY_SQL} UNION ALL ${UNCATEGORIZED_SQL})
         WHERE month BETWEEN @from AND @to`
      )
      .all(range) as ActivityRow[]
    const income = db
      .prepare(
        `SELECT substr(t.date, 1, 7) AS month, SUM(t.amount) AS amount
         FROM transactions t JOIN accounts a ON a.id = t.account_id LEFT JOIN categories c ON c.id = t.category_id
         WHERE ${INFLOW_WHERE} AND substr(t.date, 1, 7) BETWEEN @from AND @to
         GROUP BY 1`
      )
      .all(range) as { month: string; amount: number }[]

    return buildReport(months, categories, activity, income)
  }
}
