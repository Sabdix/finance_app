import { useState, type FormEvent } from 'react'
import { ACCOUNT_COLORS, nextAccountColor } from '@shared/colors'
import { centsToInput, formatMoney, parseMoney } from '@shared/money'
import type { AccountType, AccountWithBalance } from '@shared/types'
import type { Navigate } from '../App'
import { Badge, Button, Card, Empty, Field, FormActions, inputClass, Modal, Money, MoneyInput, NotesField, NotesText, PageHeader } from '../components/ui'
import { useApi, useMutate, useShowError } from '../lib/data'

const TYPE_LABEL: Record<AccountType, string> = { debit: 'Débito', credit: 'Crédito', cash: 'Efectivo' }

export function AccountsPage({ navigate }: { navigate: Navigate }) {
  const accounts = useApi(() => window.api.listAccounts())
  const mutate = useMutate()
  const [editing, setEditing] = useState<AccountWithBalance | 'new' | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  if (!accounts) return null
  const visible = accounts.filter((a) => showArchived || !a.archived)
  const money = visible.filter((a) => a.type !== 'credit')
  const credit = visible.filter((a) => a.type === 'credit')

  return (
    <>
      <PageHeader
        title="Cuentas"
        subtitle="Tus cuentas de débito, efectivo y tarjetas de crédito"
        actions={
          <>
            <Button variant="ghost" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? 'Ocultar archivadas' : 'Ver archivadas'}
            </Button>
            <Button onClick={() => setEditing('new')}>Nueva cuenta</Button>
          </>
        }
      />

      {visible.length === 0 && <Empty>Aún no tienes cuentas. Empieza registrando tu cuenta de nómina o tu tarjeta.</Empty>}

      {money.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-slate-500 uppercase">Débito y efectivo</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {money.map((a) => (
              <Card key={a.id} className={`relative overflow-hidden ${a.archived ? 'opacity-60' : ''}`}>
                <ColorStripe color={a.color} />
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium text-slate-900">{a.name}</div>
                    <Badge>{TYPE_LABEL[a.type]}</Badge> {a.archived && <Badge tone="amber">Archivada</Badge>}
                  </div>
                  <Money cents={a.balance} colorize={a.balance < 0} className="text-xl font-semibold" />
                </div>
                <NotesText notes={a.notes} lines={3} className="mt-3 text-sm" />
                <AccountActions account={a} onEdit={() => setEditing(a)} navigate={navigate} mutate={mutate} />
              </Card>
            ))}
          </div>
        </section>
      )}

      {credit.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-500 uppercase">Tarjetas de crédito</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {credit.map((a) => {
              const debt = Math.max(0, -a.balance)
              return (
                <Card key={a.id} className={`relative overflow-hidden ${a.archived ? 'opacity-60' : ''}`}>
                  <ColorStripe color={a.color} />
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium text-slate-900">{a.name}</div>
                      <Badge tone="indigo">Crédito</Badge> {a.archived && <Badge tone="amber">Archivada</Badge>}
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-500">Deuda</div>
                      <Money cents={debt} className="text-xl font-semibold text-rose-600" />
                    </div>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-y-1 text-sm">
                    {a.creditLimit !== null && (
                      <>
                        <dt className="text-slate-500">Disponible</dt>
                        <dd className="text-right tabular-nums">{formatMoney(a.creditLimit + a.balance)}</dd>
                      </>
                    )}
                    <dt className="text-slate-500">Deuda en MSI</dt>
                    <dd className="text-right tabular-nums">{formatMoney(a.msiPending)}</dd>
                    {a.balance > 0 && (
                      <>
                        <dt className="text-slate-500">Saldo a favor</dt>
                        <dd className="text-right text-emerald-600 tabular-nums">{formatMoney(a.balance)}</dd>
                      </>
                    )}
                    {a.statementDay && (
                      <>
                        <dt className="text-slate-500">Corte / pago</dt>
                        <dd className="text-right">
                          día {a.statementDay} / día {a.dueDay ?? '—'}
                        </dd>
                      </>
                    )}
                  </dl>
                  <NotesText notes={a.notes} lines={3} className="mt-3 text-sm" />
                  <AccountActions account={a} onEdit={() => setEditing(a)} navigate={navigate} mutate={mutate} />
                </Card>
              )
            })}
          </div>
        </section>
      )}

      <Modal title={editing === 'new' ? 'Nueva cuenta' : 'Editar cuenta'} open={editing !== null} onClose={() => setEditing(null)}>
        {editing !== null && (
          <AccountForm
            account={editing === 'new' ? null : editing}
            usedColors={accounts.filter((a) => !a.archived).map((a) => a.color)}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </>
  )
}

