import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import Database from 'better-sqlite3'
import { app, BrowserWindow, dialog, shell, type MessageBoxOptions } from 'electron'
import type { Api } from '@shared/api'
import { centsToCsv, toCsv, type CsvValue } from '@shared/csv'
import { today } from '@shared/dates'
import type { BackupFile, CsvExportKind } from '@shared/types'
import { closeDb, dbPath, getDb } from './db/connection'
import { MIGRATION_COUNT } from './db/migrations'
import { check, isIsoDate } from './db/validate'

type Row = Record<string, unknown>

/** Respaldos diarios automáticos: `finanzas-AAAA-MM-DD.db`. Solo estos se borran al rotar. */
const DAILY_BACKUP = /^finanzas-\d{4}-\d{2}-\d{2}\.db$/
export const BACKUPS_TO_KEEP = 30

// ---------- Ajustes ----------

function getSetting(key: string): string | null {
  const r = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as Row | undefined
  return (r?.value as string) ?? null
}

function setSetting(key: string, value: string | null): void {
  if (value === null) getDb().prepare('DELETE FROM settings WHERE key = ?').run(key)
  else getDb().prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(key, value)
}

const defaultBackupFolder = (): string => join(app.getPath('userData'), 'backups')

export function backupFolder(): string {
  return getSetting('backupFolder') ?? defaultBackupFolder()
}

// ---------- Respaldos ----------

/** Copia consistente de la base (incluye lo pendiente del WAL). Se escribe a un temporal y se renombra. */
export function writeBackup(folder = backupFolder(), name = `finanzas-${today()}.db`): string {
  mkdirSync(folder, { recursive: true })
  const target = join(folder, name)
  const tmp = `${target}.tmp`
  writeFileSync(tmp, getDb().serialize())
  renameSync(tmp, target)
  pruneBackups(folder)
  return target
}

export function pruneBackups(folder: string, keep = BACKUPS_TO_KEEP): void {
  const daily = readdirSync(folder).filter((f) => DAILY_BACKUP.test(f)).sort().reverse()
  for (const f of daily.slice(keep)) unlinkSync(join(folder, f))
}

/** Respaldo del día. Al abrir solo se crea si no existe; al cerrar se sobrescribe con lo capturado en el día. */
export function autoBackup({ overwrite }: { overwrite: boolean }): void {
  try {
    const folder = backupFolder()
    if (!overwrite && existsSync(join(folder, `finanzas-${today()}.db`))) return
    writeBackup(folder)
  } catch (e) {
    // Un respaldo fallido (p. ej. la carpeta de la nube no está disponible) no debe impedir usar la app.
    console.error('No se pudo crear el respaldo automático:', e)
  }
}

