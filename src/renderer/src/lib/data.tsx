import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

interface DataContext {
  version: number
  refresh: () => void
  error: string | null
  setError: (msg: string | null) => void
}

const Ctx = createContext<DataContext | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 5000)
    return () => clearTimeout(t)
  }, [error])

  return (
    <Ctx.Provider value={{ version, refresh, error, setError }}>
      {children}
      {error && (
        <div className="fixed right-4 bottom-4 z-50 max-w-sm rounded-lg bg-rose-600 px-4 py-3 text-sm text-white shadow-lg">
          {error}
        </div>
      )}
    </Ctx.Provider>
  )
}

function useCtx(): DataContext {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('DataProvider faltante')
  return ctx
}

/** Quita el prefijo que Electron agrega a los errores que vienen del proceso principal. */
function cleanError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** Carga datos y los vuelve a cargar cada vez que alguna mutación termina. */
export function useApi<T>(load: () => Promise<T>, deps: unknown[] = []): T | undefined {
  const { version, setError } = useCtx()
  const [data, setData] = useState<T>()
  useEffect(() => {
    let alive = true
    load().then(
      (d) => alive && setData(d),
      (e) => setError(cleanError(e))
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps])
  return data
}

/** Ejecuta un cambio; si sale bien refresca todas las vistas, si falla muestra el error. */
export function useMutate(): (fn: () => Promise<unknown>) => Promise<boolean> {
  const { refresh, setError } = useCtx()
  return useCallback(
    async (fn) => {
      try {
        await fn()
        refresh()
        return true
      } catch (e) {
        setError(cleanError(e))
        return false
      }
    },
    [refresh, setError]
  )
}

export function useShowError(): (msg: string) => void {
  return useCtx().setError
}
