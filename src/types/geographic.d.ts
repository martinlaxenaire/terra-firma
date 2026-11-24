export interface XYZCoordinates {
  x: number
  y: number
  z: number
}

export interface GeographicCoordinates {
  longitude: number
  latitude: number
}

export interface GeographicBounds {
  west: number
  north: number
  east: number
  south: number
}

export interface TileGeographicCoordinates extends GeographicCoordinates {
  zoom: number
}

export interface GlobeCoordinates extends GeographicCoordinates {
  altitude: number
}

export interface GlobeOffset {
  north: number
  west: number
  altitude: number
}