export function listBackups(folder = backupFolder()): BackupFile[] {
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .filter((f) => f.startsWith('finanzas-') && f.endsWith('.db'))
    .map((name) => {
      const st = statSync(join(folder, name))
      return { name, size: st.size, modifiedAt: st.mtime.toISOString() }
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
}

/** Revisa que el archivo sea una base de esta app y no de una versión más nueva. */
export function validateBackupFile(path: string): void {
  let db: Database.Database | null = null
  try {
    db = new Database(path, { readonly: true, fileMustExist: true })
    const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Row[]).map((r) => r.name)
    check(['accounts', 'transactions', 'categories'].every((t) => tables.includes(t)), 'El archivo no es un respaldo de Finanzas')
    const version = db.pragma('user_version', { simple: true }) as number
    check(version <= MIGRATION_COUNT, 'El respaldo es de una versión más nueva de la app')
  } catch (e) {
    if (e instanceof Error && /Finanzas|versión/.test(e.message)) throw e
    throw new Error('El archivo no es un respaldo válido de Finanzas')
  } finally {
    db?.close()
  }
}

/** Reemplaza la base actual por el respaldo, guardando antes una copia de seguridad de la actual. */
export function restoreFrom(path: string): void {
  validateBackupFile(path)
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  writeBackup(backupFolder(), `finanzas-antes-de-restaurar-${stamp}.db`)
  const target = dbPath()
  closeDb()
  for (const extra of [`${target}-wal`, `${target}-shm`]) if (existsSync(extra)) unlinkSync(extra)
  copyFileSync(path, target)
  getDb() // reabre y aplica migraciones si el respaldo es de una versión anterior
}

// ---------- CSV ----------

export function buildCsv(kind: CsvExportKind, fromDate?: string, toDate?: string): string {
  const db = getDb()
  if (kind === 'accounts') {
    const rows = db
      .prepare(
        `SELECT a.name, a.type, a.credit_limit, a.archived, a.notes,
           a.opening_balance + COALESCE((SELECT SUM(amount) FROM transactions WHERE account_id = a.id), 0) AS balance,
           COALESCE((SELECT SUM(i.amount) FROM installments i JOIN installment_plans p ON p.id = i.plan_id
                     WHERE p.account_id = a.id AND i.paid_at IS NULL), 0) AS msi
         FROM accounts a ORDER BY a.archived, a.type, a.name`
      )
      .all() as Row[]
    const TYPE: Record<string, string> = { debit: 'Débito', credit: 'Crédito', cash: 'Efectivo' }
    return toCsv(
      ['Cuenta', 'Tipo', 'Saldo', 'Límite de crédito', 'Deuda en MSI', 'Archivada', 'Observaciones'],
      rows.map((r) => [
        r.name as string,
        TYPE[r.type as string],
        centsToCsv(r.balance as number),
        r.credit_limit === null ? null : centsToCsv(r.credit_limit as number),
        r.type === 'credit' ? centsToCsv(r.msi as number) : null,
        r.archived ? 'Sí' : 'No',
        r.notes as string
      ])
    )
  }

  if (kind === 'installments') {
    const rows = db
      .prepare(
        `SELECT p.description, a.name AS account, c.name AS category, p.purchase_date, p.total_amount, p.months,
           i.number, i.due_date, i.amount, i.paid_at
         FROM installments i
         JOIN installment_plans p ON p.id = i.plan_id
         JOIN accounts a ON a.id = p.account_id
         LEFT JOIN categories c ON c.id = p.category_id
         ORDER BY p.purchase_date, p.id, i.number`
      )
      .all() as Row[]
    return toCsv(
      ['Compra', 'Tarjeta', 'Categoría', 'Fecha de compra', 'Total', 'Meses', 'Cuota', 'Vence', 'Monto de la cuota', 'Pagada el'],
      rows.map((r) => [
        r.description as string,
        r.account as string,
        r.category as string | null,
        r.purchase_date as string,
        centsToCsv(r.total_amount as number),
        r.months as number,
        `${r.number}/${r.months}`,
        r.due_date as string,
        centsToCsv(r.amount as number),
        r.paid_at as string | null
      ])
    )
  }

  check(fromDate === undefined || isIsoDate(fromDate), 'Fecha inicial inválida')
  check(toDate === undefined || isIsoDate(toDate), 'Fecha final inválida')
  const rows = db
    .prepare(
      `SELECT t.date, t.amount, t.description, t.notes, t.transfer_id, t.installment_plan_id,
         a.name AS account, a.type AS account_type, c.name AS category, c.group_name,
         (SELECT a2.name FROM transactions t2 JOIN accounts a2 ON a2.id = t2.account_id
           WHERE t2.transfer_id = t.transfer_id AND t2.id <> t.id) AS counterpart
       FROM transactions t
       JOIN accounts a ON a.id = t.account_id
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE (@from IS NULL OR t.date >= @from) AND (@to IS NULL OR t.date <= @to)
       ORDER BY t.date, t.id`
    )
    .all({ from: fromDate ?? null, to: toDate ?? null }) as Row[]
  const kindOf = (r: Row): string =>
    r.installment_plan_id
      ? 'Compra a MSI'
      : r.transfer_id
        ? r.account_type === 'credit' && (r.amount as number) > 0
          ? 'Pago de tarjeta'
          : 'Transferencia'
        : (r.amount as number) < 0
          ? 'Gasto'
          : 'Ingreso'
  return toCsv(
    ['Fecha', 'Cuenta', 'Tipo', 'Categoría', 'Grupo', 'Descripción', 'Monto', 'Cuenta relacionada', 'Observaciones'],
    rows.map((r): CsvValue[] => [
      r.date as string,
      r.account as string,
      kindOf(r),
      r.category as string | null,
      r.group_name as string | null,
      r.description as string,
      centsToCsv(r.amount as number),
      r.counterpart as string | null,
      r.notes as string
    ])
  )
}

// ---------- Diálogos ----------

const parentWindow = (): BrowserWindow | undefined => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

async function confirm(options: MessageBoxOptions): Promise<boolean> {
  const win = parentWindow()
  const { response } = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options)
  return response === 1
}

