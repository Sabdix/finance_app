import type { Api } from '@shared/api'
import { rollBudget, type MonthAmount } from '@shared/budget'
import { shiftMonth } from '@shared/dates'
import type { BudgetRow } from '@shared/types'
import { getDb } from './db/connection'
import { check } from './db/validate'

type Row = Record<string, unknown>

const isMonth = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s)

// Actividad por cajita y mes. Las compras a meses no cuentan por su total sino por la cuota de cada mes.
// El reporte de gastos usa la misma definición, para que ambos cuadren.
export const CATEGORY_ACTIVITY_SQL = `
  -- Gastos y reembolsos en categorías de gasto
  SELECT t.category_id AS categoryId, substr(t.date, 1, 7) AS month, SUM(t.amount) AS amount
  FROM transactions t JOIN categories c ON c.id = t.category_id AND c.kind = 'expense'
  WHERE t.transfer_id IS NULL AND t.installment_plan_id IS NULL
  GROUP BY 1, 2

  UNION ALL
  -- Cuotas de MSI, en el mes en que vencen
  SELECT p.category_id, substr(i.due_date, 1, 7), -SUM(i.amount)
  FROM installments i
  JOIN installment_plans p ON p.id = i.plan_id
  JOIN categories c ON c.id = p.category_id AND c.kind = 'expense'
  GROUP BY 1, 2
`

const ACTIVITY_SQL = `
  ${CATEGORY_ACTIVITY_SQL}

  UNION ALL
  -- Lo gastado con tarjeta en una categoría se aparta en la cajita de pago de esa tarjeta
  SELECT pc.id, substr(t.date, 1, 7), -SUM(t.amount)
  FROM transactions t
  JOIN categories c ON c.id = t.category_id AND c.kind = 'expense'
  JOIN categories pc ON pc.account_id = t.account_id AND pc.kind = 'card_payment'
  WHERE t.transfer_id IS NULL AND t.installment_plan_id IS NULL
  GROUP BY 1, 2

  UNION ALL
  -- Igual para las cuotas de MSI
  SELECT pc.id, substr(i.due_date, 1, 7), SUM(i.amount)
  FROM installments i
  JOIN installment_plans p ON p.id = i.plan_id
  JOIN categories c ON c.id = p.category_id AND c.kind = 'expense'
  JOIN categories pc ON pc.account_id = p.account_id AND pc.kind = 'card_payment'
  GROUP BY 1, 2

  UNION ALL
  -- Los pagos a la tarjeta salen de su cajita de pago
  SELECT pc.id, substr(t.date, 1, 7), -SUM(t.amount)
  FROM transactions t JOIN categories pc ON pc.account_id = t.account_id AND pc.kind = 'card_payment'
  WHERE t.transfer_id IS NOT NULL AND t.amount > 0
  GROUP BY 1, 2
`

// Entradas que alimentan "Por asignar": ingresos categorizados y entradas sin categoría.
// Un gasto sin categoría en débito/efectivo sale directo de "Por asignar".
export const INFLOW_WHERE = `
  t.transfer_id IS NULL AND t.installment_plan_id IS NULL AND (
    c.kind = 'income' OR (t.category_id IS NULL AND (a.type <> 'credit' OR t.amount > 0))
  )`

