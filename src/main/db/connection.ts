import { join } from 'node:path'
import Database from 'better-sqlite3'
import { app } from 'electron'
import { migrate } from './migrations'

let db: Database.Database | null = null

export function dbPath(): string {
  return join(app.getPath('userData'), 'finanzas.db')
}

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(dbPath())
    db.pragma('journal_mode = WAL')
    migrate(db)
    db.pragma('foreign_keys = ON')
  }
  return db
}

export function closeDb(): void {
  db?.close()
  db = null
}
