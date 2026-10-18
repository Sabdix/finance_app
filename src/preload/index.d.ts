import type { AsyncApi } from '../shared/api'

declare global {
  interface Window {
    api: AsyncApi
  }
}
