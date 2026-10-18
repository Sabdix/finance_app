// Todos los montos son enteros en centavos. Las fechas son 'YYYY-MM-DD' en hora local.

export type AccountType = 'debit' | 'credit' | 'cash'

export interface Account {
  id: number
  name: string
  type: AccountType
  /** Saldo al dar de alta la cuenta. En crédito, la deuda inicial se guarda en negativo. */
  openingBalance: number
  creditLimit: number | null
  statementDay: number | null
  dueDay: number | null
  /** Color para identificar la cuenta, '#rrggbb'. */
  color: string
  /** Observaciones libres (puede tener varias líneas). */
  notes: string
  archived: boolean
}

export interface AccountWithBalance extends Account {
  /** Saldo actual. En crédito es negativo cuando se debe dinero. */
  balance: number
  /** Cuotas de meses sin intereses aún no pagadas (ya incluidas en `balance`). */
  msiPending: number
}

/** Sin `color`, al crear se elige uno libre de la paleta y al editar se conserva el actual. */
export type AccountInput = Omit<Account, 'id' | 'archived' | 'color' | 'notes'> & { color?: string; notes?: string }

/** `card_payment` es la cajita automática de cada tarjeta de crédito; no se crea ni edita a mano. */
export type CategoryKind = 'expense' | 'income' | 'card_payment'

export interface Category {
  id: number
  name: string
  groupName: string
  kind: CategoryKind
  /** Solo en cajitas de pago de tarjeta: la tarjeta a la que pertenecen. */
  accountId: number | null
  archived: boolean
}

export interface CategoryInput {
  name: string
  groupName: string
  kind: 'expense' | 'income'
}

export interface Transaction {
  id: number
  date: string
  accountId: number
  accountName: string
  accountColor: string
  /** Positivo = entrada, negativo = salida. */
  amount: number
  categoryId: number | null
  categoryName: string | null
  description: string
  /** Observaciones libres (puede tener varias líneas). */
  notes: string
  transferId: number | null
  /** Cuenta del otro lado de una transferencia. */
  counterpartAccountName: string | null
  installmentPlanId: number | null
}

export interface TransactionInput {
  kind: 'expense' | 'income'
  date: string
  accountId: number
  /** Monto positivo; el signo lo pone `kind`. */
  amount: number
  categoryId: number | null
  description: string
  notes?: string
}

export interface TransferInput {
  date: string
  fromAccountId: number
  toAccountId: number
  amount: number
  description: string
  notes?: string
}

export interface TransactionFilter {
  accountId?: number
  limit?: number
}

export interface Installment {
  id: number
  planId: number
  number: number
  dueDate: string
  amount: number
  paidAt: string | null
}

export interface InstallmentPlan {
  id: number
  accountId: number
  accountName: string
  accountColor: string
  categoryId: number | null
  categoryName: string | null
  description: string
  purchaseDate: string
  totalAmount: number
  months: number
  installments: Installment[]
}

export interface InstallmentPlanInput {
  accountId: number
  categoryId: number | null
  description: string
  purchaseDate: string
  totalAmount: number
  months: number
  firstDueDate: string
}

export interface BudgetRow {
  categoryId: number
  name: string
  groupName: string
  kind: 'expense' | 'card_payment'
  carryover: number
  assigned: number
  activity: number
  available: number
  /** Solo en pagos de tarjeta: lo que se debe hoy en esa tarjeta. */
  cardDebt: number | null
  /** Solo en pagos de tarjeta: el color de la tarjeta. */
  accountColor: string | null
}

export interface BudgetMonth {
  month: string
  /** Dinero que entró y aún no tiene cajita. Es global, no por mes. */
  readyToAssign: number
  /** Entradas del mes que alimentan "Por asignar". */
  income: number
  rows: BudgetRow[]
}

export interface BudgetMoveInput {
  month: string
  /** null = "Por asignar". */
  fromCategoryId: number | null
  toCategoryId: number | null
  amount: number
}

export interface ReportCategory {
  /** null = gastos sin categoría. */
  categoryId: number | null
  name: string
  groupName: string
  /** Gasto neto por mes (positivo = gasto), en el orden de `Report.months`. */
  amounts: number[]
  total: number
}

export interface Report {
  months: string[]
  income: number[]
  spending: number[]
  categories: ReportCategory[]
}

export interface BackupFile {
  name: string
  size: number
  modifiedAt: string
}

export interface BackupInfo {
  folder: string
  isDefaultFolder: boolean
  dbPath: string
  backups: BackupFile[]
}

export type CsvExportKind = 'transactions' | 'accounts' | 'installments'
