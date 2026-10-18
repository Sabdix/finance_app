import { describe, expect, it } from 'vitest'
import { centsToCsv, toCsv } from './csv'

describe('centsToCsv', () => {
  it('siempre dos decimales, punto decimal y sin miles', () => {
    expect([123456, 5, -5, 0, -100000].map(centsToCsv)).toEqual(['1234.56', '0.05', '-0.05', '0.00', '-1000.00'])
  })
})

describe('toCsv', () => {
  it('escapa comas, comillas y saltos de línea, con BOM y CRLF', () => {
    const csv = toCsv(['a', 'b'], [['x, y', 'dijo "hola"'], ['línea\nnueva', null]])
    expect(csv).toBe('﻿a,b\r\n"x, y","dijo ""hola"""\r\n"línea\nnueva",\r\n')
  })
  it('neutraliza fórmulas pero deja pasar números negativos', () => {
    expect(toCsv(['x'], [['=SUM(A1)'], ['-12.50'], ['@x'], [-3]])).toBe("﻿x\r\n'=SUM(A1)\r\n-12.50\r\n'@x\r\n-3\r\n")
  })
})
