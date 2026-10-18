import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { API_METHODS } from '@shared/api'
import { api } from './api'
import { autoBackup } from './data'
import { closeDb, getDb } from './db/connection'

function registerIpc(): void {
  for (const method of API_METHODS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ipcMain.handle(`api:${method}`, (_event, ...args: unknown[]) => (api[method] as (...a: any[]) => unknown)(...args))
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'Finanzas',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true
    }
  })
  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  getDb()
  autoBackup({ overwrite: false })
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  autoBackup({ overwrite: true })
  closeDb()
})
