import { useState, type FormEvent } from 'react'
import { formatDate, today } from '@shared/dates'
import { centsToInput, formatMoney, parseMoney } from '@shared/money'
import type { AccountWithBalance, Category, SplitPart, Transaction } from '@shared/types'
import { AccountDot, accountOptions, categoryOptions, SearchSelect } from '../components/SearchSelect'
import { Badge, Button, Card, Empty, Field, FormActions, inputClass, Modal, Money, MoneyInput, NotesField, NotesText, PageHeader } from '../components/ui'
import { useApi, useMutate, useShowError } from '../lib/data'

type Mode = 'expense' | 'income' | 'transfer'

/** Una fila del gasto dividido mientras se captura; `key` solo sirve para React. */
interface SplitRow {
  key: number
  accountId: number
  categoryId: number | null
  amount: string
}

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

  // Al editar, también se ofrecen las cuentas y categorías archivadas que ya usa el movimiento, para no cambiarlas sin querer.
  const editingParts = editing && editing !== 'new' ? (editing.splitParts ?? [editing]) : []
  const usedAccounts = new Set(editingParts.map((p) => p.accountId))
  const usedCategories = new Set(editingParts.map((p) => p.categoryId))
  const formAccounts = accounts.filter((a) => !a.archived || usedAccounts.has(a.id))
  const formCategories = categories.filter((c) => !c.archived || usedCategories.has(c.id))

  function remove(t: Transaction): void {
    const what = t.transferId
      ? 'esta transferencia (se borra de ambas cuentas)'
      : t.splitId
        ? `este gasto dividido (se borran sus ${t.splitParts?.length ?? 2} partes)`
        : 'este movimiento'
    if (window.confirm(`¿Eliminar ${what}?`)) void mutate(() => window.api.deleteTransaction(t.id))
  }

  return (
    <>
      <PageHeader
        title="Movimientos"
        subtitle="Gastos, ingresos, transferencias y pagos de tarjeta"
        actions={
          <>
            <SearchSelect<number | undefined>
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
                    {t.splitParts && <SplitBadge parts={t.splitParts} accounts={accounts} categories={categories} />}
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
            accounts={formAccounts}
            categories={formCategories}
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
        {transaction.splitId && <span className="block text-xs text-slate-500">Se guardan en todas las partes del gasto dividido.</span>}
      </p>
      <NotesField value={notes} onChange={setNotes} autoFocus />
      <FormActions onCancel={onDone} />
    </form>
  )
}

