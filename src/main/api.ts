import type { Api } from '@shared/api'
import { isHexColor, nextAccountColor } from '@shared/colors'
import { today } from '@shared/dates'
import { buildSchedule } from '@shared/installments'
import type Database from 'better-sqlite3'
import type {
  AccountInput,
  AccountWithBalance,
  Category,
  CategoryInput,
  Installment,
  InstallmentPlan,
  Transaction,
  TransactionInput
} from '@shared/types'
import { budgetApi } from './budget'
import { dataApi } from './data'
import { getDb } from './db/connection'
import { reportApi } from './report'
import { check, isDay, isIsoDate, isPositiveCents } from './db/validate'

type Row = Record<string, unknown>

const MAX_NOTES = 2000

function validateNotes(notes: unknown): void {
  check(notes === undefined || (typeof notes === 'string' && notes.length <= MAX_NOTES), `Las observaciones admiten hasta ${MAX_NOTES} caracteres`)
}

/** Recorta espacios al final de cada línea y líneas vacías al inicio y al final. */
const cleanNotes = (notes: string | undefined): string | null =>
  notes === undefined ? null : notes.replace(/[ \t]+$/gm, '').trim()

function validateAccount(input: AccountInput): void {
  check(input.name?.trim(), 'La cuenta necesita un nombre')
  check(['debit', 'credit', 'cash'].includes(input.type), 'Tipo de cuenta inválido')
  check(Number.isInteger(input.openingBalance), 'Saldo inicial inválido')
  check(input.creditLimit === null || isPositiveCents(input.creditLimit), 'Límite de crédito inválido')
  check(isDay(input.statementDay) && isDay(input.dueDay), 'Los días de corte y pago van del 1 al 31')
  check(input.color === undefined || isHexColor(input.color), 'Color inválido')
  validateNotes(input.notes)
}

function validateCategory(input: CategoryInput): void {
  check(input.name?.trim(), 'La categoría necesita un nombre')
  check(['expense', 'income'].includes(input.kind), 'Tipo de categoría inválido')
}

function validateTransaction(input: TransactionInput): void {
  check(['expense', 'income'].includes(input.kind), 'Tipo de movimiento inválido')
  validateNotes(input.notes)
  if (input.categoryId !== null) {
    const c = getDb().prepare('SELECT kind FROM categories WHERE id = ?').get(input.categoryId) as Row | undefined
    check(c && c.kind !== 'card_payment', 'Para pagar una tarjeta usa una transferencia hacia la tarjeta')
  }
  check(isIsoDate(input.date), 'Fecha inválida')
  check(isPositiveCents(input.amount), 'El monto debe ser mayor a cero')
  check(Number.isInteger(input.accountId), 'Elige una cuenta')
}

const toAccount = (r: Row): AccountWithBalance => ({
  id: r.id as number,
  name: r.name as string,
  type: r.type as AccountWithBalance['type'],
  openingBalance: r.opening_balance as number,
  creditLimit: r.credit_limit as number | null,
  statementDay: r.statement_day as number | null,
  dueDay: r.due_day as number | null,
  color: r.color as string,
  notes: r.notes as string,
  archived: r.archived === 1,
  balance: r.balance as number,
  msiPending: r.msi_pending as number
})

const toCategory = (r: Row): Category => ({
  id: r.id as number,
  name: r.name as string,
  groupName: r.group_name as string,
  kind: r.kind as Category['kind'],
  accountId: r.account_id as number | null,
  archived: r.archived === 1
})

/** Mantiene la cajita "Pago <tarjeta>" sincronizada con la cuenta: nombre, archivado y existencia. */
function syncCardCategory(db: Database.Database, accountId: number): void {
  const a = db.prepare('SELECT name, type, archived FROM accounts WHERE id = ?').get(accountId) as Row
  const name = `Pago ${a.name as string}`
  const archived = a.type === 'credit' ? (a.archived as number) : 1
  const updated = db
    .prepare(`UPDATE categories SET name = ?, archived = ? WHERE account_id = ? AND kind = 'card_payment'`)
    .run(name, archived, accountId)
  if (updated.changes === 0 && a.type === 'credit') {
    db.prepare(
      `INSERT INTO categories (name, group_name, kind, account_id, archived) VALUES (?, 'Pagos de tarjetas', 'card_payment', ?, ?)`
    ).run(name, accountId, archived)
  }
}

