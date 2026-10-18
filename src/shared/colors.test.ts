import { describe, expect, it } from 'vitest'
import { ACCOUNT_COLORS, isHexColor, nextAccountColor } from './colors'

describe('nextAccountColor', () => {
  it('elige el primer color libre', () => {
    expect(nextAccountColor([])).toBe(ACCOUNT_COLORS[0].hex)
    expect(nextAccountColor([ACCOUNT_COLORS[0].hex, ACCOUNT_COLORS[1].hex.toUpperCase()])).toBe(ACCOUNT_COLORS[2].hex)
  })
  it('cuando todos están usados, elige el menos repetido', () => {
    const all = ACCOUNT_COLORS.map((c) => c.hex)
    expect(nextAccountColor([...all, ...all.slice(0, 5)])).toBe(ACCOUNT_COLORS[5].hex)
  })
})

describe('isHexColor', () => {
  it('valida colores #rrggbb', () => {
    expect(isHexColor('#A1b2C3')).toBe(true)
    expect(isHexColor('red')).toBe(false)
    expect(isHexColor('#fff')).toBe(false)
  })
})
