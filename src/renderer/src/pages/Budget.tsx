import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { currentMonth, formatMonth, shiftMonth } from '@shared/dates'
import { centsToInput, formatMoney, parseMoney } from '@shared/money'
import type { BudgetRow } from '@shared/types'
import { AccountDot, ColorSelect, type ColorOption } from '../components/ColorSelect'
import { Button, Card, Empty, Field, FormActions, inputClass, Modal, Money, MoneyInput, PageHeader } from '../components/ui'
import { useApi, useMutate, useShowError } from '../lib/data'

interface MoveDraft {
  from: number | null
  to: number | null
  amount: number
}

export function BudgetPage() {
  const [month, setMonth] = useState(currentMonth())
  const budget = useApi(() => window.api.getBudgetMonth(month), [month])
  const mutate = useMutate()
  const [move, setMove] = useState<MoveDraft | null>(null)

  if (!budget) return null
  const groups = new Map<string, BudgetRow[]>()
  for (const r of budget.rows) groups.set(r.groupName, [...(groups.get(r.groupName) ?? []), r])
  const overspent = budget.rows.filter((r) => r.available < 0)
  const rta = budget.readyToAssign

  function openMove(r: BudgetRow): void {
    // En rojo: cubrir el faltante desde "Por asignar". Con saldo: mover lo disponible a otra cajita.
    setMove(r.available < 0 ? { from: null, to: r.categoryId, amount: -r.available } : { from: r.categoryId, to: null, amount: r.available })
  }

  return (
    <>
      <PageHeader
        title="Presupuesto"
        subtitle="Asigna tu dinero a cajitas; cada gasto descuenta de la suya"
        actions={
          <div className="flex items-center gap-1">
            <Button variant="ghost" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mes anterior">
              ‹
            </Button>
            <span className="w-40 text-center font-medium">{formatMonth(month)}</span>
            <Button variant="ghost" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Mes siguiente">
              ›
            </Button>
            {month !== currentMonth() && (
              <Button variant="secondary" onClick={() => setMonth(currentMonth())}>
                Hoy
              </Button>
            )}
          </div>
        }
      />

      <Card className={`mb-6 flex flex-wrap items-center gap-6 ${rta < 0 ? 'bg-rose-50 ring-rose-200' : rta > 0 ? 'bg-emerald-50 ring-emerald-200' : ''}`}>
        <div>
          <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">Por asignar</div>
          <div className={`text-3xl font-semibold tabular-nums ${rta < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{formatMoney(rta)}</div>
        </div>
        <div className="flex-1 text-sm text-slate-600">
          {rta < 0
            ? 'Asignaste más dinero del que tienes. Quita de alguna cajita.'
            : rta > 0
              ? 'Este dinero aún no tiene cajita. Dale un trabajo.'
              : 'Todo tu dinero tiene una cajita.'}
          <div className="mt-1 text-slate-500">Entradas de {formatMonth(month).toLowerCase()}: {formatMoney(budget.income)}</div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setMove({ from: null, to: null, amount: 0 })}>
            Mover dinero
          </Button>
          <Button variant="secondary" onClick={() => mutate(() => window.api.copyPreviousMonthAllocations(month))}>
            Asignar como el mes pasado
          </Button>
        </div>
      </Card>

      {overspent.length > 0 && (
        <div className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {overspent.length === 1 ? 'Una cajita está' : `${overspent.length} cajitas están`} en rojo:{' '}
          {overspent.map((r) => r.name).join(', ')}. Haz clic en su disponible para cubrirla.
        </div>
      )}

      {budget.rows.length === 0 ? (
        <Empty>No hay categorías de gasto. Créalas en la sección Categorías.</Empty>
      ) : (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-5 py-3 font-medium">Cajita</th>
                <th className="w-40 px-3 py-3 text-right font-medium">Asignado</th>
                <th className="w-36 px-3 py-3 text-right font-medium">Actividad</th>
                <th className="w-40 px-5 py-3 text-right font-medium">Disponible</th>
              </tr>
            </thead>
            {[...groups].map(([group, rows]) => (
              <tbody key={group} className="border-b border-slate-100 last:border-0">
                <tr className="bg-slate-50 text-xs font-semibold text-slate-600">
                  <td className="px-5 py-2">{group}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(sum(rows, 'assigned'))}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(sum(rows, 'activity'))}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{formatMoney(sum(rows, 'available'))}</td>
                </tr>
                {rows.map((r) => (
                  <tr key={r.categoryId} className="hover:bg-slate-50">
                    <td className="px-5 py-2">
                      <span className="flex items-center gap-2">
                        {r.accountColor && <AccountDot color={r.accountColor} />}
                        {r.name}
                      </span>
                      {r.cardDebt !== null && <CardHint row={r} />}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <AssignedInput value={r.assigned} onSave={(cents) => mutate(() => window.api.setAllocation(r.categoryId, month, cents))} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Money cents={r.activity} className={r.activity === 0 ? 'text-slate-400' : ''} />
                    </td>
                    <td className="px-5 py-2 text-right">
                      <button
                        onClick={() => openMove(r)}
                        title={r.available < 0 ? 'Cubrir faltante' : 'Mover dinero'}
                        className={`rounded-full px-2.5 py-0.5 font-medium tabular-nums ${
                          r.available < 0
                            ? 'bg-rose-100 text-rose-700'
                            : r.available > 0
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {formatMoney(r.available)}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </Card>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Lo que sobra (o falta) en una cajita pasa al mes siguiente. Las compras a meses cuentan solo con la cuota
        que vence cada mes. Al gastar con tarjeta, ese dinero pasa a la cajita «Pago» de la tarjeta.
      </p>

      <Modal title="Mover dinero entre cajitas" open={move !== null} onClose={() => setMove(null)}>
        {move && <MoveForm draft={move} rows={budget.rows} readyToAssign={rta} month={month} onDone={() => setMove(null)} />}
      </Modal>
    </>
  )
}

const sum = (rows: BudgetRow[], key: 'assigned' | 'activity' | 'available'): number => rows.reduce((s, r) => s + r[key], 0)

function CardHint({ row }: { row: BudgetRow }) {
  const debt = row.cardDebt ?? 0
  if (debt === 0) return null
  const gap = debt - Math.max(0, row.available)
  return (
    <div className="text-xs text-slate-500">
      Deuda {formatMoney(debt)}
      {gap > 0 && <span className="text-amber-700"> · faltan {formatMoney(gap)} para cubrirla completa</span>}
    </div>
  )
}

function AssignedInput({ value, onSave }: { value: number; onSave: (cents: number) => void }) {
  const showError = useShowError()
  const [text, setText] = useState(centsToInput(value))
  useEffect(() => setText(centsToInput(value)), [value])

  function commit(): void {
    const cents = text.trim() === '' ? 0 : parseMoney(text, { allowNegative: true })
    if (cents === null) {
      showError('Monto inválido')
      setText(centsToInput(value))
    } else if (cents !== value) {
      onSave(cents)
    }
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') e.currentTarget.blur()
    if (e.key === 'Escape') {
      setText(centsToInput(value))
      e.currentTarget.blur()
    }
  }

  return (
    <MoneyInput
      allowNegative
      className="w-32 rounded-md border border-transparent bg-transparent px-2 py-1 text-right tabular-nums hover:border-slate-300 focus:border-indigo-500 focus:bg-white focus:outline-none"
      value={text}
      onFocus={(e) => e.currentTarget.select()}
      onChange={setText}
      onBlur={commit}
      onKeyDown={onKey}
    />
  )
}

function MoveForm({
  draft,
  rows,
  readyToAssign,
  month,
  onDone
}: {
  draft: MoveDraft
  rows: BudgetRow[]
  readyToAssign: number
  month: string
  onDone: () => void
}) {
  const mutate = useMutate()
  const showError = useShowError()
  const [from, setFrom] = useState<number | null>(draft.from)
  const [to, setTo] = useState<number | null>(draft.to)
  const [amount, setAmount] = useState(draft.amount > 0 ? centsToInput(draft.amount) : '')

  const options: ColorOption<number | null>[] = [
    { value: null, label: 'Por asignar', detail: formatMoney(readyToAssign) },
    ...rows.map((r) => ({
      value: r.categoryId,
      label: r.name,
      color: r.accountColor ?? undefined,
      detail: formatMoney(r.available)
    }))
  ]

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    const cents = parseMoney(amount)
    if (!cents) return showError('Escribe un monto válido')
    if (from === to) return showError('Elige dos cajitas distintas')
    if (await mutate(() => window.api.moveBudget({ month, fromCategoryId: from, toCategoryId: to, amount: cents }))) onDone()
  }

  return (
    <form onSubmit={submit}>
      <Field label="Desde">
        <ColorSelect value={from} onChange={setFrom} options={options} />
      </Field>
      <Field label="Hacia">
        <ColorSelect value={to} onChange={setTo} options={options} />
      </Field>
      <Field label="Monto">
        <MoneyInput value={amount} onChange={setAmount} autoFocus />
      </Field>
      <FormActions onCancel={onDone} submitLabel="Mover" />
    </form>
  )
}