function AccountActions({
  account,
  onEdit,
  navigate,
  mutate
}: {
  account: AccountWithBalance
  onEdit: () => void
  navigate: Navigate
  mutate: ReturnType<typeof useMutate>
}) {
  return (
    <div className="mt-4 flex gap-1 border-t border-slate-100 pt-3">
      <Button variant="ghost" onClick={() => navigate({ page: 'transactions', accountId: account.id })}>
        Movimientos
      </Button>
      <Button variant="ghost" onClick={onEdit}>
        Editar
      </Button>
      <Button
        variant="ghost"
        className="ml-auto"
        onClick={() => mutate(() => window.api.setAccountArchived(account.id, !account.archived))}
      >
        {account.archived ? 'Restaurar' : 'Archivar'}
      </Button>
    </div>
  )
}

function ColorStripe({ color }: { color: string }) {
  return <div className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: color }} aria-hidden />
}

function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const isCustom = !ACCOUNT_COLORS.some((c) => c.hex === value.toLowerCase())
  return (
    // No es un <label>: dentro de uno, cada clic activaría la primera muestra.
    <div className="mb-3" role="radiogroup" aria-label="Color">
      <span className="mb-1 block text-sm font-medium text-slate-700">Color</span>
      <div className="flex flex-wrap items-center gap-2">
        {ACCOUNT_COLORS.map((c) => (
          <button
            key={c.hex}
            type="button"
            role="radio"
            aria-checked={value.toLowerCase() === c.hex}
            title={c.name}
            onClick={() => onChange(c.hex)}
            className={`size-7 rounded-full ring-offset-2 transition ${value.toLowerCase() === c.hex ? 'ring-2 ring-slate-800' : 'hover:scale-110'}`}
            style={{ backgroundColor: c.hex }}
          />
        ))}
        <label
          title="Otro color"
          className={`relative flex size-7 cursor-pointer items-center justify-center rounded-full border border-dashed border-slate-400 text-xs text-slate-500 ring-offset-2 ${isCustom ? 'ring-2 ring-slate-800' : ''}`}
          style={isCustom ? { backgroundColor: value, borderStyle: 'solid' } : undefined}
        >
          {!isCustom && '+'}
          <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={value} onChange={(e) => onChange(e.target.value)} />
        </label>
      </div>
    </div>
  )
}

function AccountForm({
  account,
  usedColors,
  onDone
}: {
  account: AccountWithBalance | null
  usedColors: string[]
  onDone: () => void
}) {
  const mutate = useMutate()
  const showError = useShowError()
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType>(account?.type ?? 'debit')
  const isCredit = type === 'credit'
  // En crédito se captura la deuda en positivo y se guarda en negativo.
  const [opening, setOpening] = useState(
    account ? centsToInput(account.type === 'credit' ? -account.openingBalance : account.openingBalance) : ''
  )
  const [limit, setLimit] = useState(account?.creditLimit != null ? centsToInput(account.creditLimit) : '')
  const [statementDay, setStatementDay] = useState(account?.statementDay?.toString() ?? '')
  const [dueDay, setDueDay] = useState(account?.dueDay?.toString() ?? '')
  const [color, setColor] = useState(account?.color ?? nextAccountColor(usedColors))
  const [notes, setNotes] = useState(account?.notes ?? '')

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    const openingCents = opening.trim() === '' ? 0 : parseMoney(opening)
    if (openingCents === null) return showError('Saldo inicial inválido')
    const limitCents = isCredit && limit.trim() !== '' ? parseMoney(limit) : null
    if (isCredit && limit.trim() !== '' && limitCents === null) return showError('Límite inválido')
    const input = {
      name,
      type,
      openingBalance: isCredit ? -openingCents : openingCents,
      creditLimit: limitCents,
      statementDay: isCredit && statementDay ? Number(statementDay) : null,
      dueDay: isCredit && dueDay ? Number(dueDay) : null,
      color,
      notes
    }
    const ok = await mutate(() =>
      account ? window.api.updateAccount(account.id, input) : window.api.createAccount(input)
    )
    if (ok) onDone()
  }

  return (
    <form onSubmit={submit}>
      <Field label="Nombre">
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="BBVA Nómina" />
      </Field>
      <ColorPicker value={color} onChange={setColor} />
      <Field label="Tipo">
        <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as AccountType)}>
          <option value="debit">Débito</option>
          <option value="cash">Efectivo</option>
          <option value="credit">Tarjeta de crédito</option>
        </select>
      </Field>
      <Field
        label={isCredit ? 'Deuda actual' : 'Saldo actual'}
        hint={
          isCredit
            ? 'Lo que debes hoy, sin contar las compras a meses que registrarás aparte.'
            : 'Lo que tiene la cuenta hoy. A partir de aquí se suman los movimientos.'
        }
      >
        <MoneyInput value={opening} onChange={setOpening} />
      </Field>
      {isCredit && (
        <>
          <Field label="Límite de crédito">
            <MoneyInput value={limit} onChange={setLimit} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Día de corte">
              <input className={inputClass} type="number" min={1} max={31} value={statementDay} onChange={(e) => setStatementDay(e.target.value)} />
            </Field>
            <Field label="Día límite de pago">
              <input className={inputClass} type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
            </Field>
          </div>
        </>
      )}
      <NotesField value={notes} onChange={setNotes} />
      <FormActions onCancel={onDone} />
    </form>
  )
}
