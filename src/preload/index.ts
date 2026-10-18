import { contextBridge, ipcRenderer } from 'electron'
import { API_METHODS, type AsyncApi } from '@shared/api'

const api = Object.fromEntries(
  API_METHODS.map((method) => [method, (...args: unknown[]) => ipcRenderer.invoke(`api:${method}`, ...args)])
) as AsyncApi

contextBridge.exposeInMainWorld('api', api)
