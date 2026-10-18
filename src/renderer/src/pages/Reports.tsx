import { useState } from 'react'
import { currentMonth, formatMonth, formatMonthShort, shiftMonth } from '@shared/dates'
import { formatMoney } from '@shared/money'
import type { Report, ReportCategory } from '@shared/types'
import { HEAT_DARK_FROM, HEAT_RAMP, IncomeSpendingChart, SERIES } from '../components/charts'
import { Card, Empty, PageHeader, Stat } from '../components/ui'
import { useApi } from '../lib/data'

type Preset = 'last6' | 'last12' | 'thisYear' | 'lastYear'

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'last6', label: 'Últimos 6 meses' },
  { id: 'last12', label: 'Últimos 12 meses' },
  { id: 'thisYear', label: 'Este año' },
  { id: 'lastYear', label: 'Año pasado' }
]

function presetRange(p: Preset): [string, string] {
  const now = currentMonth()
  const year = Number(now.slice(0, 4))
  switch (p) {
    case 'last6':
      return [shiftMonth(now, -5), now]
    case 'last12':
      return [shiftMonth(now, -11), now]
    case 'thisYear':
      return [`${year}-01`, now]
    case 'lastYear':
      return [`${year - 1}-01`, `${year - 1}-12`]
  }
}

const TOP_N = 8

