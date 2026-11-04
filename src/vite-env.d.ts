/// <reference types="vite/client" />

import type { AsterApi } from '../shared/types'

declare global {
  interface Window {
    aster: AsterApi
  }
}

export {}
