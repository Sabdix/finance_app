import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { centsToInput, formatMoney, isMoneyDraft, parseMoney } from '@shared/money'

const variants = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
  secondary: 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50',
  danger: 'bg-white text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50',
  ghost: 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return (
    <button
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 ${className}`}>{children}</div>
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex gap-2">{actions}</div>
    </div>
  )
}

export function Stat({ label, cents, tone }: { label: string; cents: number; tone?: 'good' | 'bad' }) {
  const color = tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-rose-600' : 'text-slate-900'
  return (
    <Card>
      <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${color}`}>{formatMoney(cents)}</div>
    </Card>
  )
}

export function Money({ cents, colorize = false, className = '' }: { cents: number; colorize?: boolean; className?: string }) {
  const color = !colorize ? '' : cents < 0 ? 'text-rose-600' : cents > 0 ? 'text-emerald-600' : 'text-slate-500'
  return <span className={`tabular-nums ${color} ${className}`}>{formatMoney(cents)}</span>
}

export function Modal({
  title,
  open,
  onClose,
  children,
  wide = false
}: {
  title: string
  open: boolean
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-8" onMouseDown={onClose}>
      <div
        className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-xl bg-white p-6 shadow-xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-slate-900">{title}</h2>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none'

/**
 * Campo para capturar montos: no deja escribir más de dos decimales y, al salir del campo,
 * lo normaliza a dos decimales con separador de miles ("1500" -> "1,500.00").
 */
export function MoneyInput({
  value,
  onChange,
  allowNegative = false,
  className = inputClass,
  onBlur,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string
  onChange: (value: string) => void
  allowNegative?: boolean
}) {
  return (
    <input
      {...rest}
      className={className}
      value={value}
      inputMode="decimal"
      placeholder={rest.placeholder ?? '0.00'}
      onChange={(e) => {
        if (isMoneyDraft(e.target.value, { allowNegative })) onChange(e.target.value)
      }}
      onBlur={(e) => {
        const cents = parseMoney(value, { allowNegative })
        if (cents !== null) onChange(centsToInput(cents))
        onBlur?.(e)
      }}
    />
  )
}

export const MAX_NOTES = 2000

/** Área de texto para observaciones, con contador cuando se acerca al límite. */
export function NotesField({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <Field
      label="Observaciones"
      hint={value.length > MAX_NOTES - 200 ? `${value.length} / ${MAX_NOTES} caracteres` : undefined}
    >
      <textarea
        className={`${inputClass} min-h-20 resize-y`}
        rows={3}
        maxLength={MAX_NOTES}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Opcional"
      />
    </Field>
  )
}

/** Observaciones en listas: respeta saltos de línea, se corta a unas líneas y muestra todo al pasar el mouse. */
export function NotesText({ notes, lines = 2, className = '' }: { notes: string; lines?: 2 | 3; className?: string }) {
  if (!notes) return null
  return (
    <p className={`whitespace-pre-line text-slate-500 ${lines === 2 ? 'line-clamp-2' : 'line-clamp-3'} ${className}`} title={notes}>
      {notes}
    </p>
  )
}

export function FormActions({ onCancel, submitLabel = 'Guardar' }: { onCancel: () => void; submitLabel?: string }) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <Button type="button" variant="secondary" onClick={onCancel}>
        Cancelar
      </Button>
      <Button type="submit">{submitLabel}</Button>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">{children}</div>
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max === 0 ? 0 : Math.min(100, (value / max) * 100)
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'indigo' | 'amber' | 'emerald' | 'rose' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600',
    indigo: 'bg-indigo-50 text-indigo-700',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700'
  }
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>
}