export function ReportsPage() {
  const [preset, setPreset] = useState<Preset>('last6')
  const [from, to] = presetRange(preset)
  const report = useApi(() => window.api.getReport(from, to), [from, to])

  return (
    <>
      <PageHeader title="Reportes" subtitle="Cómo entra y sale tu dinero mes con mes" />

      <div className="mb-6 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm" role="radiogroup" aria-label="Periodo">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={preset === p.id}
            onClick={() => setPreset(p.id)}
            className={`rounded-md px-3 py-1.5 font-medium ${preset === p.id ? 'bg-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {report && <ReportBody report={report} />}
    </>
  )
}

function ReportBody({ report }: { report: Report }) {
  const totalIncome = report.income.reduce((a, b) => a + b, 0)
  const totalSpending = report.spending.reduce((a, b) => a + b, 0)
  const net = totalIncome - totalSpending
  const n = report.months.length

  if (totalIncome === 0 && totalSpending === 0) return <Empty>No hay ingresos ni gastos en este periodo.</Empty>

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Ingresos" cents={totalIncome} />
        <Stat label="Gastos" cents={totalSpending} />
        <Stat label="Diferencia" cents={net} tone={net < 0 ? 'bad' : 'good'} />
        <Stat label="Gasto promedio al mes" cents={Math.round(totalSpending / n)} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <h2 className="mb-1 font-semibold">Ingresos y gastos por mes</h2>
          <p className="mb-4 text-xs text-slate-500">Las compras a meses cuentan con la cuota de cada mes.</p>
          <IncomeSpendingChart months={report.months} income={report.income} spending={report.spending} />
        </Card>
        <Card className="xl:col-span-2">
          <h2 className="mb-4 font-semibold">Categorías con más gasto</h2>
          <TopCategories categories={report.categories} total={totalSpending} />
        </Card>
      </div>

      <Card className="p-0">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="font-semibold">Gasto por categoría y mes</h2>
          <HeatLegend />
        </div>
        <CategoryTable report={report} />
      </Card>
    </>
  )
}

function TopCategories({ categories, total }: { categories: ReportCategory[]; total: number }) {
  const positive = categories.filter((c) => c.total > 0)
  const top = positive.slice(0, TOP_N)
  const rest = positive.slice(TOP_N).reduce((s, c) => s + c.total, 0)
  const items = rest > 0 ? [...top.map((c) => ({ name: c.name, total: c.total })), { name: 'Otras', total: rest }] : top
  const max = Math.max(1, ...items.map((i) => i.total))

  if (items.length === 0) return <p className="text-sm text-slate-500">Sin gastos en el periodo.</p>
  return (
    <ul className="space-y-3 text-sm">
      {items.map((c) => (
        <li key={c.name}>
          <div className="mb-1 flex justify-between gap-2">
            <span className="truncate">{c.name}</span>
            <span className="shrink-0 tabular-nums">
              {formatMoney(c.total)} <span className="text-xs text-slate-500">{total > 0 ? Math.round((c.total / total) * 100) : 0}%</span>
            </span>
          </div>
          <div className="h-2">
            <div className="h-full rounded-r" style={{ width: `${(c.total / max) * 100}%`, backgroundColor: SERIES.income }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function heatStyle(value: number, max: number): React.CSSProperties {
  if (value <= 0 || max <= 0) return {}
  const step = Math.min(HEAT_RAMP.length - 1, Math.floor((value / max) * (HEAT_RAMP.length - 1)))
  return { backgroundColor: HEAT_RAMP[step], color: step >= HEAT_DARK_FROM ? '#ffffff' : '#0f172a' }
}

function HeatLegend() {
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-500" aria-hidden>
      Menos
      <span className="flex">
        {HEAT_RAMP.filter((_, i) => i % 2 === 0).map((c) => (
          <span key={c} className="h-2.5 w-4" style={{ backgroundColor: c }} />
        ))}
      </span>
      Más
    </div>
  )
}

function CategoryTable({ report }: { report: Report }) {
  const max = Math.max(0, ...report.categories.flatMap((c) => c.amounts))
  const n = report.months.length
  const cell = 'px-3 py-2 text-right whitespace-nowrap tabular-nums'
  const sticky = 'sticky left-0 z-10 bg-white px-5 py-2 text-left whitespace-nowrap'

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="border-y border-slate-200 text-slate-500">
          <tr>
            <th className={`${sticky} font-medium`}>Categoría</th>
            {report.months.map((m) => (
              <th key={m} className={`${cell} font-medium`} title={formatMonth(m)}>
                {formatMonthShort(m)}
              </th>
            ))}
            <th className={`${cell} font-semibold text-slate-700`}>Total</th>
            <th className={`${cell} pr-5 font-medium`}>Promedio</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {report.categories.map((c) => (
            <tr key={c.categoryId ?? 'none'}>
              <td className={sticky}>
                {c.name}
                <span className="ml-1 text-slate-400">{c.categoryId !== null && c.groupName}</span>
              </td>
              {c.amounts.map((v, i) => (
                <td
                  key={report.months[i]}
                  className={cell}
                  style={heatStyle(v, max)}
                  title={`${c.name} · ${formatMonth(report.months[i])}: ${formatMoney(v)}`}
                >
                  {v === 0 ? <span className="text-slate-300">—</span> : formatMoney(v)}
                </td>
              ))}
              <td className={`${cell} font-semibold`}>{formatMoney(c.total)}</td>
              <td className={`${cell} pr-5 text-slate-600`}>{formatMoney(Math.round(c.total / n))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-slate-200 font-medium">
          <SummaryRow label="Total gastos" values={report.spending} n={n} />
          <SummaryRow label="Ingresos" values={report.income} n={n} />
          <SummaryRow label="Diferencia" values={report.income.map((v, i) => v - report.spending[i])} n={n} signed />
        </tfoot>
      </table>
    </div>
  )
}

function SummaryRow({ label, values, n, signed = false }: { label: string; values: number[]; n: number; signed?: boolean }) {
  const total = values.reduce((a, b) => a + b, 0)
  const tone = (v: number): string => (signed && v < 0 ? 'text-rose-600' : '')
  const cell = 'px-3 py-2 text-right whitespace-nowrap tabular-nums'
  return (
    <tr>
      <td className="sticky left-0 z-10 bg-white px-5 py-2 text-left">{label}</td>
      {values.map((v, i) => (
        <td key={i} className={`${cell} ${tone(v)}`}>
          {formatMoney(v)}
        </td>
      ))}
      <td className={`${cell} font-semibold ${tone(total)}`}>{formatMoney(total)}</td>
      <td className={`${cell} pr-5 text-slate-600 ${tone(total)}`}>{formatMoney(Math.round(total / n))}</td>
    </tr>
  )
}
