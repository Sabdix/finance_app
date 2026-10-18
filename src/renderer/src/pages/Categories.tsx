import { useState, type FormEvent } from 'react'
import type { Category, CategoryInput } from '@shared/types'
import { Badge, Button, Card, Field, FormActions, inputClass, Modal, PageHeader } from '../components/ui'
import { useApi, useMutate } from '../lib/data'

export function CategoriesPage() {
  const categories = useApi(() => window.api.listCategories())
  const mutate = useMutate()
  const [editing, setEditing] = useState<Category | 'new' | null>(null)

  if (!categories) return null
  const groups = new Map<string, Category[]>()
  // Las cajitas de pago de tarjeta se crean y nombran solas desde Cuentas.
  for (const c of categories.filter((x) => x.kind !== 'card_payment')) groups.set(c.groupName, [...(groups.get(c.groupName) ?? []), c])

  return (
    <>
      <PageHeader
        title="Categorías"
        subtitle="Cada categoría de gasto será una cajita de presupuesto"
        actions={<Button onClick={() => setEditing('new')}>Nueva categoría</Button>}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[...groups].map(([group, list]) => (
          <Card key={group}>
            <h2 className="mb-3 font-semibold text-slate-900">{group}</h2>
            <ul className="divide-y divide-slate-100">
              {list.map((c) => (
                <li key={c.id} className={`flex items-center gap-2 py-2 text-sm ${c.archived ? 'opacity-50' : ''}`}>
                  <span className="flex-1">{c.name}</span>
                  {c.kind === 'income' && <Badge tone="emerald">Ingreso</Badge>}
                  {c.archived && <Badge tone="amber">Archivada</Badge>}
                  <Button variant="ghost" onClick={() => setEditing(c)}>
                    Editar
                  </Button>
                  <Button variant="ghost" onClick={() => mutate(() => window.api.setCategoryArchived(c.id, !c.archived))}>
                    {c.archived ? 'Restaurar' : 'Archivar'}
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <Modal title={editing === 'new' ? 'Nueva categoría' : 'Editar categoría'} open={editing !== null} onClose={() => setEditing(null)}>
        {editing !== null && (
          <CategoryForm
            category={editing === 'new' ? null : editing}
            groups={[...groups.keys()]}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </>
  )
}

function CategoryForm({ category, groups, onDone }: { category: Category | null; groups: string[]; onDone: () => void }) {
  const mutate = useMutate()
  const [name, setName] = useState(category?.name ?? '')
  const [groupName, setGroupName] = useState(category?.groupName ?? '')
  const [kind, setKind] = useState<CategoryInput['kind']>(category?.kind === 'income' ? 'income' : 'expense')

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    const input = { name, groupName, kind }
    const ok = await mutate(() =>
      category ? window.api.updateCategory(category.id, input) : window.api.createCategory(input)
    )
    if (ok) onDone()
  }

  return (
    <form onSubmit={submit}>
      <Field label="Nombre">
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <Field label="Grupo" hint="Escribe uno existente o uno nuevo">
        <input className={inputClass} value={groupName} onChange={(e) => setGroupName(e.target.value)} list="category-groups" />
        <datalist id="category-groups">
          {groups.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </Field>
      <Field label="Tipo">
        <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as CategoryInput['kind'])}>
          <option value="expense">Gasto</option>
          <option value="income">Ingreso</option>
        </select>
      </Field>
      <FormActions onCancel={onDone} />
    </form>
  )
}
