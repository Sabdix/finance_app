import { describe, expect, it } from 'vitest'
import { rollBudget } from './budget'

describe('rollBudget', () => {
  it('arrastra lo que sobra al mes siguiente', () => {
    const r = rollBudget(
      [1],
      [{ categoryId: 1, month: '2026-08', amount: 500 }, { categoryId: 1, month: '2026-10', amount: 300 }],
      [{ categoryId: 1, month: '2026-08', amount: -200 }, { categoryId: 1, month: '2026-10', amount: -100 }],
      '2026-10'
    )
    expect(r.get(1)).toEqual({ carryover: 300, assigned: 300, activity: -100, available: 500 })
  })

  it('arrastra también un sobregiro', () => {
    const r = rollBudget([1], [], [{ categoryId: 1, month: '2026-09', amount: -50 }], '2026-10')
    expect(r.get(1)).toEqual({ carryover: -50, assigned: 0, activity: 0, available: -50 })
  })

  it('ignora meses futuros y devuelve ceros para cajitas sin datos', () => {
    const r = rollBudget([1, 2], [{ categoryId: 1, month: '2026-11', amount: 999 }], [], '2026-10')
    expect(r.get(1)?.available).toBe(0)
    expect(r.get(2)).toEqual({ carryover: 0, assigned: 0, activity: 0, available: 0 })
  })

  it('cruza de año', () => {
    const r = rollBudget([1], [{ categoryId: 1, month: '2025-12', amount: 100 }], [], '2026-01')
    expect(r.get(1)?.carryover).toBe(100)
  })
})