const CSV_NAMES: Record<CsvExportKind, string> = {
  transactions: 'movimientos',
  accounts: 'cuentas',
  installments: 'meses-sin-intereses'
}

export const dataApi: Pick<
  Api,
  'getBackupInfo' | 'backupNow' | 'chooseBackupFolder' | 'resetBackupFolder' | 'openBackupFolder' | 'restoreBackup' | 'exportCsv'
> = {
  getBackupInfo() {
    const folder = backupFolder()
    return { folder, isDefaultFolder: folder === defaultBackupFolder(), dbPath: dbPath(), backups: listBackups(folder) }
  },

  async backupNow() {
    return writeBackup()
  },

  async chooseBackupFolder() {
    const win = parentWindow()
    const options: Electron.OpenDialogOptions = {
      title: 'Carpeta para los respaldos',
      buttonLabel: 'Usar esta carpeta',
      properties: ['openDirectory', 'createDirectory']
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    const folder = result.filePaths[0]
    writeBackup(folder) // comprueba que se puede escribir antes de guardar el ajuste
    setSetting('backupFolder', folder)
    return folder
  },

  resetBackupFolder() {
    setSetting('backupFolder', null)
  },

  async openBackupFolder() {
    const folder = backupFolder()
    mkdirSync(folder, { recursive: true })
    const error = await shell.openPath(folder)
    check(!error, error)
  },

  async restoreBackup(fileName) {
    let path: string
    if (fileName) {
      // Solo archivos de la carpeta de respaldos; basename evita rutas como ../../algo.
      path = join(backupFolder(), basename(fileName))
      check(existsSync(path), 'El respaldo ya no existe')
    } else {
      const win = parentWindow()
      const options: Electron.OpenDialogOptions = {
        title: 'Elige un respaldo',
        filters: [{ name: 'Respaldo de Finanzas', extensions: ['db'] }],
        properties: ['openFile']
      }
      const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
      if (result.canceled || !result.filePaths[0]) return false
      path = result.filePaths[0]
    }
    validateBackupFile(path)
    const ok = await confirm({
      type: 'warning',
      title: 'Restaurar respaldo',
      message: `¿Restaurar «${basename(path)}»?`,
      detail: 'Todos tus datos actuales se reemplazarán por los del respaldo. Antes se guardará una copia de lo que tienes ahora en la carpeta de respaldos.',
      buttons: ['Cancelar', 'Restaurar'],
      defaultId: 0,
      cancelId: 0
    })
    if (!ok) return false
    restoreFrom(path)
    return true
  },

  async exportCsv(kind, fromDate, toDate) {
    check(kind in CSV_NAMES, 'Exportación inválida')
    const csv = buildCsv(kind, fromDate || undefined, toDate || undefined)
    const win = parentWindow()
    const options: Electron.SaveDialogOptions = {
      title: 'Exportar a CSV',
      defaultPath: join(app.getPath('documents'), `${CSV_NAMES[kind]}-${today()}.csv`),
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    }
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    writeFileSync(result.filePath, csv, 'utf8')
    return result.filePath
  }
}
