import { describe, expect, it } from 'vitest'
import { buildReport } from './report'

describe('buildReport', () => {
  const months = ['2026-08', '2026-09', '2026-10']
  const cats = new Map([
    [1, { name: 'Súper', groupName: 'Comida' }],
    [2, { name: 'Gasolina', groupName: 'Transporte' }],
    [3, { name: 'Ropa', groupName: 'Personal' }]
  ])

  it('suma el gasto por categoría y mes, descuenta reembolsos y ordena por total', () => {
    const r = buildReport(
      months,
      cats,
      [
        { categoryId: 1, month: '2026-08', amount: -1000 },
        { categoryId: 1, month: '2026-10', amount: -500 },
        { categoryId: 2, month: '2026-09', amount: -3000 },
        { categoryId: 2, month: '2026-09', amount: 200 },
        { categoryId: null, month: '2026-10', amount: -50 },
        { categoryId: 3, month: '2026-07', amount: -9999 }
      ],
      [{ month: '2026-09', amount: 10000 }, { month: '2026-06', amount: 1 }]
    )
    expect(r.categories.map((c) => [c.name, c.total])).toEqual([
      ['Gasolina', 2800],
      ['Súper', 1500],
      ['Sin categoría', 50]
    ])
    expect(r.categories[1].amounts).toEqual([1000, 0, 500])
    expect(r.spending).toEqual([1000, 2800, 550])
    expect(r.income).toEqual([0, 10000, 0])
  })

  it('omite categorías cuyo gasto neto es cero en todos los meses', () => {
    const r = buildReport(months, cats, [
      { categoryId: 1, month: '2026-08', amount: -100 },
      { categoryId: 1, month: '2026-08', amount: 100 }
    ], [])
    expect(r.categories).toEqual([])
  })
})
