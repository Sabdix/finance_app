import { join } from 'node:path'
import Database from 'better-sqlite3'
import { app } from 'electron'
import { migrate } from './migrations'

let db: Database.Database | null = null
let migrated = false

export function dbPath(): string {
  return join(app.getPath('userData'), 'finanzas.db')
}

/**
 * Conexión única a la base. Las migraciones pendientes se aplican la primera vez que se pide;
 * con `migrate: false` se obtiene la base tal como está (sirve para respaldarla antes de migrar).
 */
export function getDb({ migrate: runMigrations = true }: { migrate?: boolean } = {}): Database.Database {
  if (!db) {
    db = new Database(dbPath())
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
  }
  if (runMigrations && !migrated) {
    migrate(db)
    migrated = true
  }
  return db
}

export function closeDb(): void {
  db?.close()
  db = null
  migrated = false
}
