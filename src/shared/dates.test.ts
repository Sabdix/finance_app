import { describe, expect, it } from 'vitest'
import { addMonths, firstDueDateFor } from './dates'

describe('addMonths', () => {
  it('cruza de año y recorta fin de mes', () => {
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28')
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15')
  })
})

describe('firstDueDateFor', () => {
  // Corte el día 20, pago el día 10 del mes siguiente.
  it('una compra antes del corte se paga en el siguiente día de pago', () => {
    expect(firstDueDateFor('2026-10-17', 20, 10)).toBe('2026-11-10')
  })
  it('una compra después del corte se va al siguiente estado de cuenta', () => {
    expect(firstDueDateFor('2026-10-21', 20, 10)).toBe('2026-12-10')
  })
  it('funciona cuando el pago cae en el mismo mes del corte', () => {
    expect(firstDueDateFor('2026-10-02', 5, 25)).toBe('2026-10-25')
  })
})
