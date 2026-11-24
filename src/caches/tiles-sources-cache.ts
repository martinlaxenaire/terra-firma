import * as tilebelt from '@mapbox/tilebelt'
import { TileCacheBase, TileGetOptions, TileType } from '../types/caches.js'

export type TileSource = ImageBitmap | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas

interface TileSourceCache extends TileCacheBase {
  source: TileSource
  url: string
}

interface TileSourceAddOptions extends TileGetOptions {
  source: TileSource
  url: string
}

export const tilesSourcesCache = {
  elevation: new Map<string, TileSourceCache>(),
  satellite: new Map<string, TileSourceCache>(),
  maxLength: 300,

  getKey({ tile = [0, 0, 10], type = 'elevation', provider }: TileGetOptions) {
    return `type:${type},provider:${provider.label},x:${tile[0]},y:${tile[1]},z:${tile[2]}`
  },

  getSource({ tile = [0, 0, 10], type = 'elevation', provider }: TileGetOptions): TileSourceCache | undefined {
    const key = this.getKey({ tile, type, provider })
    return this[type].get(key)
  },

  addSource({ tile = [0, 0, 10], type = 'elevation', provider, source, url }: TileSourceAddOptions) {
    if (source) {
      this[type].set(this.getKey({ tile, type, provider }), {
        tile,
        source,
        provider,
        url,
      })

      if (this[type].size > this.maxLength) {
        this.removeSourceByIndex({ type })
      }
    }
  },

  removeSourceByIndex({ type = 'elevation', index = 0 }: { type?: TileType; index?: number }) {
    if (this[type].size >= index) {
      const keys = Array.from(this[type].keys())
      const keyToDelete = keys[index]

      if (keyToDelete) {
        this[type].delete(keyToDelete)
      }
    }
  },

  removeSourceByTile({ type = 'elevation', tile = [0, 0, 10], provider }: TileGetOptions) {
    this[type].delete(this.getKey({ type, tile, provider }))
  },

  clearCache({ type = 'elevation' }: { type?: TileType }) {
    this[type].clear()
  },

  clearAllCaches() {
    this.clearCache({ type: 'elevation' })
    this.clearCache({ type: 'satellite' })
  },
}
