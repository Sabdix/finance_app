import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Se ejecuta con el Node de Electron (npm run test:db) porque better-sqlite3 está compilado para Electron.
const dir = mkdtempSync(join(tmpdir(), 'finanzas-test-'))
vi.mock('electron', () => ({ app: { getPath: () => dir }, BrowserWindow: {}, dialog: {}, shell: {} }))

const { api } = await import('./api')
const { closeDb } = await import('./db/connection')

afterAll(() => {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
})

describe('api con SQLite real', () => {
  let debit: number
  let card: number
  let food: number

  beforeAll(() => {
    debit = api.createAccount({ name: 'Nómina', type: 'debit', openingBalance: 1000000, creditLimit: null, statementDay: null, dueDay: null })
    card = api.createAccount({ name: 'Visa', type: 'credit', openingBalance: -50000, creditLimit: 3000000, statementDay: 20, dueDay: 10 })
    food = api.listCategories().find((c) => c.name === 'Supermercado')!.id
  })

  const balance = (id: number): number => api.listAccounts().find((a) => a.id === id)!.balance

  it('asigna colores distintos a cada cuenta nueva y permite cambiarlos', () => {
    const [a, b] = [debit, card].map((id) => api.listAccounts().find((x) => x.id === id)!.color)
    expect(a).not.toBe(b)
    const input = { name: 'Nómina', type: 'debit' as const, openingBalance: 1000000, creditLimit: null, statementDay: null, dueDay: null }
    api.updateAccount(debit, { ...input, color: '#123abc' })
    api.updateAccount(debit, input)
    expect(api.listAccounts().find((x) => x.id === debit)!.color).toBe('#123abc')
    expect(() => api.updateAccount(debit, { ...input, color: 'rojo' })).toThrow(/Color/)
    expect(api.listTransactions({}).every((t) => t.accountColor)).toBe(true)
  })

  it('trae categorías iniciales', () => {
    expect(api.listCategories().length).toBeGreaterThan(5)
  })

  it('un gasto con débito baja el saldo y uno con tarjeta sube la deuda', () => {
    api.createTransaction({ kind: 'expense', date: '2026-10-01', accountId: debit, amount: 20000, categoryId: food, description: 'Súper' })
    api.createTransaction({ kind: 'expense', date: '2026-10-02', accountId: card, amount: 10000, categoryId: food, description: '' })
    expect(balance(debit)).toBe(980000)
    expect(balance(card)).toBe(-60000)
  })

  it('un pago de tarjeta mueve dinero entre ambas cuentas y se borra completo', () => {
    const before = api.listTransactions({}).length
    api.createTransfer({ date: '2026-10-05', fromAccountId: debit, toAccountId: card, amount: 60000, description: 'Pago' })
    expect(balance(debit)).toBe(920000)
    expect(balance(card)).toBe(0)
    const leg = api.listTransactions({ accountId: card }).find((t) => t.transferId)!
    expect(leg.counterpartAccountName).toBe('Nómina')
    api.deleteTransaction(leg.id)
    expect(api.listTransactions({}).length).toBe(before)
    expect(balance(card)).toBe(-60000)
  })

  it('una compra a meses carga el total a la tarjeta y genera el calendario', () => {
    const planId = api.createInstallmentPlan({
      accountId: card, categoryId: food, description: 'Laptop', purchaseDate: '2026-01-15', totalAmount: 1200000, months: 12, firstDueDate: '2026-02-10'
    })
    expect(balance(card)).toBe(-1260000)
    const plan = api.listInstallmentPlans().find((p) => p.id === planId)!
    expect(plan.installments).toHaveLength(12)
    expect(plan.installments.every((i) => i.amount === 100000)).toBe(true)
    expect(api.listAccounts().find((a) => a.id === card)!.msiPending).toBe(1200000)

    api.markOverdueInstallmentsPaid(planId)
    const paid = api.listInstallmentPlans().find((p) => p.id === planId)!.installments.filter((i) => i.paidAt)
    expect(paid.length).toBeGreaterThan(0)
    expect(paid.every((i) => i.paidAt === i.dueDate)).toBe(true)

    const purchase = api.listTransactions({ accountId: card }).find((t) => t.installmentPlanId === planId)!
    expect(() => api.deleteTransaction(purchase.id)).toThrow(/MSI/)
    api.deleteInstallmentPlan(planId)
    expect(balance(card)).toBe(-60000)
  })

  it('guarda observaciones en cuentas y movimientos, y en ambos lados de una transferencia', () => {
    const base = { name: 'Nómina', type: 'debit' as const, openingBalance: 1000000, creditLimit: null, statementDay: null, dueDay: null }
    api.updateAccount(debit, { ...base, notes: '  Cuenta de nómina\nCLABE en el cajón  \n\n' })
    api.updateAccount(debit, base) // sin notes: se conservan
    expect(api.listAccounts().find((a) => a.id === debit)!.notes).toBe('Cuenta de nómina\nCLABE en el cajón')

    const id = api.createTransaction({ kind: 'expense', date: '2026-10-20', accountId: debit, amount: 100, categoryId: null, description: 'x', notes: 'ticket 123' })
    expect(api.listTransactions({}).find((t) => t.id === id)!.notes).toBe('ticket 123')

    api.createTransfer({ date: '2026-10-20', fromAccountId: debit, toAccountId: card, amount: 100, description: 'Pago', notes: 'abono' })
    const legs = api.listTransactions({}).filter((t) => t.transferId && t.date === '2026-10-20')
    expect(legs.map((t) => t.notes)).toEqual(['abono', 'abono'])
    api.setTransactionNotes(legs[0].id, 'pago puntual')
    expect(api.listTransactions({}).filter((t) => t.transferId === legs[0].transferId).map((t) => t.notes)).toEqual(['pago puntual', 'pago puntual'])

    expect(() => api.setTransactionNotes(id, 'x'.repeat(2001))).toThrow(/2000/)
  })

  it('rechaza compras a meses en cuentas de débito', () => {
    expect(() =>
      api.createInstallmentPlan({ accountId: debit, categoryId: null, description: 'X', purchaseDate: '2026-01-01', totalAmount: 100, months: 3, firstDueDate: '2026-02-01' })
    ).toThrow(/crédito/)
  })
})
