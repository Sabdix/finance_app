import { currentMonth, formatDate, today } from '@shared/dates'
import { formatMoney } from '@shared/money'
import type { Navigate } from '../App'
import { AccountDot } from '../components/ColorSelect'
import { Badge, Button, Card, Empty, Money, PageHeader, Stat } from '../components/ui'
import { useApi } from '../lib/data'

export function DashboardPage({ navigate }: { navigate: Navigate }) {
  const accounts = useApi(() => window.api.listAccounts())
  const transactions = useApi(() => window.api.listTransactions({ limit: 1000 }))
  const plans = useApi(() => window.api.listInstallmentPlans())
  const budget = useApi(() => window.api.getBudgetMonth(currentMonth()))

  if (!accounts || !transactions || !plans || !budget) return null
  const active = accounts.filter((a) => !a.archived)
  if (active.length === 0) {
    return (
      <>
        <PageHeader title="Resumen" />
        <Empty>
          Te damos la bienvenida. Empieza registrando tus cuentas.
          <div className="mt-4">
            <Button onClick={() => navigate({ page: 'accounts' })}>Ir a Cuentas</Button>
          </div>
        </Empty>
      </>
    )
  }

  const cash = active.filter((a) => a.type !== 'credit').reduce((s, a) => s + a.balance, 0)
  const cardDebt = active.filter((a) => a.type === 'credit').reduce((s, a) => s + Math.max(0, -a.balance), 0)
  const msiPending = active.reduce((s, a) => s + a.msiPending, 0)
  const netWorth = active.reduce((s, a) => s + a.balance, 0)

  // Gasto del mes por categoría: las compras a meses cuentan solo con la cuota que vence este mes,
  // que es lo que realmente sale del presupuesto mensual.
  const month = today().slice(0, 7)
  const byCategory = new Map<string, number>()
  const add = (name: string | null, cents: number): void => {
    const key = name ?? 'Sin categoría'
    byCategory.set(key, (byCategory.get(key) ?? 0) + cents)
  }
  for (const t of transactions) {
    if (t.date.startsWith(month) && t.amount < 0 && !t.transferId && !t.installmentPlanId) add(t.categoryName, -t.amount)
  }
  const msiThisMonth = plans.flatMap((p) =>
    p.installments.filter((i) => i.dueDate.startsWith(month)).map((i) => ({ plan: p, installment: i }))
  )
  for (const { plan, installment } of msiThisMonth) add(plan.categoryName, installment.amount)
  const spending = [...byCategory].sort((a, b) => b[1] - a[1])
  const spentTotal = spending.reduce((s, [, v]) => s + v, 0)

  return (
    <>
      <PageHeader title="Resumen" subtitle={new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })} />

      <div className="mb-8 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Patrimonio neto" cents={netWorth} tone={netWorth < 0 ? 'bad' : undefined} />
        <Stat label="Dinero en cuentas" cents={cash} tone="good" />
        <Stat label="Deuda en tarjetas" cents={cardDebt} tone="bad" />
        <Stat label="De esa deuda, en MSI" cents={msiPending} />
      </div>

      <BudgetStrip
        readyToAssign={budget.readyToAssign}
        overspent={budget.rows.filter((r) => r.available < 0).map((r) => r.name)}
        onOpen={() => navigate({ page: 'budget' })}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <h2 className="mb-3 font-semibold">Cuentas</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {active.map((a) => (
              <li key={a.id}>
                <button
                  className="flex w-full justify-between py-2 text-left hover:text-indigo-600"
                  onClick={() => navigate({ page: 'transactions', accountId: a.id })}
                >
                  <span className="flex items-center gap-2">
                    <AccountDot color={a.color} />
                    {a.name}
                  </span>
                  {a.type === 'credit' ? (
                    <span className="text-rose-600 tabular-nums">−{formatMoney(Math.max(0, -a.balance))}</span>
                  ) : (
                    <Money cents={a.balance} />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-semibold">Gasto del mes</h2>
            <Money cents={spentTotal} className="text-sm font-medium" />
          </div>
          {spending.length === 0 ? (
            <p className="text-sm text-slate-500">Sin gastos este mes.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {spending.map(([name, cents]) => (
                <li key={name}>
                  <div className="flex justify-between">
                    <span>{name}</span>
                    <Money cents={cents} />
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-indigo-400" style={{ width: `${(cents / spending[0][1]) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-semibold">Cuotas MSI del mes</h2>
            <Button variant="ghost" onClick={() => navigate({ page: 'installments' })}>
              Ver todas
            </Button>
          </div>
          {msiThisMonth.length === 0 ? (
            <p className="text-sm text-slate-500">No hay cuotas este mes.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {msiThisMonth.map(({ plan, installment }) => (
                <li key={installment.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <div>{plan.description}</div>
                    <div className="text-xs text-slate-500">
                      <AccountDot color={plan.accountColor} className="mr-1 size-2" />
                      {plan.accountName} · {installment.number}/{plan.months} · {formatDate(installment.dueDate)}
                    </div>
                  </div>
                  <div className="text-right">
                    <Money cents={installment.amount} />
                    <div>{installment.paidAt ? <Badge tone="emerald">Pagada</Badge> : <Badge tone="amber">Pendiente</Badge>}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}

function BudgetStrip({ readyToAssign, overspent, onOpen }: { readyToAssign: number; overspent: string[]; onOpen: () => void }) {
  return (
    <Card className="mb-6 flex flex-wrap items-center gap-x-8 gap-y-2">
      <div>
        <span className="text-sm text-slate-500">Por asignar: </span>
        <span className={`font-semibold tabular-nums ${readyToAssign < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
          {formatMoney(readyToAssign)}
        </span>
      </div>
      <div className="flex-1 text-sm">
        {overspent.length === 0 ? (
          <span className="text-slate-500">Ninguna cajita en rojo este mes.</span>
        ) : (
          <span className="text-amber-700">En rojo: {overspent.join(', ')}</span>
        )}
      </div>
      <Button variant="secondary" onClick={onOpen}>
        Ir al presupuesto
      </Button>
    </Card>
  )
}
