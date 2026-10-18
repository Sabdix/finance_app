import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'finanzas-budget-'))
vi.mock('electron', () => ({ app: { getPath: () => dir }, BrowserWindow: {}, dialog: {}, shell: {} }))

const { api } = await import('./api')
const { closeDb } = await import('./db/connection')
const { migrate } = await import('./db/migrations')

afterAll(() => {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
})

const OCT = '2026-10'
const NOV = '2026-11'

describe('presupuesto (cajitas)', () => {
  let debit: number
  let card: number
  let food: number
  let salary: number
  let cardCajita: number

  const row = (month: string, id: number) => api.getBudgetMonth(month).rows.find((r) => r.categoryId === id)!

  beforeAll(() => {
    debit = api.createAccount({ name: 'Nómina', type: 'debit', openingBalance: 1000000, creditLimit: null, statementDay: null, dueDay: null })
    card = api.createAccount({ name: 'Visa', type: 'credit', openingBalance: 0, creditLimit: 5000000, statementDay: 20, dueDay: 10 })
    const cats = api.listCategories()
    food = cats.find((c) => c.name === 'Supermercado')!.id
    salary = cats.find((c) => c.name === 'Sueldo')!.id
    cardCajita = cats.find((c) => c.kind === 'card_payment' && c.accountId === card)!.id
  })

  it('crea la cajita de pago al dar de alta una tarjeta', () => {
    expect(api.listCategories().find((c) => c.id === cardCajita)?.name).toBe('Pago Visa')
  })

  it('el saldo inicial y los ingresos alimentan "Por asignar"; asignar lo reduce', () => {
    expect(api.getBudgetMonth(OCT).readyToAssign).toBe(1000000)
    api.createTransaction({ kind: 'income', date: '2026-10-01', accountId: debit, amount: 2000000, categoryId: salary, description: '' })
    expect(api.getBudgetMonth(OCT)).toMatchObject({ readyToAssign: 3000000, income: 2000000 })
    api.setAllocation(food, OCT, 500000)
    expect(api.getBudgetMonth(OCT).readyToAssign).toBe(2500000)
  })

  it('un gasto con tarjeta descuenta de la cajita y aparta el dinero para pagar la tarjeta', () => {
    api.createTransaction({ kind: 'expense', date: '2026-10-03', accountId: debit, amount: 100000, categoryId: food, description: '' })
    api.createTransaction({ kind: 'expense', date: '2026-10-04', accountId: card, amount: 200000, categoryId: food, description: '' })
    expect(row(OCT, food)).toMatchObject({ assigned: 500000, activity: -300000, available: 200000 })
    expect(row(OCT, cardCajita)).toMatchObject({ activity: 200000, available: 200000, cardDebt: 200000 })
  })

  it('pagar la tarjeta vacía su cajita de pago sin tocar "Por asignar"', () => {
    const before = api.getBudgetMonth(OCT).readyToAssign
    api.createTransfer({ date: '2026-10-10', fromAccountId: debit, toAccountId: card, amount: 200000, description: '' })
    expect(row(OCT, cardCajita)).toMatchObject({ available: 0, cardDebt: 0 })
    expect(api.getBudgetMonth(OCT).readyToAssign).toBe(before)
  })

  it('una compra a meses solo pesa en el presupuesto con la cuota de cada mes', () => {
    api.createInstallmentPlan({
      accountId: card, categoryId: food, description: 'Refri', purchaseDate: '2026-10-05', totalAmount: 1200000, months: 12, firstDueDate: '2026-10-10'
    })
    expect(row(OCT, food)).toMatchObject({ activity: -400000, available: 100000 })
    expect(row(OCT, cardCajita).available).toBe(100000)
    // En noviembre se arrastra lo que sobró y entra la segunda cuota.
    expect(row(NOV, food)).toMatchObject({ carryover: 100000, activity: -100000, available: 0 })
  })

  it('mueve dinero entre cajitas y desde "Por asignar"', () => {
    const rta = api.getBudgetMonth(OCT).readyToAssign
    api.moveBudget({ month: OCT, fromCategoryId: null, toCategoryId: food, amount: 50000 })
    api.moveBudget({ month: OCT, fromCategoryId: food, toCategoryId: cardCajita, amount: 20000 })
    expect(api.getBudgetMonth(OCT).readyToAssign).toBe(rta - 50000)
    expect(row(OCT, food).assigned).toBe(530000)
    expect(row(OCT, cardCajita).assigned).toBe(20000)
  })

  it('copia lo asignado del mes anterior solo donde no hay asignación', () => {
    api.setAllocation(cardCajita, NOV, 1)
    expect(api.copyPreviousMonthAllocations(NOV)).toBe(1)
    expect(row(NOV, food).assigned).toBe(530000)
    expect(row(NOV, cardCajita).assigned).toBe(1)
  })

  it('un gasto sin categoría en débito sale directo de "Por asignar"', () => {
    const rta = api.getBudgetMonth(OCT).readyToAssign
    api.createTransaction({ kind: 'expense', date: '2026-10-12', accountId: debit, amount: 3000, categoryId: null, description: '' })
    expect(api.getBudgetMonth(OCT).readyToAssign).toBe(rta - 3000)
  })

  it('no permite categorizar un gasto en la cajita de pago de tarjeta', () => {
    expect(() =>
      api.createTransaction({ kind: 'expense', date: '2026-10-12', accountId: debit, amount: 1, categoryId: cardCajita, description: '' })
    ).toThrow(/transferencia/)
  })

  it('renombrar y archivar la tarjeta actualiza su cajita', () => {
    api.updateAccount(card, { name: 'Visa Oro', type: 'credit', openingBalance: 0, creditLimit: 5000000, statementDay: 20, dueDay: 10 })
    api.setAccountArchived(card, true)
    const c = api.listCategories().find((x) => x.id === cardCajita)!
    expect(c).toMatchObject({ name: 'Pago Visa Oro', archived: true })
  })
})

describe('migración desde la versión 1', () => {
  it('conserva los datos y crea las cajitas de las tarjetas existentes', () => {
    const db = new Database(':memory:')
    migrate(db, 1)
    db.prepare(`INSERT INTO accounts (id, name, type) VALUES (1, 'Amex', 'credit'), (2, 'Débito', 'debit')`).run()
    db.prepare(`INSERT INTO transactions (date, account_id, amount, category_id) VALUES ('2026-10-01', 1, -500, 6)`).run()
    migrate(db)
    expect(db.pragma('user_version', { simple: true })).toBe(5)
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(db.prepare(`SELECT name FROM categories WHERE kind = 'card_payment'`).all()).toEqual([{ name: 'Pago Amex' }])
    expect(db.prepare('SELECT c.name FROM transactions t JOIN categories c ON c.id = t.category_id').get()).toEqual({ name: 'Supermercado' })
    expect(db.prepare('SELECT color FROM accounts ORDER BY id').all()).toEqual([{ color: '#4f46e5' }, { color: '#2563eb' }])
    db.close()
  })
})