export const budgetApi: Pick<Api, 'getBudgetMonth' | 'setAllocation' | 'moveBudget' | 'copyPreviousMonthAllocations'> = {
  getBudgetMonth(month) {
    check(isMonth(month), 'Mes inválido')
    const db = getDb()
    const categories = db
      .prepare(
        `SELECT c.id, c.name, c.group_name, c.kind, c.archived, c.account_id, a.color AS account_color,
           CASE WHEN c.account_id IS NULL THEN NULL ELSE
             -(a.opening_balance + COALESCE((SELECT SUM(amount) FROM transactions WHERE account_id = a.id), 0))
           END AS balance_owed
         FROM categories c LEFT JOIN accounts a ON a.id = c.account_id
         WHERE c.kind IN ('expense', 'card_payment')
         ORDER BY c.kind = 'card_payment', c.group_name, c.name`
      )
      .all() as Row[]
    const allocations = db
      .prepare('SELECT category_id AS categoryId, month, amount FROM budget_allocations WHERE month <= ?')
      .all(month) as MonthAmount[]
    const activity = db.prepare(ACTIVITY_SQL).all() as MonthAmount[]
    const figures = rollBudget(
      categories.map((c) => c.id as number),
      allocations,
      activity,
      month
    )

    const rows: BudgetRow[] = []
    for (const c of categories) {
      const f = figures.get(c.id as number)!
      // Las cajitas archivadas solo se muestran si todavía tienen movimiento o saldo.
      if (c.archived === 1 && f.available === 0 && f.assigned === 0 && f.activity === 0) continue
      rows.push({
        categoryId: c.id as number,
        name: c.name as string,
        groupName: c.group_name as string,
        kind: c.kind as BudgetRow['kind'],
        ...f,
        cardDebt: c.balance_owed === null ? null : Math.max(0, c.balance_owed as number),
        accountColor: (c.account_color as string | null) ?? null
      })
    }

    const totals = db
      .prepare(
        `SELECT
           (SELECT COALESCE(SUM(opening_balance), 0) FROM accounts WHERE type <> 'credit')
           + (SELECT COALESCE(SUM(t.amount), 0) FROM transactions t
                JOIN accounts a ON a.id = t.account_id LEFT JOIN categories c ON c.id = t.category_id
                WHERE ${INFLOW_WHERE})
           - (SELECT COALESCE(SUM(amount), 0) FROM budget_allocations) AS ready,
           (SELECT COALESCE(SUM(t.amount), 0) FROM transactions t
              JOIN accounts a ON a.id = t.account_id LEFT JOIN categories c ON c.id = t.category_id
              WHERE ${INFLOW_WHERE} AND substr(t.date, 1, 7) = @month) AS income`
      )
      .get({ month }) as Row

    return { month, readyToAssign: totals.ready as number, income: totals.income as number, rows }
  },

  setAllocation(categoryId, month, amount) {
    check(isMonth(month), 'Mes inválido')
    check(Number.isInteger(amount), 'Monto inválido')
    const db = getDb()
    const cat = db.prepare('SELECT kind FROM categories WHERE id = ?').get(categoryId) as Row | undefined
    check(cat && cat.kind !== 'income', 'Solo se asigna dinero a cajitas de gasto o de pago de tarjeta')
    if (amount === 0) {
      db.prepare('DELETE FROM budget_allocations WHERE category_id = ? AND month = ?').run(categoryId, month)
    } else {
      db.prepare(
        `INSERT INTO budget_allocations (category_id, month, amount) VALUES (?, ?, ?)
         ON CONFLICT (category_id, month) DO UPDATE SET amount = excluded.amount`
      ).run(categoryId, month, amount)
    }
  },

  moveBudget({ month, fromCategoryId, toCategoryId, amount }) {
    check(isMonth(month), 'Mes inválido')
    check(Number.isInteger(amount) && amount > 0, 'El monto debe ser mayor a cero')
    check(fromCategoryId !== toCategoryId, 'Elige dos cajitas distintas')
    const db = getDb()
    const adjust = db.prepare(
      `INSERT INTO budget_allocations (category_id, month, amount) VALUES (?, ?, ?)
       ON CONFLICT (category_id, month) DO UPDATE SET amount = amount + excluded.amount`
    )
    db.transaction(() => {
      // Mover desde/hacia "Por asignar" es solo ajustar la otra cajita.
      if (fromCategoryId !== null) adjust.run(fromCategoryId, month, -amount)
      if (toCategoryId !== null) adjust.run(toCategoryId, month, amount)
      db.prepare('DELETE FROM budget_allocations WHERE amount = 0').run()
    })()
  },

  copyPreviousMonthAllocations(month) {
    check(isMonth(month), 'Mes inválido')
    const r = getDb()
      .prepare(
        `INSERT INTO budget_allocations (category_id, month, amount)
         SELECT b.category_id, @month, b.amount
         FROM budget_allocations b JOIN categories c ON c.id = b.category_id AND c.archived = 0
         WHERE b.month = @prev AND b.amount > 0
           AND NOT EXISTS (SELECT 1 FROM budget_allocations x WHERE x.category_id = b.category_id AND x.month = @month)`
      )
      .run({ month, prev: shiftMonth(month, -1) })
    return r.changes
  }
}
