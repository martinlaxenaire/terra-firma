import * as tilebelt from '@mapbox/tilebelt'
import { getTileKey } from '../utils/map.js'

export interface TileElevationMetadata {
  min: number
  max: number
  average: number
}

interface TileElevationAddOptions {
  tile: tilebelt.Tile
  elevation: TileElevationMetadata | undefined
}

export const tilesElevationsCache = {
  elevationSamples: new Map<string, TileElevationMetadata>(),

  // getKey({ tile = [0, 0, 10], provider }: TileCacheBase) {
  //   return `provider:${provider},x:${tile[0]},y:${tile[1]},z:${tile[2]}`
  // },

  getSource(tile: tilebelt.Tile = [0, 0, 10]): TileElevationMetadata | undefined {
    const key = getTileKey(tile)
    return this.elevationSamples.get(key)
  },

  addSource({ tile = [0, 0, 10], elevation }: TileElevationAddOptions) {
    if (!elevation) return

    this.elevationSamples.set(getTileKey(tile), elevation)
  },

  clearCache() {
    this.elevationSamples.clear()
  },
}
