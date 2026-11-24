import SatelliteTileTexture from '../TileTextures/SatelliteTileTexture.js'
import ElevationTileTexture from '../TileTextures/ElevationTileTexture.js'
import { TileCacheBase, TileGetOptions, TileType } from '../types/caches.js'

type TileTexture = SatelliteTileTexture | ElevationTileTexture

interface TileTextureCache extends TileCacheBase {
  texture: TileTexture
}

interface TileTextureAddOptions extends TileGetOptions {
  texture: TileTexture
}

function getTexture(options: TileGetOptions & { type?: 'elevation' }): ElevationTileTexture | undefined
function getTexture(options: TileGetOptions & { type: 'satellite' }): SatelliteTileTexture | undefined

function getTexture({
  tile = [0, 0, 10],
  type = 'elevation',
  provider,
}: TileGetOptions): SatelliteTileTexture | ElevationTileTexture | undefined {
  const key = tilesTextureCache.getKey({ tile, type, provider })
  return tilesTextureCache[type].get(key)?.texture
}

export const tilesTextureCache = {
  elevation: new Map<string, TileTextureCache>(),
  satellite: new Map<string, TileTextureCache>(),
  maxLength: 100,

  getKey({ tile = [0, 0, 10], type = 'elevation', provider }: TileGetOptions) {
    return `type:${type},provider:${provider.label},x:${tile[0]},y:${tile[1]},z:${tile[2]}`
  },

  getTexture,

  addTexture({ tile = [0, 0, 10], type = 'elevation', provider, texture }: TileTextureAddOptions) {
    if (texture) {
      this[type].set(this.getKey({ tile, type, provider }), {
        tile,
        texture,
        provider,
      })

      if (this[type].size > this.maxLength) {
        this.removeTextureByIndex({ type })
      }
    }
  },

  removeTextureByIndex({ type = 'elevation', index = 0 }: { type?: TileType; index?: number }) {
    if (this[type].size >= index) {
      const keys = Array.from(this[type].keys())
      const keyToDelete = keys[index]

      if (keyToDelete) {
        this[type].delete(keyToDelete)
      }
    }
  },

  removeTextureByTile({ type = 'elevation', tile = [0, 0, 10], provider }: TileGetOptions) {
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