/** Indica que el movimiento es parte de un gasto dividido; al pasar el mouse muestra todas sus partes. */
function SplitBadge({ parts, accounts, categories }: { parts: SplitPart[]; accounts: AccountWithBalance[]; categories: Category[] }) {
  const total = parts.reduce((acc, p) => acc + p.amount, 0)
  const detail = parts
    .map((p) => {
      const account = accounts.find((a) => a.id === p.accountId)?.name ?? 'Cuenta'
      const category = categories.find((c) => c.id === p.categoryId)?.name ?? 'Sin categoría'
      return `${account} · ${category}: ${formatMoney(p.amount)}`
    })
    .join('\n')
  return (
    <span title={`Total ${formatMoney(total)}\n${detail}`}>
      <Badge tone="amber">Dividido · {formatMoney(total)}</Badge>
    </span>
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
  const editingParts = transaction?.splitParts ?? null
  const [amount, setAmount] = useState(
    editingParts
      ? centsToInput(editingParts.reduce((acc, p) => acc + p.amount, 0))
      : transaction
        ? centsToInput(Math.abs(transaction.amount))
        : ''
  )
  const [accountId, setAccountId] = useState(transaction?.accountId ?? defaultAccountId ?? accounts[0].id)
  const [split, setSplit] = useState(editingParts !== null)
  const [parts, setParts] = useState<SplitRow[]>(
    () =>
      editingParts?.map((p, i) => ({ key: i, accountId: p.accountId, categoryId: p.categoryId, amount: centsToInput(p.amount) })) ?? []
  )
  const [toAccountId, setToAccountId] = useState(
    accounts.find((a) => a.type === 'credit' && a.id !== accountId)?.id ?? accounts.find((a) => a.id !== accountId)?.id ?? 0
  )
  const [categoryId, setCategoryId] = useState<number | null>(transaction?.categoryId ?? null)
  const [description, setDescription] = useState(transaction?.description ?? '')
  const [notes, setNotes] = useState(transaction?.notes ?? '')

  const target = accounts.find((a) => a.id === toAccountId)
  const isCardPayment = mode === 'transfer' && target?.type === 'credit'
  const kindCategories = categories.filter((c) => c.kind === (mode === 'income' ? 'income' : 'expense'))
  const isSplit = mode === 'expense' && split

  const totalCents = parseMoney(amount) ?? 0
  const assigned = parts.reduce((acc, p) => acc + (parseMoney(p.amount) ?? 0), 0)
  const remaining = totalCents - assigned
  const nextKey = (rows: SplitRow[]): number => Math.max(-1, ...rows.map((p) => p.key)) + 1

  function toggleSplit(on: boolean): void {
    setSplit(on)
    if (!on) {
      if (parts.length > 0) {
        setAccountId(parts[0].accountId)
        setCategoryId(parts[0].categoryId)
      }
      return
    }
    // Las partes nuevas copian la cuenta y la categoría; se cambia la que se quiera dividir.
    if (parts.length < 2)
      setParts([
        { key: 0, accountId, categoryId, amount: '' },
        { key: 1, accountId, categoryId, amount: '' }
      ])
  }

  function updatePart(key: number, change: Partial<SplitRow>): void {
    setParts((rows) => rows.map((p) => (p.key === key ? { ...p, ...change } : p)))
  }

  function addPart(): void {
    const last = parts[parts.length - 1]
    setParts([...parts, { key: nextKey(parts), accountId: last?.accountId ?? accountId, categoryId: last?.categoryId ?? null, amount: '' }])
  }

  /** Valida las partes; si exactamente una quedó vacía, se completa con lo que falta. */
  function readSplits(total: number): SplitPart[] | string {
    if (parts.length < 2) return 'Agrega al menos dos partes para dividir el gasto'
    const combos = new Set(parts.map((p) => `${p.accountId}:${p.categoryId}`))
    if (combos.size < parts.length) return 'Dos partes tienen la misma cuenta y la misma categoría; cambia una o júntalas'
    const result: SplitPart[] = []
    let blank: SplitPart | null = null
    for (const p of parts) {
      if (!p.amount.trim()) {
        if (blank) return 'Escribe el monto de cada parte (puedes dejar solo una vacía para que se complete sola)'
        blank = { accountId: p.accountId, categoryId: p.categoryId, amount: 0 }
        result.push(blank)
        continue
      }
      const cents = parseMoney(p.amount)
      if (!cents) return 'Cada parte necesita un monto mayor a cero'
      result.push({ accountId: p.accountId, categoryId: p.categoryId, amount: cents })
    }
    const sum = result.reduce((acc, p) => acc + p.amount, 0)
    if (blank) {
      if (sum >= total) return 'Las otras partes ya cubren el total; quita la parte vacía o ajusta los montos'
      blank.amount = total - sum
      return result
    }
    if (sum !== total)
      return sum < total
        ? `Faltan ${formatMoney(total - sum)} por repartir`
        : `Las partes suman ${formatMoney(sum - total)} más que el total`
    return result
  }

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
      let splits: SplitPart[] | undefined
      if (isSplit) {
        const read = readSplits(cents)
        if (typeof read === 'string') return showError(read)
        splits = read
      }
      const input = { kind: mode, date, accountId: splits?.[0].accountId ?? accountId, amount: cents, categoryId: splits?.[0].categoryId ?? categoryId, description, notes, splits }
      ok = await mutate(() =>
        transaction ? window.api.updateTransaction(transaction.id, input) : window.api.createTransaction(input)
      )
    }
    if (ok) onDone()
  }

  const options = accountOptions(accounts)
  const catOptions = categoryOptions(kindCategories)

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

      {isSplit ? (
        <div className="mb-3">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-sm font-medium text-slate-700">Partes del gasto</span>
            <SplitToggle checked onChange={toggleSplit} />
          </div>
          <div className="space-y-2">
            {parts.map((p) => (
              <div key={p.key} className="space-y-2 rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
                <div className="flex items-center gap-2">
                  <SearchSelect
                    className="min-w-0 flex-1"
                    value={p.accountId}
                    onChange={(id) => updatePart(p.key, { accountId: id })}
                    options={options}
                  />
                  <MoneyInput
                    className={`${inputClass} w-32! shrink-0 text-right`}
                    value={p.amount}
                    onChange={(v) => updatePart(p.key, { amount: v })}
                    placeholder={!p.amount && remaining > 0 ? centsToInput(remaining) : '0.00'}
                    aria-label="Monto de esta parte"
                  />
                  <button
                    type="button"
                    className="shrink-0 rounded-md px-2 py-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:invisible"
                    onClick={() => setParts(parts.filter((x) => x.key !== p.key))}
                    disabled={parts.length <= 2}
                    aria-label="Quitar parte"
                    title="Quitar parte"
                  >
                    ✕
                  </button>
                </div>
                <SearchSelect
                  aria-label="Categoría"
                  value={p.categoryId}
                  onChange={(id) => updatePart(p.key, { categoryId: id })}
                  options={catOptions}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <Button type="button" variant="ghost" className="-ml-3" onClick={addPart}>
              + Agregar parte
            </Button>
            <span className={remaining === 0 ? 'text-emerald-600' : remaining < 0 ? 'text-rose-600' : 'text-slate-500'}>
              {remaining === 0
                ? 'Total cubierto'
                : remaining > 0
                  ? `Falta ${formatMoney(remaining)}`
                  : `Sobran ${formatMoney(-remaining)}`}
            </span>
          </div>
          <span className="mt-1 block text-xs text-slate-500">
            Cada parte puede ir a otra cuenta, a otra categoría o a ambas. Si dejas una vacía, se completa con lo que falta.
          </span>
        </div>
      ) : (
        <Field
          label={mode === 'transfer' ? 'Desde la cuenta' : mode === 'income' ? 'Cuenta que recibe' : 'Pagado con'}
          hint={mode === 'expense' ? <SplitToggle checked={false} onChange={toggleSplit} /> : undefined}
        >
          <SearchSelect value={accountId} onChange={setAccountId} options={options} />
        </Field>
      )}

      {mode === 'transfer' ? (
        <Field
          label="Hacia la cuenta"
          hint={isCardPayment ? 'Esto es un pago de tarjeta: reduce la deuda de la tarjeta.' : undefined}
        >
          <SearchSelect value={toAccountId} onChange={setToAccountId} options={options} />
        </Field>
      ) : isSplit ? null : (
        <Field label="Categoría">
          <SearchSelect value={categoryId} onChange={setCategoryId} options={catOptions} />
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

function SplitToggle({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
      onClick={(e) => {
        // Dentro de un <label>, evitar que el clic abra también la lista de cuentas.
        e.preventDefault()
        onChange(!checked)
      }}
    >
      {checked ? 'No dividir' : 'Dividir entre cuentas o categorías'}
    </button>
  )
}
