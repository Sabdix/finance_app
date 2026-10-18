import { useState, type FormEvent } from 'react'
import { formatDate, today } from '@shared/dates'
import { centsToInput, parseMoney } from '@shared/money'
import type { AccountWithBalance, Category, Transaction } from '@shared/types'
import { AccountDot, accountOptions, ColorSelect } from '../components/ColorSelect'
import { Badge, Button, Card, Empty, Field, FormActions, inputClass, Modal, Money, MoneyInput, NotesField, NotesText, PageHeader } from '../components/ui'
import { useApi, useMutate, useShowError } from '../lib/data'

type Mode = 'expense' | 'income' | 'transfer'

export function TransactionsPage({ initialAccountId }: { initialAccountId?: number }) {
  const [accountId, setAccountId] = useState<number | undefined>(initialAccountId)
  const accounts = useApi(() => window.api.listAccounts())
  const categories = useApi(() => window.api.listCategories())
  const transactions = useApi(() => window.api.listTransactions({ accountId }), [accountId])
  const mutate = useMutate()
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null)
  const [editingNotes, setEditingNotes] = useState<Transaction | null>(null)

  if (!accounts || !categories || !transactions) return null
  const active = accounts.filter((a) => !a.archived)
  const selected = accounts.find((a) => a.id === accountId)

  function remove(t: Transaction): void {
    const what = t.transferId ? 'esta transferencia (se borra de ambas cuentas)' : 'este movimiento'
    if (window.confirm(`¿Eliminar ${what}?`)) void mutate(() => window.api.deleteTransaction(t.id))
  }

  return (
    <>
      <PageHeader
        title="Movimientos"
        subtitle="Gastos, ingresos, transferencias y pagos de tarjeta"
        actions={
          <>
            <ColorSelect<number | undefined>
              className="w-64"
              value={accountId}
              onChange={setAccountId}
              options={[
                { value: undefined, label: 'Todas las cuentas' },
                ...accounts.map((a) => ({ value: a.id, label: a.name, color: a.color }))
              ]}
            />
            <Button onClick={() => setEditing('new')} disabled={active.length === 0}>
              Nuevo movimiento
            </Button>
          </>
        }
      />

      {selected?.notes && (
        <div className="mb-4 flex gap-3 rounded-lg bg-white px-4 py-3 text-sm ring-1 ring-slate-200">
          <AccountDot color={selected.color} className="mt-1.5 size-2.5" />
          <div>
            <div className="text-xs font-medium text-slate-500">Observaciones de {selected.name}</div>
            <p className="whitespace-pre-line text-slate-700">{selected.notes}</p>
          </div>
        </div>
      )}

      {active.length === 0 ? (
        <Empty>Primero crea una cuenta en la sección Cuentas.</Empty>
      ) : transactions.length === 0 ? (
        <Empty>No hay movimientos registrados.</Empty>
      ) : (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-5 py-3 font-medium">Fecha</th>
                <th className="px-3 py-3 font-medium">Descripción</th>
                <th className="px-3 py-3 font-medium">Cuenta</th>
                <th className="px-3 py-3 font-medium">Categoría</th>
                <th className="px-3 py-3 text-right font-medium">Monto</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-5 py-2.5 whitespace-nowrap text-slate-500">{formatDate(t.date)}</td>
                  <td className="px-3 py-2.5">
                    {t.description || <span className="text-slate-400">—</span>}{' '}
                    {t.installmentPlanId && <Badge tone="indigo">MSI</Badge>}
                    {t.transferId && (
                      <Badge>{t.amount < 0 ? `→ ${t.counterpartAccountName}` : `← ${t.counterpartAccountName}`}</Badge>
                    )}
                    <NotesText notes={t.notes} className="mt-0.5 text-xs" />
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      <AccountDot color={t.accountColor} />
                      {t.accountName}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{t.categoryName ?? ''}</td>
                  <td className="px-3 py-2.5 text-right">
                    <Money cents={t.amount} colorize />
                  </td>
                  <td className="px-5 py-2.5 text-right whitespace-nowrap">
                    {/* Transferencias y compras a MSI no se editan completas, pero sí sus observaciones. */}
                    <Button
                      variant="ghost"
                      onClick={() => (t.transferId || t.installmentPlanId ? setEditingNotes(t) : setEditing(t))}
                    >
                      {t.transferId || t.installmentPlanId ? 'Observaciones' : 'Editar'}
                    </Button>
                    {!t.installmentPlanId && (
                      <Button variant="ghost" onClick={() => remove(t)}>
                        Eliminar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal title={editing === 'new' ? 'Nuevo movimiento' : 'Editar movimiento'} open={editing !== null} onClose={() => setEditing(null)}>
        {editing !== null && (
          <TransactionForm
            transaction={editing === 'new' ? null : editing}
            accounts={active}
            categories={categories.filter((c) => !c.archived)}
            defaultAccountId={accountId}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>

      <Modal title="Observaciones" open={editingNotes !== null} onClose={() => setEditingNotes(null)}>
        {editingNotes && <NotesForm transaction={editingNotes} onDone={() => setEditingNotes(null)} />}
      </Modal>
    </>
  )
}

function NotesForm({ transaction, onDone }: { transaction: Transaction; onDone: () => void }) {
  const mutate = useMutate()
  const [notes, setNotes] = useState(transaction.notes)

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (await mutate(() => window.api.setTransactionNotes(transaction.id, notes))) onDone()
  }

  return (
    <form onSubmit={submit}>
      <p className="mb-3 text-sm text-slate-600">
        {formatDate(transaction.date)} · {transaction.description || 'Sin descripción'} · <Money cents={transaction.amount} />
        {transaction.transferId && <span className="block text-xs text-slate-500">Se guardan en ambos lados de la transferencia.</span>}
      </p>
      <NotesField value={notes} onChange={setNotes} autoFocus />
      <FormActions onCancel={onDone} />
    </form>
  )
}

function TransactionForm({
  transaction,
  accounts,
  categories,
  defaultAccountId,
  onDone
}: {
  transaction: Transaction | null
  accounts: AccountWithBalance[]
  categories: Category[]
  defaultAccountId?: number
  onDone: () => void
}) {
  const mutate = useMutate()
  const showError = useShowError()
  const [mode, setMode] = useState<Mode>(transaction ? (transaction.amount < 0 ? 'expense' : 'income') : 'expense')
  const [date, setDate] = useState(transaction?.date ?? today())
  const [amount, setAmount] = useState(transaction ? centsToInput(Math.abs(transaction.amount)) : '')
  const [accountId, setAccountId] = useState(transaction?.accountId ?? defaultAccountId ?? accounts[0].id)
  const [toAccountId, setToAccountId] = useState(
    accounts.find((a) => a.type === 'credit' && a.id !== accountId)?.id ?? accounts.find((a) => a.id !== accountId)?.id ?? 0
  )
  const [categoryId, setCategoryId] = useState<number | null>(transaction?.categoryId ?? null)
  const [description, setDescription] = useState(transaction?.description ?? '')
  const [notes, setNotes] = useState(transaction?.notes ?? '')

  const target = accounts.find((a) => a.id === toAccountId)
  const isCardPayment = mode === 'transfer' && target?.type === 'credit'
  const kindCategories = categories.filter((c) => c.kind === (mode === 'income' ? 'income' : 'expense'))

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    const cents = parseMoney(amount)
    if (!cents) return showError('Escribe un monto válido')
    let ok: boolean
    if (mode === 'transfer') {
      ok = await mutate(() =>
        window.api.createTransfer({
          date,
          fromAccountId: accountId,
          toAccountId,
          amount: cents,
          description: description || (isCardPayment ? `Pago ${target?.name}` : 'Transferencia'),
          notes
        })
      )
    } else {
      const input = { kind: mode, date, accountId, amount: cents, categoryId, description, notes }
      ok = await mutate(() =>
        transaction ? window.api.updateTransaction(transaction.id, input) : window.api.createTransaction(input)
      )
    }
    if (ok) onDone()
  }

  const options = accountOptions(accounts)

  return (
    <form onSubmit={submit}>
      {!transaction && (
        <div className="mb-4 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 text-sm">
          {(
            [
              ['expense', 'Gasto'],
              ['income', 'Ingreso'],
              ['transfer', 'Transferencia / pago']
            ] as const
          ).map(([m, label]) => (
            <button
              type="button"
              key={m}
              onClick={() => {
                setMode(m)
                setCategoryId(null)
              }}
              className={`rounded-md py-1.5 font-medium ${mode === m ? 'bg-white shadow-sm' : 'text-slate-500'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha">
          <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Monto">
          <MoneyInput value={amount} onChange={setAmount} autoFocus />
        </Field>
      </div>

      <Field label={mode === 'transfer' ? 'Desde la cuenta' : mode === 'income' ? 'Cuenta que recibe' : 'Pagado con'}>
        <ColorSelect value={accountId} onChange={setAccountId} options={options} />
      </Field>

      {mode === 'transfer' ? (
        <Field
          label="Hacia la cuenta"
          hint={isCardPayment ? 'Esto es un pago de tarjeta: reduce la deuda de la tarjeta.' : undefined}
        >
          <ColorSelect value={toAccountId} onChange={setToAccountId} options={options} />
        </Field>
      ) : (
        <Field label="Categoría">
          <select
            className={inputClass}
            value={categoryId ?? ''}
            onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Sin categoría</option>
            {kindCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.groupName} · {c.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Descripción">
        <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" />
      </Field>
      <NotesField value={notes} onChange={setNotes} />
      <FormActions onCancel={onDone} />
    </form>
  )
}
