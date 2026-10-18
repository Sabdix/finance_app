import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { formatMoney } from '@shared/money'
import type { AccountWithBalance } from '@shared/types'

export function AccountDot({ color, className = 'size-2.5' }: { color: string; className?: string }) {
  return <span className={`inline-block shrink-0 rounded-full ${className}`} style={{ backgroundColor: color }} aria-hidden />
}

export interface ColorOption<V> {
  value: V
  label: string
  color?: string
  detail?: string
}

/**
 * Lista desplegable que sí puede mostrar colores (las opciones de un <select> nativo no se pueden pintar en macOS).
 * Se maneja con teclado: flechas para moverse, Enter o espacio para elegir y Escape para cerrar.
 */
export function ColorSelect<V>({
  options,
  value,
  onChange,
  className = ''
}: {
  options: ColorOption<V>[]
  value: V
  onChange: (value: V) => void
  className?: string
}) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value))
  const [active, setActive] = useState(selectedIndex)
  const selected = options[selectedIndex]

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

  function show(): void {
    setActive(selectedIndex)
    setOpen(true)
  }

  function choose(index: number): void {
    onChange(options[index].value)
    setOpen(false)
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return show()
      const delta = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => Math.min(options.length - 1, Math.max(0, i + delta)))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (open) choose(active)
      else show()
    } else if (e.key === 'Escape' && open) {
      // No dejar que el Escape cierre también el modal.
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  // Dentro de un <label>, un clic en la lista volvería a "activar" el botón; preventDefault lo evita.
  const stop = (e: MouseEvent): void => e.preventDefault()

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={`${id}-list`}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        onClick={(e) => {
          e.preventDefault()
          if (open) setOpen(false)
          else show()
        }}
        onKeyDown={onKeyDown}
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
        <ul
          id={`${id}-list`}
          role="listbox"
          onMouseDown={stop}
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md bg-white py-1 text-sm shadow-lg ring-1 ring-slate-200"
        >
          {options.map((o, i) => (
            <li
              key={String(o.value)}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === selectedIndex}
              onMouseEnter={() => setActive(i)}
              onClick={(e) => {
                e.preventDefault()
                choose(i)
              }}
              className={`flex cursor-default items-center gap-2 px-3 py-1.5 ${i === active ? 'bg-indigo-50' : ''} ${
                i === selectedIndex ? 'font-medium' : ''
              }`}
            >
              {o.color ? <AccountDot color={o.color} /> : <span className="size-2.5 shrink-0" />}
              <span className="flex-1 truncate">{o.label}</span>
              {o.detail && <span className="text-xs text-slate-500 tabular-nums">{o.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Detalle que acompaña a una cuenta en las listas: el saldo, o la deuda si es tarjeta. */
export function accountDetail(a: AccountWithBalance): string {
  return a.type === 'credit' ? `deuda ${formatMoney(Math.max(0, -a.balance))}` : formatMoney(a.balance)
}

export function accountOptions(accounts: AccountWithBalance[]): ColorOption<number>[] {
  return accounts.map((a) => ({ value: a.id, label: a.name, color: a.color, detail: accountDetail(a) }))
}
