import type Database from 'better-sqlite3'

/**
 * Cada migración se aplica una sola vez, en orden. `PRAGMA user_version` guarda cuántas se han aplicado.
 * Nunca edites una migración ya publicada: agrega una nueva al final.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE accounts (
    id              INTEGER PRIMARY KEY,
    name            TEXT    NOT NULL,
    type            TEXT    NOT NULL CHECK (type IN ('debit', 'credit', 'cash')),
    opening_balance INTEGER NOT NULL DEFAULT 0,
    credit_limit    INTEGER,
    statement_day   INTEGER CHECK (statement_day BETWEEN 1 AND 31),
    due_day         INTEGER CHECK (due_day BETWEEN 1 AND 31),
    archived        INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE categories (
    id         INTEGER PRIMARY KEY,
    name       TEXT    NOT NULL,
    group_name TEXT    NOT NULL DEFAULT 'General',
    kind       TEXT    NOT NULL CHECK (kind IN ('expense', 'income')),
    archived   INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE transfers (
    id              INTEGER PRIMARY KEY,
    from_account_id INTEGER NOT NULL REFERENCES accounts(id),
    to_account_id   INTEGER NOT NULL REFERENCES accounts(id),
    amount          INTEGER NOT NULL CHECK (amount > 0),
    date            TEXT    NOT NULL
  );

  CREATE TABLE installment_plans (
    id            INTEGER PRIMARY KEY,
    account_id    INTEGER NOT NULL REFERENCES accounts(id),
    category_id   INTEGER REFERENCES categories(id),
    description   TEXT    NOT NULL,
    purchase_date TEXT    NOT NULL,
    total_amount  INTEGER NOT NULL CHECK (total_amount > 0),
    months        INTEGER NOT NULL CHECK (months >= 1)
  );

  CREATE TABLE installments (
    id       INTEGER PRIMARY KEY,
    plan_id  INTEGER NOT NULL REFERENCES installment_plans(id) ON DELETE CASCADE,
    number   INTEGER NOT NULL,
    due_date TEXT    NOT NULL,
    amount   INTEGER NOT NULL,
    paid_at  TEXT,
    UNIQUE (plan_id, number)
  );

  CREATE TABLE transactions (
    id                  INTEGER PRIMARY KEY,
    date                TEXT    NOT NULL,
    account_id          INTEGER NOT NULL REFERENCES accounts(id),
    amount              INTEGER NOT NULL,
    category_id         INTEGER REFERENCES categories(id),
    description         TEXT    NOT NULL DEFAULT '',
    transfer_id         INTEGER REFERENCES transfers(id) ON DELETE CASCADE,
    installment_plan_id INTEGER REFERENCES installment_plans(id) ON DELETE CASCADE,
    created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_transactions_account ON transactions(account_id, date);
  CREATE INDEX idx_transactions_category ON transactions(category_id, date);

  -- Cajitas de presupuesto: cuánto se asigna a cada categoría por mes (se usa en la fase 2).
  CREATE TABLE budget_allocations (
    id          INTEGER PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    month       TEXT    NOT NULL,
    amount      INTEGER NOT NULL,
    UNIQUE (category_id, month)
  );

  INSERT INTO categories (name, group_name, kind) VALUES
    ('Sueldo', 'Ingresos', 'income'),
    ('Otros ingresos', 'Ingresos', 'income'),
    ('Renta / Hipoteca', 'Vivienda', 'expense'),
    ('Luz, agua y gas', 'Vivienda', 'expense'),
    ('Internet y teléfono', 'Vivienda', 'expense'),
    ('Supermercado', 'Comida', 'expense'),
    ('Restaurantes', 'Comida', 'expense'),
    ('Gasolina', 'Transporte', 'expense'),
    ('Transporte público / apps', 'Transporte', 'expense'),
    ('Salud', 'Personal', 'expense'),
    ('Ropa', 'Personal', 'expense'),
    ('Suscripciones', 'Personal', 'expense'),
    ('Entretenimiento', 'Personal', 'expense'),
    ('Comisiones e intereses', 'Financiero', 'expense');
  `,
  // Fase 2: cada tarjeta de crédito tiene su cajita "Pago de tarjeta". SQLite no permite cambiar un CHECK,
  // así que la tabla de categorías se reconstruye conservando los ids.
  `
  CREATE TABLE categories_new (
    id         INTEGER PRIMARY KEY,
    name       TEXT    NOT NULL,
    group_name TEXT    NOT NULL DEFAULT 'General',
    kind       TEXT    NOT NULL CHECK (kind IN ('expense', 'income', 'card_payment')),
    account_id INTEGER REFERENCES accounts(id),
    archived   INTEGER NOT NULL DEFAULT 0,
    CHECK ((kind = 'card_payment') = (account_id IS NOT NULL))
  );
  INSERT INTO categories_new (id, name, group_name, kind, archived)
    SELECT id, name, group_name, kind, archived FROM categories;
  DROP TABLE categories;
  ALTER TABLE categories_new RENAME TO categories;
  CREATE UNIQUE INDEX idx_categories_card ON categories(account_id) WHERE account_id IS NOT NULL;

  INSERT INTO categories (name, group_name, kind, account_id, archived)
    SELECT 'Pago ' || name, 'Pagos de tarjetas', 'card_payment', id, archived FROM accounts WHERE type = 'credit';

  CREATE INDEX idx_allocations_month ON budget_allocations(month);
  `,
  // Color por cuenta. Las cuentas existentes reciben colores distintos de la paleta, en orden de alta.
  `
  ALTER TABLE accounts ADD COLUMN color TEXT NOT NULL DEFAULT '#4f46e5';
  UPDATE accounts SET color = (
    SELECT CASE (n - 1) % 12
      WHEN 0 THEN '#4f46e5' WHEN 1 THEN '#2563eb' WHEN 2 THEN '#0284c7' WHEN 3 THEN '#0d9488'
      WHEN 4 THEN '#059669' WHEN 5 THEN '#65a30d' WHEN 6 THEN '#d97706' WHEN 7 THEN '#ea580c'
      WHEN 8 THEN '#dc2626' WHEN 9 THEN '#db2777' WHEN 10 THEN '#9333ea' ELSE '#475569' END
    FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS n FROM accounts) ranked
    WHERE ranked.id = accounts.id
  );
  `,
  // Ajustes de la app (por ejemplo, la carpeta de respaldos).
  `
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  // Observaciones libres en cuentas y movimientos.
  `
  ALTER TABLE accounts ADD COLUMN notes TEXT NOT NULL DEFAULT '';
  ALTER TABLE transactions ADD COLUMN notes TEXT NOT NULL DEFAULT '';
  `
]

/**
 * Las llaves foráneas se apagan durante las migraciones para poder reconstruir tablas
 * (procedimiento recomendado por SQLite) y se verifica la integridad antes de confirmar cada una.
 */
export const MIGRATION_COUNT = MIGRATIONS.length

export function migrate(db: Database.Database, upTo = MIGRATIONS.length): void {
  const current = db.pragma('user_version', { simple: true }) as number
  if (current >= upTo) return
  db.pragma('foreign_keys = OFF')
  try {
    for (let v = current; v < upTo; v++) {
      db.transaction(() => {
        db.exec(MIGRATIONS[v])
        const broken = db.pragma('foreign_key_check') as unknown[]
        if (broken.length > 0) throw new Error(`La migración ${v + 1} rompe llaves foráneas`)
        db.pragma(`user_version = ${v + 1}`)
      })()
    }
  } finally {
    db.pragma('foreign_keys = ON')
  }
}
