import { addMonths } from './dates'
import type { Installment } from './types'

export interface ScheduledInstallment {
  number: number
  dueDate: string
  amount: number
}

/**
 * Reparte una compra a meses sin intereses en cuotas iguales.
 * Los centavos que no dividen exacto se cargan a la última cuota, para que la suma cuadre con el total.
 */
export function buildSchedule(total: number, months: number, firstDueDate: string): ScheduledInstallment[] {
  if (!Number.isInteger(total) || total <= 0) throw new Error('El total debe ser mayor a cero')
  if (!Number.isInteger(months) || months < 1) throw new Error('Los meses deben ser al menos 1')
  const base = Math.floor(total / months)
  const day = Number(firstDueDate.slice(8, 10))
  return Array.from({ length: months }, (_, i) => ({
    number: i + 1,
    dueDate: addMonths(firstDueDate, i, day),
    amount: i === months - 1 ? total - base * (months - 1) : base
  }))
}

export interface PlanProgress {
  paidCount: number
  paidAmount: number
  remainingCount: number
  remainingAmount: number
  /** Cuotas vencidas sin marcar como pagadas. */
  overdueCount: number
  nextDue: Installment | null
}

export function planProgress(installments: Installment[], asOf: string): PlanProgress {
  const paid = installments.filter((i) => i.paidAt !== null)
  const pending = installments.filter((i) => i.paidAt === null)
  const sum = (list: Installment[]): number => list.reduce((acc, i) => acc + i.amount, 0)
  return {
    paidCount: paid.length,
    paidAmount: sum(paid),
    remainingCount: pending.length,
    remainingAmount: sum(pending),
    overdueCount: pending.filter((i) => i.dueDate < asOf).length,
    nextDue: pending.find((i) => i.dueDate >= asOf) ?? pending[0] ?? null
  }
}
