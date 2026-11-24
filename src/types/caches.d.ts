import * as tilebelt from '@mapbox/tilebelt'
import type { ElevationProvider, SatelliteProvider } from './providers.js'

export type TileType = 'satellite' | 'elevation'

export interface TileCacheBase {
  tile: tilebelt.Tile
  provider: ElevationProvider | SatelliteProvider
}

export interface TileGetOptions extends TileCacheBase {
  type: TileType
}
