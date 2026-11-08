import { describe, expect, it } from 'vitest'
import { filterOptions, foldText } from './search'

const options = [
  { label: 'Supermercado', group: 'Comida' },
  { label: 'Restaurantes', group: 'Comida' },
  { label: 'Gasolina', group: 'Transporte' },
  { label: 'BBVA Nómina', detail: '$1,000.00', keywords: 'débito' },
  { label: 'Visa Oro', detail: 'deuda $500.00', keywords: 'tarjeta crédito' }
]
const labels = (q: string): string[] => filterOptions(options, q).map((o) => o.label)

describe('búsqueda en listas', () => {
  it('quita acentos y mayúsculas', () => {
    expect(foldText('Nómina CRÉDITO')).toBe('nomina credito')
  })

  it('sin búsqueda devuelve todo', () => {
    expect(labels('  ')).toHaveLength(options.length)
  })

  it('encuentra por parte del nombre sin importar acentos', () => {
    expect(labels('nomi')).toEqual(['BBVA Nómina'])
    expect(labels('RESTA')).toEqual(['Restaurantes'])
  })

  it('busca también en grupo y palabras clave', () => {
    expect(labels('comida')).toEqual(['Supermercado', 'Restaurantes'])
    expect(labels('credito')).toEqual(['Visa Oro'])
  })

  it('exige todas las palabras, en cualquier orden', () => {
    expect(labels('comida super')).toEqual(['Supermercado'])
    expect(labels('oro visa')).toEqual(['Visa Oro'])
    expect(labels('comida gasolina')).toEqual([])
  })
})
