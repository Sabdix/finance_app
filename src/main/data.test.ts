import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'finanzas-data-'))
vi.mock('electron', () => ({ app: { getPath: () => dir }, BrowserWindow: {}, dialog: {}, shell: {} }))

const { api } = await import('./api')
const { closeDb } = await import('./db/connection')
const { buildCsv, listBackups, pruneBackups, restoreFrom, validateBackupFile, writeBackup, backupFolder } = await import('./data')

afterAll(() => {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
})

let debit: number
let card: number
let food: number

beforeAll(() => {
  debit = api.createAccount({ name: 'Nómina', type: 'debit', openingBalance: 100000, creditLimit: null, statementDay: null, dueDay: null })
  card = api.createAccount({ name: 'Visa, Oro', type: 'credit', openingBalance: 0, creditLimit: 900000, statementDay: null, dueDay: null })
  const cats = api.listCategories()
  food = cats.find((c) => c.name === 'Supermercado')!.id
  const salary = cats.find((c) => c.name === 'Sueldo')!.id
  api.createTransaction({ kind: 'income', date: '2026-09-01', accountId: debit, amount: 5000000, categoryId: salary, description: '' })
  api.createTransaction({
    kind: 'expense', date: '2026-09-02', accountId: debit, amount: 12345, categoryId: food, description: 'Súper "grande"', notes: 'Despensa\ndel mes'
  })
  api.createTransaction({ kind: 'expense', date: '2026-10-02', accountId: card, amount: 50000, categoryId: null, description: '=HYPERLINK()' })
  api.createTransfer({ date: '2026-10-05', fromAccountId: debit, toAccountId: card, amount: 50000, description: 'Pago' })
  api.createInstallmentPlan({
    accountId: card, categoryId: food, description: 'Refri', purchaseDate: '2026-09-10', totalAmount: 300000, months: 3, firstDueDate: '2026-10-10'
  })
})

describe('reporte', () => {
  it('cuenta gastos por categoría y mes, las cuotas MSI en su mes y los ingresos', () => {
    const r = api.getReport('2026-09', '2026-12')
    expect(r.months).toEqual(['2026-09', '2026-10', '2026-11', '2026-12'])
    expect(r.income).toEqual([5000000, 0, 0, 0])
    const súper = r.categories.find((c) => c.name === 'Supermercado')!
    expect(súper.amounts).toEqual([12345, 100000, 100000, 100000])
    expect(r.categories.find((c) => c.categoryId === null)!.amounts).toEqual([0, 50000, 0, 0])
    expect(r.spending).toEqual([12345, 150000, 100000, 100000])
  })

  it('rechaza periodos inválidos', () => {
    expect(() => api.getReport('2026-10', '2026-09')).toThrow(/Periodo/)
  })
})

describe('CSV', () => {
  it('exporta movimientos con tipo, montos a dos decimales y filtro de fechas', () => {
    const csv = buildCsv('transactions', '2026-09-01', '2026-09-30')
    const lines = csv.replace('﻿', '').trim().split('\r\n')
    expect(lines[0]).toBe('Fecha,Cuenta,Tipo,Categoría,Grupo,Descripción,Monto,Cuenta relacionada,Observaciones')
    expect(lines).toContain('2026-09-01,Nómina,Ingreso,Sueldo,Ingresos,,50000.00,,')
    expect(csv).toContain('2026-09-02,Nómina,Gasto,Supermercado,Comida,"Súper ""grande""",-123.45,,"Despensa\ndel mes"')
    expect(lines).toContain('2026-09-10,"Visa, Oro",Compra a MSI,Supermercado,Comida,Refri (3 MSI),-3000.00,,')
    expect(csv.match(/^2026-09/gm)).toHaveLength(3)
  })

  it('distingue pagos de tarjeta y neutraliza fórmulas', () => {
    const csv = buildCsv('transactions')
    expect(csv).toContain('2026-10-05,"Visa, Oro",Pago de tarjeta,,,Pago,500.00,Nómina,')
    expect(csv).toContain('2026-10-05,Nómina,Transferencia,,,Pago,-500.00,"Visa, Oro",')
    expect(csv).toContain("'=HYPERLINK()")
  })

  it('exporta cuentas y el calendario de MSI', () => {
    expect(buildCsv('accounts')).toContain('"Visa, Oro",Crédito,-3000.00,9000.00,3000.00,No,')
    const msi = buildCsv('installments')
    expect(msi).toContain('Refri,"Visa, Oro",Supermercado,2026-09-10,3000.00,3,1/3,2026-10-10,1000.00,')
  })
})

describe('respaldos', () => {
  it('escribe el respaldo y conserva solo los 30 diarios más recientes', () => {
    const folder = join(dir, 'rotacion')
    mkdirSync(folder)
    for (let d = 1; d <= 33; d++) writeFileSync(join(folder, `finanzas-2026-01-${String(d).padStart(2, '0')}.db`), '')
    writeFileSync(join(folder, 'finanzas-antes-de-restaurar-x.db'), '')
    pruneBackups(folder)
    const files = readdirSync(folder)
    expect(files).toHaveLength(31)
    expect(files).not.toContain('finanzas-2026-01-01.db')
    expect(files).toContain('finanzas-antes-de-restaurar-x.db')
  })

  it('rechaza archivos que no son respaldos o son de una versión más nueva', () => {
    const junk = join(dir, 'basura.db')
    writeFileSync(junk, 'no soy sqlite')
    expect(() => validateBackupFile(junk)).toThrow(/no es un respaldo/)
    const future = join(dir, 'futuro.db')
    const db = new Database(future)
    db.exec('CREATE TABLE accounts (id); CREATE TABLE transactions (id); CREATE TABLE categories (id); PRAGMA user_version = 999')
    db.close()
    expect(() => validateBackupFile(future)).toThrow(/más nueva/)
  })

  it('restaura un respaldo y guarda antes una copia de lo actual', () => {
    const backup = writeBackup()
    expect(existsSync(backup)).toBe(true)
    api.createAccount({ name: 'Cuenta nueva', type: 'cash', openingBalance: 0, creditLimit: null, statementDay: null, dueDay: null })
    expect(api.listAccounts()).toHaveLength(3)

    restoreFrom(backup)
    expect(api.listAccounts().map((a) => a.name).sort()).toEqual(['Nómina', 'Visa, Oro'])
    expect(listBackups(backupFolder()).some((b) => b.name.startsWith('finanzas-antes-de-restaurar-'))).toBe(true)
  })
})
