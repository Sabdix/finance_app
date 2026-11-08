import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { formatMoney } from '@shared/money'
import { filterOptions, type Searchable } from '@shared/search'
import type { AccountType, AccountWithBalance, Category } from '@shared/types'

export function AccountDot({ color, className = 'size-2.5' }: { color: string; className?: string }) {
  return <span className={`inline-block shrink-0 rounded-full ${className}`} style={{ backgroundColor: color }} aria-hidden />
}

export interface SelectOption<V> extends Searchable {
  value: V
  color?: string
  /** Encabezado bajo el que se agrupa la opción (las opciones de un mismo grupo deben ir seguidas). */
  group?: string
  /** Texto extra que también se busca, aunque no se muestre. */
  keywords?: string
}

/**
 * Lista desplegable con buscador, que además puede mostrar colores (las opciones de un <select> nativo no se pueden
 * pintar en macOS). Al abrirla, o al empezar a escribir sobre ella, aparece un campo que filtra las opciones.
 * Teclado: flechas para moverse, Enter para elegir, Escape para cerrar.
 */
export function SearchSelect<V>({
  options,
  value,
  onChange,
  className = '',
  'aria-label': ariaLabel
}: {
  options: SelectOption<V>[]
  value: V
  onChange: (value: V) => void
  className?: string
  'aria-label'?: string
}) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const selected = options.find((o) => o.value === value) ?? options[0]
  const visible = useMemo(() => filterOptions(options, query), [options, query])

  useEffect(() => {
    if (!open) return
    const close = (e: globalThis.MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  useEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, id])

  function show(initialQuery = ''): void {
    setQuery(initialQuery)
    const list = filterOptions(options, initialQuery)
    setActive(initialQuery ? 0 : Math.max(0, list.findIndex((o) => o.value === value)))
    setOpen(true)
  }

  function close(): void {
    setOpen(false)
    buttonRef.current?.focus()
  }

  function choose(option: SelectOption<V> | undefined): void {
    if (!option) return
    onChange(option.value)
    close()
  }

  function onButtonKeyDown(e: KeyboardEvent<HTMLButtonElement>): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      show()
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Empezar a escribir sobre la lista cerrada la abre ya filtrando.
      e.preventDefault()
      show(e.key)
    }
  }

  function onSearchKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const delta = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => Math.min(visible.length - 1, Math.max(0, i + delta)))
    } else if (e.key === 'Enter') {
      // No enviar el formulario: Enter elige la opción resaltada.
      e.preventDefault()
      choose(visible[active])
    } else if (e.key === 'Escape') {
      // No dejar que el Escape cierre también el modal.
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  // Dentro de un <label>, un clic en la lista volvería a "activar" el botón; preventDefault lo evita.
  const stop = (e: MouseEvent): void => {
    if (!(e.target instanceof HTMLInputElement)) e.preventDefault()
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={(e) => {
          e.preventDefault()
          if (open) setOpen(false)
          else show()
        }}
        onKeyDown={onButtonKeyDown}
        className="flex w-full items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-left text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
      >
        {selected?.color && <AccountDot color={selected.color} />}
        <span className="flex-1 truncate">{selected?.label ?? ''}</span>
        {selected?.detail && <span className="text-xs text-slate-500 tabular-nums">{selected.detail}</span>}
        <span className="text-slate-400" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div
          onMouseDown={stop}
          className="absolute z-50 mt-1 w-full min-w-56 overflow-hidden rounded-md bg-white text-sm shadow-lg ring-1 ring-slate-200"
        >
          <div className="border-b border-slate-100 p-1.5">
            <input
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls={`${id}-list`}
              aria-activedescendant={visible.length > 0 ? `${id}-${active}` : undefined}
              aria-autocomplete="list"
              className="w-full rounded px-2 py-1 text-sm outline-none placeholder:text-slate-400 focus:bg-slate-50"
              placeholder="Buscar…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              onKeyDown={onSearchKeyDown}
            />
          </div>
          <ul id={`${id}-list`} role="listbox" className="max-h-64 overflow-auto py-1">
            {visible.length === 0 && <li className="px-3 py-1.5 text-slate-400">Sin resultados</li>}
            {visible.map((o, i) => (
              <OptionRow
                key={String(o.value)}
                option={o}
                id={`${id}-${i}`}
                heading={o.group && o.group !== visible[i - 1]?.group ? o.group : null}
                active={i === active}
                selected={o.value === value}
                onHover={() => setActive(i)}
                onChoose={() => choose(o)}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function OptionRow<V>({
  option,
  id,
  heading,
  active,
  selected,
  onHover,
  onChoose
}: {
  option: SelectOption<V>
  id: string
  heading: string | null
  active: boolean
  selected: boolean
  onHover: () => void
  onChoose: () => void
}) {
  return (
    <>
      {heading && (
        <li role="presentation" className="px-3 pt-2 pb-0.5 text-xs font-medium tracking-wide text-slate-400 uppercase">
          {heading}
        </li>
      )}
      <li
        id={id}
        role="option"
        aria-selected={selected}
        onMouseEnter={onHover}
        onClick={(e) => {
          e.preventDefault()
          onChoose()
        }}
        className={`flex cursor-default items-center gap-2 px-3 py-1.5 ${active ? 'bg-indigo-50' : ''} ${selected ? 'font-medium' : ''}`}
      >
        {option.color ? <AccountDot color={option.color} /> : <span className="size-2.5 shrink-0" />}
        <span className="flex-1 truncate">{option.label}</span>
        {option.detail && <span className="text-xs text-slate-500 tabular-nums">{option.detail}</span>}
      </li>
    </>
  )
}

const ACCOUNT_TYPE_WORDS: Record<AccountType, string> = {
  debit: 'débito',
  cash: 'efectivo',
  credit: 'tarjeta crédito'
}

/** Detalle que acompaña a una cuenta en las listas: el saldo, o la deuda si es tarjeta. */
export function accountDetail(a: AccountWithBalance): string {
  return a.type === 'credit' ? `deuda ${formatMoney(Math.max(0, -a.balance))}` : formatMoney(a.balance)
}

export function accountOptions(accounts: AccountWithBalance[]): SelectOption<number>[] {
  return accounts.map((a) => ({
    value: a.id,
    label: a.name,
    color: a.color,
    detail: accountDetail(a),
    keywords: ACCOUNT_TYPE_WORDS[a.type]
  }))
}

/** Categorías agrupadas, con "Sin categoría" al inicio. */
export function categoryOptions(categories: Category[]): SelectOption<number | null>[] {
  const sorted = [...categories].sort(
    (a, b) => a.groupName.localeCompare(b.groupName, 'es') || a.name.localeCompare(b.name, 'es')
  )
  return [
    { value: null, label: 'Sin categoría' },
    ...sorted.map((c) => ({ value: c.id, label: c.name, group: c.groupName }))
  ]
}
