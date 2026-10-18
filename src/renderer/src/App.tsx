import { useState } from 'react'
import { AccountsPage } from './pages/Accounts'
import { BudgetPage } from './pages/Budget'
import { CategoriesPage } from './pages/Categories'
import { DashboardPage } from './pages/Dashboard'
import { DataPage } from './pages/Data'
import { InstallmentsPage } from './pages/Installments'
import { ReportsPage } from './pages/Reports'
import { TransactionsPage } from './pages/Transactions'

export type Route =
  | { page: 'dashboard' }
  | { page: 'budget' }
  | { page: 'accounts' }
  | { page: 'transactions'; accountId?: number }
  | { page: 'installments' }
  | { page: 'categories' }
  | { page: 'reports' }
  | { page: 'data' }

export type Navigate = (route: Route) => void

const NAV: { page: Route['page']; label: string }[] = [
  { page: 'dashboard', label: 'Resumen' },
  { page: 'budget', label: 'Presupuesto' },
  { page: 'accounts', label: 'Cuentas' },
  { page: 'transactions', label: 'Movimientos' },
  { page: 'installments', label: 'Meses sin intereses' },
  { page: 'reports', label: 'Reportes' },
  { page: 'categories', label: 'Categorías' },
  { page: 'data', label: 'Respaldo y exportación' }
]

export function App() {
  const [route, setRoute] = useState<Route>({ page: 'dashboard' })

  return (
    <div className="flex h-full">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-6">
        <div className="mb-6 px-3 text-lg font-semibold text-indigo-600">Finanzas</div>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <button
              key={item.page}
              onClick={() => setRoute({ page: item.page } as Route)}
              className={`rounded-md px-3 py-2 text-left text-sm font-medium ${
                route.page === item.page ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto px-10 py-8">
        {route.page === 'dashboard' && <DashboardPage navigate={setRoute} />}
        {route.page === 'budget' && <BudgetPage />}
        {route.page === 'accounts' && <AccountsPage navigate={setRoute} />}
        {route.page === 'transactions' && <TransactionsPage initialAccountId={route.accountId} />}
        {route.page === 'installments' && <InstallmentsPage />}
        {route.page === 'categories' && <CategoriesPage />}
        {route.page === 'reports' && <ReportsPage />}
        {route.page === 'data' && <DataPage />}
      </main>
    </div>
  )
}
