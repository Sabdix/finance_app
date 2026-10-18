import { describe, expect, it } from 'vitest'
import { centsToInput, formatMoney, isMoneyDraft, parseMoney } from './money'

describe('formatMoney', () => {
  it('siempre muestra dos decimales', () => {
    expect(formatMoney(100)).toBe('$1.00')
    expect(formatMoney(123450)).toBe('$1,234.50')
    expect(formatMoney(-5)).toBe('-$0.05')
    expect(formatMoney(0)).toBe('$0.00')
  })
})

describe('centsToInput', () => {
  it('da texto editable con dos decimales y separador de miles', () => {
    expect(centsToInput(123456)).toBe('1,234.56')
    expect(centsToInput(1000)).toBe('10.00')
    expect(centsToInput(-20000)).toBe('-200.00')
  })
  it('ida y vuelta con parseMoney', () => {
    for (const c of [0, 1, 99, 100, 123456, 100000000]) expect(parseMoney(centsToInput(c))).toBe(c)
    expect(parseMoney(centsToInput(-20000), { allowNegative: true })).toBe(-20000)
  })
})

describe('parseMoney', () => {
  it('acepta separadores de miles, símbolo y hasta dos decimales', () => {
    expect(parseMoney('$1,234.5')).toBe(123450)
    expect(parseMoney('99')).toBe(9900)
    expect(parseMoney('0.07')).toBe(7)
  })
  it('rechaza texto inválido y más de dos decimales', () => {
    expect(parseMoney('abc')).toBeNull()
    expect(parseMoney('1.234')).toBeNull()
    expect(parseMoney('')).toBeNull()
  })
  it('acepta negativos solo cuando se pide', () => {
    expect(parseMoney('-5.5')).toBeNull()
    expect(parseMoney('-5.5', { allowNegative: true })).toBe(-550)
  })
})

describe('isMoneyDraft', () => {
  it('permite escribir montos parciales pero no un tercer decimal', () => {
    for (const ok of ['', '1', '1,2', '12.', '12.3', '12.34', '$ 5']) expect(isMoneyDraft(ok)).toBe(true)
    for (const bad of ['12.345', 'a', '1.2.3', '-1']) expect(isMoneyDraft(bad)).toBe(false)
    expect(isMoneyDraft('-1.5', { allowNegative: true })).toBe(true)
  })
})
