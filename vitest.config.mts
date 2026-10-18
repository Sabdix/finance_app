import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared') } },
  test: {
    include: ['src/**/*.test.ts'],
    // Las pruebas de base de datos solo corren con `npm run test:db` (Node de Electron).
    exclude: process.env.FINANZAS_DB_TESTS ? [] : ['src/main/**']
  }
})
