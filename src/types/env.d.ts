/// <reference types="vite/client" /> // Keep this line if using Vite

interface ImportMetaEnv {
  readonly VITE_MAPBOX_KEY: string
  readonly VITE_MAPTILER_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
