import { describe, expect, it } from 'vitest'
import { buildSchedule, planProgress } from './installments'
import type { Installment } from './types'

describe('buildSchedule', () => {
  it('reparte en cuotas iguales y la suma cuadra con el total', () => {
    const s = buildSchedule(1000000, 3, '2026-11-05')
    expect(s.map((i) => i.amount)).toEqual([333333, 333333, 333334])
    expect(s.reduce((a, i) => a + i.amount, 0)).toBe(1000000)
  })

  it('genera una fecha por mes conservando el día y recortando fin de mes', () => {
    const s = buildSchedule(1200, 4, '2026-12-31')
    expect(s.map((i) => i.dueDate)).toEqual(['2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31'])
  })

  it('rechaza totales o meses inválidos', () => {
    expect(() => buildSchedule(0, 3, '2026-01-01')).toThrow()
    expect(() => buildSchedule(100, 0, '2026-01-01')).toThrow()
  })
})

describe('planProgress', () => {
  const inst = (n: number, dueDate: string, paidAt: string | null): Installment => ({
    id: n, planId: 1, number: n, dueDate, amount: 100, paidAt
  })

  it('calcula lo pagado, lo restante, lo vencido y la próxima cuota', () => {
    const list = [
      inst(1, '2026-08-05', '2026-08-01'),
      inst(2, '2026-09-05', null),
      inst(3, '2026-10-05', null),
      inst(4, '2026-11-05', null)
    ]
    const p = planProgress(list, '2026-10-17')
    expect(p).toMatchObject({ paidCount: 1, paidAmount: 100, remainingCount: 3, remainingAmount: 300, overdueCount: 2 })
    expect(p.nextDue?.number).toBe(4)
  })

  it('no tiene próxima cuota cuando todo está pagado', () => {
    expect(planProgress([inst(1, '2026-08-05', '2026-08-05')], '2026-10-17').nextDue).toBeNull()
  })
})
