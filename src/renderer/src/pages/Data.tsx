import { useState } from 'react'
import { Button, Card, Field, inputClass, PageHeader } from '../components/ui'
import { useApi, useMutate } from '../lib/data'
import type { CsvExportKind } from '@shared/types'

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function DataPage() {
  const info = useApi(() => window.api.getBackupInfo())
  const mutate = useMutate()
  const [notice, setNotice] = useState<string | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  if (!info) return null

  /** Ejecuta una acción y, si devuelve un mensaje, lo muestra como aviso. */
  async function run(action: () => Promise<string | null | undefined>): Promise<void> {
    let message: string | null | undefined = null
    const ok = await mutate(async () => {
      message = await action()
    })
    setNotice(ok && message ? message : null)
  }

  const exportCsv = (kind: CsvExportKind): Promise<void> =>
    run(async () => {
      const path = await window.api.exportCsv(kind, from || undefined, to || undefined)
      return path && `Archivo guardado en ${path}`
    })

  return (
    <>
      <PageHeader title="Respaldo y exportación" subtitle="Tus datos viven solo en este equipo; respáldalos y llévatelos cuando quieras" />

      {notice && (
        <div className="mb-6 flex items-start justify-between gap-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span className="break-all">{notice}</span>
          <button className="text-emerald-700 hover:text-emerald-900" onClick={() => setNotice(null)} aria-label="Cerrar aviso">
            ✕
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="mb-1 font-semibold">Respaldos</h2>
          <p className="mb-4 text-sm text-slate-600">
            Se guarda un respaldo automático al abrir la app (uno por día) y otro al cerrarla, y se conservan los{' '}
            30 días más recientes. Si eliges una carpeta de iCloud Drive u OneDrive, tus respaldos quedan también
            fuera de este equipo.
          </p>
          <div className="mb-4 rounded-md bg-slate-50 px-3 py-2 font-mono text-xs break-all text-slate-600">
            {info.folder}
            {info.isDefaultFolder && <span className="ml-2 font-sans text-slate-400">(predeterminada)</span>}
          </div>
          <div className="mb-6 flex flex-wrap gap-2">
            <Button onClick={() => run(async () => `Respaldo guardado en ${await window.api.backupNow()}`)}>Respaldar ahora</Button>
            <Button variant="secondary" onClick={() => run(async () => void (await window.api.openBackupFolder()))}>
              Abrir carpeta
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                run(async () => {
                  const folder = await window.api.chooseBackupFolder()
                  return folder && `Los respaldos ahora se guardan en ${folder}`
                })
              }
            >
              Cambiar carpeta…
            </Button>
            {!info.isDefaultFolder && (
              <Button variant="ghost" onClick={() => run(async () => void (await window.api.resetBackupFolder()))}>
                Usar la predeterminada
              </Button>
            )}
          </div>

          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Restaurar</h3>
            <Button
              variant="ghost"
              onClick={() => run(async () => ((await window.api.restoreBackup()) ? 'Respaldo restaurado' : null))}
            >
              Desde un archivo…
            </Button>
          </div>
          {info.backups.length === 0 ? (
            <p className="text-sm text-slate-500">Aún no hay respaldos en esta carpeta.</p>
          ) : (
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto text-sm">
              {info.backups.map((b) => (
                <li key={b.name} className="flex items-center gap-3 py-2">
                  <div className="flex-1">
                    <div>{b.name}</div>
                    <div className="text-xs text-slate-500">
                      {new Date(b.modifiedAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
                      {formatSize(b.size)}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => run(async () => ((await window.api.restoreBackup(b.name)) ? `Restaurado ${b.name}` : null))}
                  >
                    Restaurar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="mb-1 font-semibold">Exportar a CSV</h2>
            <p className="mb-4 text-sm text-slate-600">
              Se abre en Excel, Numbers o Google Sheets. Los montos van con punto decimal y dos decimales.
            </p>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Movimientos</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Desde (opcional)">
                <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="Hasta (opcional)">
                <input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </div>
            <Button onClick={() => exportCsv('transactions')}>Exportar movimientos</Button>

            <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" onClick={() => exportCsv('accounts')}>
                Cuentas y saldos
              </Button>
              <Button variant="secondary" onClick={() => exportCsv('installments')}>
                Calendario de meses sin intereses
              </Button>
            </div>
          </Card>

          <Card>
            <h2 className="mb-1 font-semibold">Base de datos</h2>
            <p className="mb-2 text-sm text-slate-600">Archivo con todos tus datos. Para llevarlo a otro equipo usa un respaldo.</p>
            <div className="rounded-md bg-slate-50 px-3 py-2 font-mono text-xs break-all text-slate-600">{info.dbPath}</div>
          </Card>
        </div>
      </div>
    </>
  )
}
