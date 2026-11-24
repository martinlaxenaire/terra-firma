import * as tilebelt from '@mapbox/tilebelt'

export interface SatelliteProvider {
  label: string
  type: 'image'
  maxZoom: number
  key?: string
  getTile: (tile: tilebelt.Tile, key: string) => string
}

export interface ElevationProvider extends Omit<SatelliteProvider, 'type'> {
  type: 'lerc' | 'image'
  encoding: 'terrarium' | 'dem' | 'hypso'
  density?: number
}

export type TilesProviders = {
  elevation: ElevationProvider
  satellite: SatelliteProvider
}