const toTransaction = (r: Row): Transaction => ({
  id: r.id as number,
  date: r.date as string,
  accountId: r.account_id as number,
  accountName: r.account_name as string,
  accountColor: r.account_color as string,
  amount: r.amount as number,
  categoryId: r.category_id as number | null,
  categoryName: r.category_name as string | null,
  description: r.description as string,
  notes: r.notes as string,
  transferId: r.transfer_id as number | null,
  counterpartAccountName: r.counterpart_account_name as string | null,
  installmentPlanId: r.installment_plan_id as number | null
})

const toInstallment = (r: Row): Installment => ({
  id: r.id as number,
  planId: r.plan_id as number,
  number: r.number as number,
  dueDate: r.due_date as string,
  amount: r.amount as number,
  paidAt: r.paid_at as string | null
})

export const api: Api = {
  // ---------- Cuentas ----------
  listAccounts() {
    const rows = getDb()
      .prepare(
        `SELECT a.*,
           a.opening_balance + COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = a.id), 0) AS balance,
           COALESCE((SELECT SUM(i.amount) FROM installments i
                     JOIN installment_plans p ON p.id = i.plan_id
                     WHERE p.account_id = a.id AND i.paid_at IS NULL), 0) AS msi_pending
         FROM accounts a
         ORDER BY a.archived, CASE a.type WHEN 'debit' THEN 0 WHEN 'cash' THEN 1 ELSE 2 END, a.name`
      )
      .all() as Row[]
    return rows.map(toAccount)
  },

  createAccount(input) {
    validateAccount(input)
    const db = getDb()
    return db.transaction(() => {
      const used = (db.prepare('SELECT color FROM accounts WHERE archived = 0').all() as Row[]).map((r) => r.color as string)
      const r = db
        .prepare(
          `INSERT INTO accounts (name, type, opening_balance, credit_limit, statement_day, due_day, color, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.name.trim(),
          input.type,
          input.openingBalance,
          input.creditLimit,
          input.statementDay,
          input.dueDay,
          input.color ?? nextAccountColor(used),
          cleanNotes(input.notes) ?? ''
        )
      const id = Number(r.lastInsertRowid)
      syncCardCategory(db, id)
      return id
    })()
  },

  updateAccount(id, input) {
    validateAccount(input)
    const db = getDb()
    if (input.type !== 'credit') {
      const plans = db.prepare('SELECT COUNT(*) AS n FROM installment_plans WHERE account_id = ?').get(id) as Row
      check(plans.n === 0, 'Esta cuenta tiene compras a meses; no puede dejar de ser tarjeta de crédito')
    }
    db.transaction(() => {
      db.prepare(
        `UPDATE accounts SET name = ?, type = ?, opening_balance = ?, credit_limit = ?, statement_day = ?, due_day = ?,
           color = COALESCE(?, color), notes = COALESCE(?, notes)
         WHERE id = ?`
      ).run(
        input.name.trim(),
        input.type,
        input.openingBalance,
        input.creditLimit,
        input.statementDay,
        input.dueDay,
        input.color ?? null,
        cleanNotes(input.notes),
        id
      )
      syncCardCategory(db, id)
    })()
  },

  setAccountArchived(id, archived) {
    const db = getDb()
    db.transaction(() => {
      db.prepare('UPDATE accounts SET archived = ? WHERE id = ?').run(archived ? 1 : 0, id)
      syncCardCategory(db, id)
    })()
  },

  // ---------- Categorías ----------
  listCategories() {
    const rows = getDb()
      .prepare('SELECT * FROM categories ORDER BY archived, kind DESC, group_name, name')
      .all() as Row[]
    return rows.map(toCategory)
  },

  createCategory(input) {
    validateCategory(input)
    const r = getDb()
      .prepare('INSERT INTO categories (name, group_name, kind) VALUES (?, ?, ?)')
      .run(input.name.trim(), input.groupName.trim() || 'General', input.kind)
    return Number(r.lastInsertRowid)
  },

  updateCategory(id, input) {
    validateCategory(input)
    const current = getDb().prepare('SELECT kind FROM categories WHERE id = ?').get(id) as Row | undefined
    check(current && current.kind !== 'card_payment', 'Las cajitas de pago de tarjeta se administran desde la cuenta')
    getDb()
      .prepare('UPDATE categories SET name = ?, group_name = ?, kind = ? WHERE id = ?')
      .run(input.name.trim(), input.groupName.trim() || 'General', input.kind, id)
  },

  setCategoryArchived(id, archived) {
    getDb()
      .prepare(`UPDATE categories SET archived = ? WHERE id = ? AND kind <> 'card_payment'`)
      .run(archived ? 1 : 0, id)
  },

  // ---------- Movimientos ----------
  listTransactions(filter) {
    const where = filter.accountId ? 'WHERE t.account_id = @accountId' : ''
    const rows = getDb()
      .prepare(
        `SELECT t.*, a.name AS account_name, a.color AS account_color, c.name AS category_name,
           (SELECT a2.name FROM transactions t2 JOIN accounts a2 ON a2.id = t2.account_id
             WHERE t2.transfer_id = t.transfer_id AND t2.id <> t.id) AS counterpart_account_name
         FROM transactions t
         JOIN accounts a ON a.id = t.account_id
         LEFT JOIN categories c ON c.id = t.category_id
         ${where}
         ORDER BY t.date DESC, t.id DESC
         LIMIT @limit`
      )
      .all({ accountId: filter.accountId ?? null, limit: filter.limit ?? 500 }) as Row[]
    return rows.map(toTransaction)
  },

  createTransaction(input) {
    validateTransaction(input)
    const signed = input.kind === 'expense' ? -input.amount : input.amount
    const r = getDb()
      .prepare('INSERT INTO transactions (date, account_id, amount, category_id, description, notes) VALUES (?, ?, ?, ?, ?, ?)')
      .run(input.date, input.accountId, signed, input.categoryId, input.description.trim(), cleanNotes(input.notes) ?? '')
    return Number(r.lastInsertRowid)
  },

  updateTransaction(id, input) {
    validateTransaction(input)
    const db = getDb()
    const existing = db.prepare('SELECT transfer_id, installment_plan_id FROM transactions WHERE id = ?').get(id) as
      | Row
      | undefined
    check(existing, 'El movimiento no existe')
    check(!existing.transfer_id, 'Las transferencias no se editan; elimínala y regístrala de nuevo')
    check(!existing.installment_plan_id, 'Las compras a meses se administran desde la sección MSI')
    const signed = input.kind === 'expense' ? -input.amount : input.amount
    db.prepare(
      `UPDATE transactions SET date = ?, account_id = ?, amount = ?, category_id = ?, description = ?, notes = COALESCE(?, notes)
       WHERE id = ?`
    ).run(input.date, input.accountId, signed, input.categoryId, input.description.trim(), cleanNotes(input.notes), id)
  },

  createTransfer(input) {
    check(isIsoDate(input.date), 'Fecha inválida')
    check(isPositiveCents(input.amount), 'El monto debe ser mayor a cero')
    check(input.fromAccountId !== input.toAccountId, 'Elige dos cuentas distintas')
    validateNotes(input.notes)
    const db = getDb()
    return db.transaction(() => {
      const r = db
        .prepare('INSERT INTO transfers (from_account_id, to_account_id, amount, date) VALUES (?, ?, ?, ?)')
        .run(input.fromAccountId, input.toAccountId, input.amount, input.date)
      const transferId = Number(r.lastInsertRowid)
      const insert = db.prepare(
        'INSERT INTO transactions (date, account_id, amount, description, notes, transfer_id) VALUES (?, ?, ?, ?, ?, ?)'
      )
      const notes = cleanNotes(input.notes) ?? ''
      insert.run(input.date, input.fromAccountId, -input.amount, input.description.trim(), notes, transferId)
      insert.run(input.date, input.toAccountId, input.amount, input.description.trim(), notes, transferId)
      return transferId
    })()
  },

  deleteTransaction(id) {
    const db = getDb()
    const t = db.prepare('SELECT transfer_id, installment_plan_id FROM transactions WHERE id = ?').get(id) as
      | Row
      | undefined
    if (!t) return
    check(!t.installment_plan_id, 'Esta es una compra a meses; elimínala desde la sección MSI')
    if (t.transfer_id) db.prepare('DELETE FROM transfers WHERE id = ?').run(t.transfer_id)
    else db.prepare('DELETE FROM transactions WHERE id = ?').run(id)
  },

  setTransactionNotes(id, notes) {
    check(typeof notes === 'string', 'Observaciones inválidas')
    validateNotes(notes)
    const db = getDb()
    const t = db.prepare('SELECT transfer_id FROM transactions WHERE id = ?').get(id) as Row | undefined
    check(t, 'El movimiento no existe')
    // En una transferencia, ambos lados comparten las observaciones.
    if (t.transfer_id) db.prepare('UPDATE transactions SET notes = ? WHERE transfer_id = ?').run(cleanNotes(notes), t.transfer_id)
    else db.prepare('UPDATE transactions SET notes = ? WHERE id = ?').run(cleanNotes(notes), id)
  },

  // ---------- Meses sin intereses ----------
  listInstallmentPlans() {
    const db = getDb()
    const plans = db
      .prepare(
        `SELECT p.*, a.name AS account_name, a.color AS account_color, c.name AS category_name
         FROM installment_plans p
         JOIN accounts a ON a.id = p.account_id
         LEFT JOIN categories c ON c.id = p.category_id
         ORDER BY p.purchase_date DESC, p.id DESC`
      )
      .all() as Row[]
    const installments = (db.prepare('SELECT * FROM installments ORDER BY plan_id, number').all() as Row[]).map(
      toInstallment
    )
    return plans.map(
      (p): InstallmentPlan => ({
        id: p.id as number,
        accountId: p.account_id as number,
        accountName: p.account_name as string,
        accountColor: p.account_color as string,
        categoryId: p.category_id as number | null,
        categoryName: p.category_name as string | null,
        description: p.description as string,
        purchaseDate: p.purchase_date as string,
        totalAmount: p.total_amount as number,
        months: p.months as number,
        installments: installments.filter((i) => i.planId === p.id)
      })
    )
  },

  createInstallmentPlan(input) {
    check(input.description?.trim(), 'Describe la compra')
    check(isIsoDate(input.purchaseDate) && isIsoDate(input.firstDueDate), 'Fecha inválida')
    check(input.firstDueDate >= input.purchaseDate, 'El primer pago no puede ser antes de la compra')
    const schedule = buildSchedule(input.totalAmount, input.months, input.firstDueDate)
    const db = getDb()
    const account = db.prepare('SELECT type FROM accounts WHERE id = ?').get(input.accountId) as Row | undefined
    check(account?.type === 'credit', 'Las compras a meses solo aplican a tarjetas de crédito')
    if (input.categoryId !== null) {
      const c = db.prepare('SELECT kind FROM categories WHERE id = ?').get(input.categoryId) as Row | undefined
      check(c?.kind === 'expense', 'Elige una categoría de gasto')
    }

    return db.transaction(() => {
      const r = db
        .prepare(
          `INSERT INTO installment_plans (account_id, category_id, description, purchase_date, total_amount, months)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(input.accountId, input.categoryId, input.description.trim(), input.purchaseDate, input.totalAmount, input.months)
      const planId = Number(r.lastInsertRowid)
      const insertInstallment = db.prepare(
        'INSERT INTO installments (plan_id, number, due_date, amount) VALUES (?, ?, ?, ?)'
      )
      for (const i of schedule) insertInstallment.run(planId, i.number, i.dueDate, i.amount)
      // El banco aparta el total de la línea de crédito el día de la compra.
      db.prepare(
        `INSERT INTO transactions (date, account_id, amount, category_id, description, installment_plan_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        input.purchaseDate,
        input.accountId,
        -input.totalAmount,
        input.categoryId,
        `${input.description.trim()} (${input.months} MSI)`,
        planId
      )
      return planId
    })()
  },

  deleteInstallmentPlan(id) {
    getDb().prepare('DELETE FROM installment_plans WHERE id = ?').run(id)
  },

  setInstallmentPaid(id, paid) {
    getDb().prepare('UPDATE installments SET paid_at = ? WHERE id = ?').run(paid ? today() : null, id)
  },

  markOverdueInstallmentsPaid(planId) {
    getDb()
      .prepare('UPDATE installments SET paid_at = due_date WHERE plan_id = ? AND paid_at IS NULL AND due_date <= ?')
      .run(planId, today())
  },

  ...budgetApi,
  ...reportApi,
  ...dataApi
}
