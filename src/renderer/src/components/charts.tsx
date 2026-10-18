import { useEffect, useRef, useState } from 'react'
import { formatMonth, formatMonthShort } from '@shared/dates'
import { formatMoney } from '@shared/money'

// Colores validados con el validador de paleta (CVD y contraste) sobre fondo claro.
export const SERIES = { income: '#2a78d6', spending: '#eb6834' }
const GRID = '#e2e8f0'
const INK_MUTED = '#64748b'

/** Rampa secuencial (un solo tono, claro → oscuro) para el mapa de calor. */
export const HEAT_RAMP = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95']
/** Desde este paso el texto encima debe ser blanco para que se lea. */
export const HEAT_DARK_FROM = 6

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

/** Paso "bonito" para el eje: 1, 2, 2.5 o 5 por potencia de 10, en pesos enteros. */
function niceScale(maxCents: number, ticks = 4): { max: number; step: number } {
  if (maxCents <= 0) return { max: 100000, step: 25000 }
  const raw = maxCents / 100 / ticks
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)! * 100
  return { max: Math.ceil(maxCents / step) * step, step }
}

/** Columna con la punta redondeada (4px) y la base recta sobre el eje. */
function columnPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, h, w / 2)
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}

export function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-600">
      <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: color }} aria-hidden />
      {label}
    </span>
  )
}

export function IncomeSpendingChart({ months, income, spending }: { months: string[]; income: number[]; spending: number[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const height = 260
  const m = { top: 12, right: 8, bottom: 28, left: 104 }
  const plotW = Math.max(0, width - m.left - m.right)
  const plotH = height - m.top - m.bottom
  const { max, step } = niceScale(Math.max(0, ...income, ...spending))
  const y = (v: number): number => m.top + plotH - (Math.max(0, v) / max) * plotH
  const band = months.length ? plotW / months.length : 0
  const barW = Math.max(2, Math.min(24, (band - 12) / 2 - 1))
  const labelEvery = band < 44 ? 2 : 1
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step)

  return (
    <div>
      <div className="mb-3 flex gap-4">
        <LegendItem color={SERIES.income} label="Ingresos" />
        <LegendItem color={SERIES.spending} label="Gastos" />
      </div>
      <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label="Ingresos y gastos por mes">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
                <text x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={INK_MUTED} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatMoney(t)}
                </text>
              </g>
            ))}
            {months.map((month, i) => {
              const cx = m.left + band * i + band / 2
              return (
                <g key={month}>
                  {hover === i && <rect x={m.left + band * i} y={m.top} width={band} height={plotH} fill="#f1f5f9" />}
                  {income[i] > 0 && (
                    <path d={columnPath(cx - barW - 1, y(income[i]), barW, m.top + plotH - y(income[i]))} fill={SERIES.income} />
                  )}
                  {spending[i] > 0 && (
                    <path d={columnPath(cx + 1, y(spending[i]), barW, m.top + plotH - y(spending[i]))} fill={SERIES.spending} />
                  )}
                  {i % labelEvery === 0 && (
                    <text x={cx} y={height - 8} textAnchor="middle" fontSize={11} fill={INK_MUTED}>
                      {formatMonthShort(month)}
                    </text>
                  )}
                  {/* Zona de hover/foco: toda la columna del mes, no solo las barras. */}
                  <rect
                    x={m.left + band * i}
                    y={m.top}
                    width={band}
                    height={plotH}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${formatMonth(month)}: ingresos ${formatMoney(income[i])}, gastos ${formatMoney(spending[i])}`}
                    onPointerEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    style={{ outline: 'none' }}
                  />
                </g>
              )
            })}
            <line x1={m.left} x2={width - m.right} y1={m.top + plotH} y2={m.top + plotH} stroke="#cbd5e1" strokeWidth={1} />
          </svg>
        )}
        {hover !== null && (
          <ChartTooltip
            left={Math.min(Math.max(m.left + band * hover + band / 2, 120), width - 120)}
            title={formatMonth(months[hover])}
            rows={[
              { color: SERIES.income, label: 'Ingresos', value: income[hover] },
              { color: SERIES.spending, label: 'Gastos', value: spending[hover] },
              { label: 'Diferencia', value: income[hover] - spending[hover] }
            ]}
          />
        )}
      </div>
    </div>
  )
}

function ChartTooltip({
  left,
  title,
  rows
}: {
  left: number
  title: string
  rows: { color?: string; label: string; value: number }[]
}) {
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 w-56 -translate-x-1/2 rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200"
      style={{ left }}
    >
      <div className="mb-1 font-medium text-slate-500">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 py-0.5">
          {r.color ? <span className="h-0.5 w-3 rounded" style={{ backgroundColor: r.color }} /> : <span className="w-3" />}
          <span className="font-semibold text-slate-900 tabular-nums">{formatMoney(r.value)}</span>
          <span className="text-slate-500">{r.label}</span>
        </div>
      ))}
    </div>
  )
}
