import type {
  AccountInput,
  BackupInfo,
  CsvExportKind,
  Report,
  BudgetMonth,
  BudgetMoveInput,
  AccountWithBalance,
  Category,
  CategoryInput,
  InstallmentPlan,
  InstallmentPlanInput,
  Transaction,
  TransactionFilter,
  TransactionInput,
  TransferInput
} from './types'

/** Contrato entre la interfaz (renderer) y el proceso principal, que es quien toca la base de datos. */
export interface Api {
  listAccounts(): AccountWithBalance[]
  createAccount(input: AccountInput): number
  updateAccount(id: number, input: AccountInput): void
  setAccountArchived(id: number, archived: boolean): void

  listCategories(): Category[]
  createCategory(input: CategoryInput): number
  updateCategory(id: number, input: CategoryInput): void
  setCategoryArchived(id: number, archived: boolean): void

  listTransactions(filter: TransactionFilter): Transaction[]
  createTransaction(input: TransactionInput): number
  updateTransaction(id: number, input: TransactionInput): void
  createTransfer(input: TransferInput): number
  deleteTransaction(id: number): void
  /** Cambia solo las observaciones; funciona también en transferencias (ambos lados) y compras a MSI. */
  setTransactionNotes(id: number, notes: string): void

  listInstallmentPlans(): InstallmentPlan[]
  createInstallmentPlan(input: InstallmentPlanInput): number
  deleteInstallmentPlan(id: number): void
  setInstallmentPaid(id: number, paid: boolean): void
  markOverdueInstallmentsPaid(planId: number): void

  getBudgetMonth(month: string): BudgetMonth
  setAllocation(categoryId: number, month: string, amount: number): void
  moveBudget(input: BudgetMoveInput): void
  /** Copia lo asignado el mes anterior a las cajitas que aún no tienen asignación este mes. */
  copyPreviousMonthAllocations(month: string): number

  getReport(fromMonth: string, toMonth: string): Report

  getBackupInfo(): BackupInfo
  backupNow(): Promise<string>
  /** Abre un diálogo para elegir carpeta; devuelve null si se cancela. */
  chooseBackupFolder(): Promise<string | null>
  resetBackupFolder(): void
  openBackupFolder(): Promise<void>
  /** Con `fileName` restaura ese respaldo de la carpeta; sin él, pide un archivo. Siempre confirma antes. */
  restoreBackup(fileName?: string): Promise<boolean>
  /** Abre un diálogo para guardar; devuelve la ruta o null si se cancela. */
  exportCsv(kind: CsvExportKind, fromDate?: string, toDate?: string): Promise<string | null>
}

export type ApiMethod = keyof Api

export const API_METHODS = [
  'listAccounts',
  'createAccount',
  'updateAccount',
  'setAccountArchived',
  'listCategories',
  'createCategory',
  'updateCategory',
  'setCategoryArchived',
  'listTransactions',
  'createTransaction',
  'updateTransaction',
  'createTransfer',
  'deleteTransaction',
  'setTransactionNotes',
  'listInstallmentPlans',
  'createInstallmentPlan',
  'deleteInstallmentPlan',
  'setInstallmentPaid',
  'markOverdueInstallmentsPaid',
  'getBudgetMonth',
  'setAllocation',
  'moveBudget',
  'copyPreviousMonthAllocations',
  'getReport',
  'getBackupInfo',
  'backupNow',
  'chooseBackupFolder',
  'resetBackupFolder',
  'openBackupFolder',
  'restoreBackup',
  'exportCsv'
] as const satisfies readonly ApiMethod[]

/** Lo que ve el renderer: las mismas funciones, pero asíncronas. */
export type AsyncApi = {
  [K in ApiMethod]: (...args: Parameters<Api[K]>) => Promise<Awaited<ReturnType<Api[K]>>>
}
