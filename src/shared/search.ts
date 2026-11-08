/** Minúsculas y sin acentos, para que "credito" encuentre "Crédito". */
export const foldText = (s: string): string => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export interface Searchable {
  label: string
  group?: string
  detail?: string
  keywords?: string
}

/** Deja las opciones donde cada palabra de la búsqueda aparece en el nombre, grupo, detalle o palabras clave. */
export function filterOptions<T extends Searchable>(options: T[], query: string): T[] {
  const words = foldText(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return options
  return options.filter((o) => {
    const text = foldText([o.label, o.group, o.detail, o.keywords].filter(Boolean).join(' '))
    return words.every((w) => text.includes(w))
  })
}
