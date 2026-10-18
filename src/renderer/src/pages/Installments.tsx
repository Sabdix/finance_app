import { useMemo, useState, type FormEvent } from 'react'
import { firstDueDateFor, formatDate, today } from '@shared/dates'
import { buildSchedule, planProgress } from '@shared/installments'
import { formatMoney, parseMoney } from '@shared/money'
import type { AccountWithBalance, Category, InstallmentPlan } from '@shared/types'
import { AccountDot, accountOptions, ColorSelect } from '../components/ColorSelect'
import { Badge, Button, Card, Empty, Field, FormActions, inputClass, Modal, MoneyInput, PageHeader, ProgressBar, Stat } from '../components/ui'
import { useApi, useMutate, useShowError } from '../lib/data'

const MONTH_OPTIONS = [3, 6, 9, 10, 12, 13, 15, 18, 24]

export function InstallmentsPage() {
  const plans = useApi(() => window.api.listInstallmentPlans())
  const accounts = useApi(() => window.api.listAccounts())
  const categories = useApi(() => window.api.listCategories())
  const [creating, setCreating] = useState(false)
  const [showFinished, setShowFinished] = useState(false)

  if (!plans || !accounts || !categories) return null
  const cards = accounts.filter((a) => a.type === 'credit' && !a.archived)
  const asOf = today()
  const withProgress = plans.map((p) => ({ plan: p, progress: planProgress(p.installments, asOf) }))
  const active = withProgress.filter((x) => x.progress.remainingCount > 0)
  const finished = withProgress.filter((x) => x.progress.remainingCount === 0)
  const thisMonth = asOf.slice(0, 7)
  const dueThisMonth = plans
    .flatMap((p) => p.installments)
    .filter((i) => i.dueDate.startsWith(thisMonth) && i.paidAt === null)
    .reduce((acc, i) => acc + i.amount, 0)

  return (
    <>
      <PageHeader
        title="Meses sin intereses"
        subtitle="Cuántos meses van, lo pagado y lo que falta de cada compra"
        actions={
          <Button onClick={() => setCreating(true)} disabled={cards.length === 0}>
            Nueva compra a meses
          </Button>
        }
      />

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Stat label="Falta por pagar" cents={active.reduce((a, x) => a + x.progress.remainingAmount, 0)} tone="bad" />
        <Stat label="Cuotas pendientes este mes" cents={dueThisMonth} />
        <Stat label="Ya pagado" cents={withProgress.reduce((a, x) => a + x.progress.paidAmount, 0)} tone="good" />
      </div>

      {cards.length === 0 ? (
        <Empty>Registra primero una tarjeta de crédito en la sección Cuentas.</Empty>
      ) : active.length === 0 ? (
        <Empty>No tienes compras a meses activas.</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {active.map(({ plan }) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>
      )}

      {finished.length > 0 && (
        <div className="mt-8">
          <Button variant="ghost" onClick={() => setShowFinished((v) => !v)}>
            {showFinished ? 'Ocultar' : 'Ver'} compras liquidadas ({finished.length})
          </Button>
          {showFinished && (
            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
              {finished.map(({ plan }) => (
                <PlanCard key={plan.id} plan={plan} />
              ))}
            </div>
          )}
        </div>
      )}

      <Modal title="Nueva compra a meses sin intereses" open={creating} onClose={() => setCreating(false)} wide>
        {creating && (
          <PlanForm cards={cards} categories={categories.filter((c) => c.kind === 'expense' && !c.archived)} onDone={() => setCreating(false)} />
        )}
      </Modal>
    </>
  )
}

function PlanCard({ plan }: { plan: InstallmentPlan }) {
  const mutate = useMutate()
  const [open, setOpen] = useState(false)
  const asOf = today()
  const p = planProgress(plan.installments, asOf)
  const done = p.remainingCount === 0

  function remove(): void {
    if (window.confirm(`¿Eliminar "${plan.description}"? También se quitará el cargo de la tarjeta.`)) {
      void mutate(() => window.api.deleteInstallmentPlan(plan.id))
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-medium text-slate-900">{plan.description}</div>
          <div className="mt-0.5 text-xs text-slate-500">
            <AccountDot color={plan.accountColor} className="mr-1 size-2" />
            {plan.accountName} · {formatDate(plan.purchaseDate)}
            {plan.categoryName && ` · ${plan.categoryName}`}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold tabular-nums">{formatMoney(plan.totalAmount)}</div>
          <div className="text-xs text-slate-500">{plan.months} meses</div>
        </div>
      </div>

      <div className="mt-4 mb-1 flex justify-between text-sm">
        <span className="font-medium">
          {p.paidCount} de {plan.months} pagos
        </span>
        {done ? <Badge tone="emerald">Liquidada</Badge> : <span className="text-slate-500">faltan {p.remainingCount}</span>}
      </div>
      <ProgressBar value={p.paidCount} max={plan.months} />

      <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-xs text-slate-500">Pagado</dt>
          <dd className="font-medium text-emerald-600 tabular-nums">{formatMoney(p.paidAmount)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Falta</dt>
          <dd className="font-medium text-rose-600 tabular-nums">{formatMoney(p.remainingAmount)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Próxima cuota</dt>
          <dd className="font-medium tabular-nums">
            {p.nextDue ? `${formatMoney(p.nextDue.amount)} · ${formatDate(p.nextDue.dueDate)}` : '—'}
          </dd>
        </div>
      </dl>

      {p.overdueCount > 0 && (
        <div className="mt-4 flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span>
            {p.overdueCount} {p.overdueCount === 1 ? 'cuota vencida' : 'cuotas vencidas'} sin marcar como pagadas
          </span>
          <Button variant="secondary" onClick={() => mutate(() => window.api.markOverdueInstallmentsPaid(plan.id))}>
            Marcar pagadas
          </Button>
        </div>
      )}

      <div className="mt-4 flex gap-1 border-t border-slate-100 pt-3">
        <Button variant="ghost" onClick={() => setOpen((v) => !v)}>
          {open ? 'Ocultar calendario' : 'Ver calendario'}
        </Button>
        <Button variant="ghost" className="ml-auto" onClick={remove}>
          Eliminar
        </Button>
      </div>

      {open && (
        <table className="mt-2 w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {plan.installments.map((i) => {
              const overdue = i.paidAt === null && i.dueDate < asOf
              return (
                <tr key={i.id}>
                  <td className="py-1.5 pr-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-indigo-600"
                      checked={i.paidAt !== null}
                      onChange={(e) => mutate(() => window.api.setInstallmentPaid(i.id, e.target.checked))}
                    />
                  </td>
                  <td className="py-1.5 text-slate-500">
                    {i.number}/{plan.months}
                  </td>
                  <td className={`py-1.5 ${overdue ? 'font-medium text-amber-700' : ''}`}>{formatDate(i.dueDate)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatMoney(i.amount)}</td>
                  <td className="py-1.5 pl-3 text-right">
                    {i.paidAt ? <Badge tone="emerald">Pagada</Badge> : overdue ? <Badge tone="amber">Vencida</Badge> : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </Card>
  )
}

function suggestedFirstDue(card: AccountWithBalance | undefined, purchaseDate: string): string | null {
  if (!card?.statementDay || !card.dueDay || !purchaseDate) return null
  return firstDueDateFor(purchaseDate, card.statementDay, card.dueDay)
}

function PlanForm({ cards, categories, onDone }: { cards: AccountWithBalance[]; categories: Category[]; onDone: () => void }) {
  const mutate = useMutate()
  const showError = useShowError()
  const [accountId, setAccountId] = useState(cards[0].id)
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [purchaseDate, setPurchaseDate] = useState(today())
  const [total, setTotal] = useState('')
  const [months, setMonths] = useState(12)
  const card = cards.find((c) => c.id === accountId)
  // Mientras la persona no lo cambie a mano, el primer pago se calcula con el corte y el día de pago de la tarjeta.
  const [firstDueOverride, setFirstDueOverride] = useState<string | null>(null)
  const firstDueDate = firstDueOverride ?? suggestedFirstDue(card, purchaseDate) ?? ''

  const totalCents = parseMoney(total)
  const schedule = useMemo(
    () => (totalCents && months > 0 && firstDueDate ? buildSchedule(totalCents, months, firstDueDate) : []),
    [totalCents, months, firstDueDate]
  )

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!totalCents) return showError('Escribe el monto total de la compra')
    if (!firstDueDate) return showError('Indica la fecha del primer pago')
    const ok = await mutate(() =>
      window.api.createInstallmentPlan({ accountId, categoryId, description, purchaseDate, totalAmount: totalCents, months, firstDueDate })
    )
    if (ok) onDone()
  }

  return (
    <form onSubmit={submit}>
      <div className="grid grid-cols-2 gap-x-4">
        <Field label="Tarjeta">
          <ColorSelect value={accountId} onChange={setAccountId} options={accountOptions(cards)} />
        </Field>
        <Field label="Categoría">
          <select className={inputClass} value={categoryId ?? ''} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.groupName} · {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="¿Qué compraste?">
        <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} autoFocus placeholder="Laptop, refrigerador..." />
      </Field>
      <div className="grid grid-cols-3 gap-x-4">
        <Field label="Fecha de compra">
          <input type="date" className={inputClass} value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
        </Field>
        <Field label="Monto total">
          <MoneyInput value={total} onChange={setTotal} />
        </Field>
        <Field label="Meses">
          <input
            className={inputClass}
            type="number"
            min={1}
            max={60}
            list="msi-months"
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
          />
          <datalist id="msi-months">
            {MONTH_OPTIONS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>
      </div>
      <Field
        label="Fecha del primer pago"
        hint={
          card?.statementDay && card.dueDay
            ? `Calculada con el corte (día ${card.statementDay}) y pago (día ${card.dueDay}) de la tarjeta. Puedes cambiarla.`
            : 'Tip: si registras el día de corte y de pago en la tarjeta, esta fecha se calcula sola.'
        }
      >
        <input type="date" className={inputClass} value={firstDueDate} onChange={(e) => setFirstDueOverride(e.target.value)} />
      </Field>

      {schedule.length > 0 && (
        <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm">
          <div className="font-medium">
            {months} pagos de {formatMoney(schedule[0].amount)}
            {schedule[schedule.length - 1].amount !== schedule[0].amount &&
              ` (el último de ${formatMoney(schedule[schedule.length - 1].amount)})`}
          </div>
          <div className="mt-1 text-slate-500">
            Del {formatDate(schedule[0].dueDate)} al {formatDate(schedule[schedule.length - 1].dueDate)}
          </div>
        </div>
      )}
      <FormActions onCancel={onDone} submitLabel="Registrar compra" />
    </form>
  )
}
