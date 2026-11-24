import * as tilebelt from '@mapbox/tilebelt'
import type {
  GeographicBounds,
  GlobeCoordinates,
  GeographicCoordinates,
  XYZCoordinates,
  TileGeographicCoordinates,
  GlobeOffset,
} from '../types/geographic.js'
import {
  MAX_MERCATOR_LATITUDE,
  DEG2RAD,
  RAD2DEG,
  EARTH_RADIUS,
  MAX_LATITUDE,
  POLAR_TRANSITION_START,
  HALF_PI,
} from '../config/constants.js'
import { Vec3 } from 'gpu-curtains'

/**
 * Convert longitude/latitude in degrees to fractional XYZ tile
 * coordinates at a given zoom.
 *
 * x and y can be fractional, so this works for points as well as
 * integer tile coordinates.
 */
export function lonLatToTile(point: TileGeographicCoordinates): XYZCoordinates {
  const n = 2 ** point.zoom

  const clampedLat = Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, point.latitude))

  // const lonRad = lon * DEG2RAD
  const latRad = clampedLat * DEG2RAD

  const x = ((point.longitude + 180) / 360) * n
  const y = ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n

  return { x, y, z: point.zoom }
}

/**
 * Convert fractional XYZ tile coordinates to longitude/latitude.
 *
 * For a tile's northwest corner, pass its integer x and y.
 * For its center, pass x + 0.5 and y + 0.5.
 */
export function tileToLonLat([x, y, z]: tilebelt.Tile): GeographicCoordinates {
  const n = 2 ** z

  const longitude = (x / n) * 360 - 180
  const latitude = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * RAD2DEG

  return { longitude, latitude }
}

/**
 * Geographic bounds of an XYZ tile.
 * Returns west, south, east, north in degrees.
 */
export function getTileBounds([x, y, z]: tilebelt.Tile): GeographicBounds {
  const northwest = tileToLonLat([x, y, z])
  const southeast = tileToLonLat([x + 1, y + 1, z])

  return {
    west: northwest.longitude,
    north: northwest.latitude,
    east: southeast.longitude,
    south: southeast.latitude,
  }
}

export function getTileCenter([x, y, z]: tilebelt.Tile) {
  return tileToLonLat([x + 0.5, y + 0.5, z])
}

/**
 * Convert longitude/latitude/elevation to a spherical Earth position.
 *
 * Coordinate convention:
 *   +Y = North Pole
 *   +Z = longitude 0°
 *   +X = longitude 90° East
 *
 * Elevation is in metres.
 */
export function lonLatToWorld(point: GeographicCoordinates, elevation = 0, radius = EARTH_RADIUS): XYZCoordinates {
  const lambda = point.longitude * DEG2RAD
  const phi = point.latitude * DEG2RAD
  const r = radius + elevation

  const cosPhi = Math.cos(phi)

  return {
    x: r * cosPhi * Math.sin(lambda),
    y: r * Math.sin(phi),
    z: r * cosPhi * Math.cos(lambda),
  }
}

/**
 * Convert a spherical Earth position back to longitude,
 * latitude and elevation.
 *
 * Assumes the same spherical coordinate convention as above.
 */
export function worldToLonLat({ x, y, z }: XYZCoordinates, radius = EARTH_RADIUS): GlobeCoordinates {
  const r = Math.hypot(x, y, z)

  if (r === 0) {
    throw new Error('Earth center has no longitude or latitude.')
  }

  return {
    longitude: Math.atan2(x, z) * RAD2DEG,
    latitude: Math.asin(y / r) * RAD2DEG,
    altitude: r - radius,
  }
}

/**
 * Convert a geographic offset into a spherical Earth position.
 *
 * north: latitude in degrees
 * west: longitude in degrees
 * altitude: elevation above the Earth's surface, in meters
 */
export function offsetToWorld({ north, west, altitude }: GlobeOffset, radius = EARTH_RADIUS): Vec3 {
  const latitude = north * DEG2RAD
  const longitude = -west * DEG2RAD
  const r = radius + altitude

  return new Vec3(
    r * Math.cos(latitude) * Math.sin(longitude),
    r * Math.sin(latitude),
    r * Math.cos(latitude) * Math.cos(longitude),
  )
}

/**
 * Convert local geographic offsets (in meters) into a world-space
 * displacement vector at a given longitude/latitude.
 */
export function lonLatOffsetToWorld(
  { north, west, altitude }: GlobeOffset,
  { longitude, latitude }: GeographicCoordinates,
): Vec3 {
  const lon = longitude * DEG2RAD
  const lat = latitude * DEG2RAD

  const east = new Vec3(Math.cos(lon), 0, -Math.sin(lon))

  const northDirection = new Vec3(-Math.sin(lat) * Math.sin(lon), Math.cos(lat), -Math.sin(lat) * Math.cos(lon))

  const up = new Vec3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon))

  return east.multiplyScalar(-west).add(northDirection.multiplyScalar(north)).add(up.multiplyScalar(altitude))
}

/**
 * Local tangent frame at a geographic position.
 *
 * east:  direction of increasing longitude
 * north: direction of increasing latitude
 * up:    radial direction away from Earth's center
 */
export function getLocalFrame(point: GeographicCoordinates) {
  const lambda = point.longitude * DEG2RAD
  const phi = point.latitude * DEG2RAD

  const sinLon = Math.sin(lambda)
  const cosLon = Math.cos(lambda)
  const sinLat = Math.sin(phi)
  const cosLat = Math.cos(phi)

  return {
    east: {
      x: cosLon,
      y: 0,
      z: -sinLon,
    },
    north: {
      x: -sinLat * sinLon,
      y: cosLat,
      z: -sinLat * cosLon,
    },
    up: {
      x: cosLat * sinLon,
      y: sinLat,
      z: cosLat * cosLon,
    },
  }
}

/**
 * Calculate spherial distance between two coordinates.
 * Returns distance in meters.
 */
export function getSphericalDistance(
  pointA: GeographicCoordinates,
  pointB: GeographicCoordinates,
  radius = EARTH_RADIUS,
): number {
  const toRad = Math.PI / 180

  const phi1 = pointA.latitude * toRad
  const phi2 = pointB.latitude * toRad
  const deltaPhi = (pointB.latitude - pointA.latitude) * toRad
  const deltaLambda = (pointB.longitude - pointA.longitude) * toRad

  const sinHalfDeltaPhi = Math.sin(deltaPhi * 0.5)
  const sinHalfDeltaLambda = Math.sin(deltaLambda * 0.5)

  const a =
    sinHalfDeltaPhi * sinHalfDeltaPhi + Math.cos(phi1) * Math.cos(phi2) * sinHalfDeltaLambda * sinHalfDeltaLambda

  // Angle central en radians (clampé pour éviter tout NaN lié aux arrondis flottants)
  const centralAngle = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)))

  return radius * centralAngle
}

export function getSphericalDistanceFromVec3(
  pointA: Vec3,
  pointB: Vec3,
  center = new Vec3(),
  radius = EARTH_RADIUS,
): number {
  const dirA = pointA.clone().sub(center).normalize()
  const dirB = pointB.clone().sub(center).normalize()

  const dot = Math.min(1, Math.max(-1, dirA.dot(dirB)))
  const centralAngle = Math.acos(dot)

  return radius * centralAngle
}

/**
 * Get a tile's center in world coordinates and its local orientation frame.
 *
 * The returned frame is useful for positioning/orienting a tile locally.
 * It does not itself create a gpu-curtains Object3D or quaternion.
 */
export function getTileTransform(tile: tilebelt.Tile, elevation = 0, radius = EARTH_RADIUS) {
  const center = getTileCenter(tile)

  return {
    position: lonLatToWorld(center, elevation, radius),
    rotation: getLocalFrame(center),
    center,
  }
}

/**
 * Convert Mercator latitude into spherical latitude.
 * Must match the WGSL implementation.
 */
export function mercatorToGlobeLatitude(mercatorLat: number): number {
  const absLat = Math.abs(mercatorLat)
  const signLat = Math.sign(mercatorLat)

  if (absLat <= POLAR_TRANSITION_START) {
    return mercatorLat
  }

  const range = MAX_LATITUDE - POLAR_TRANSITION_START

  const t = Math.max(0, Math.min(1, (absLat - POLAR_TRANSITION_START) / range))

  const r = (HALF_PI - POLAR_TRANSITION_START) / range

  const h = t + (3 * r - 2) * t * t + (1 - 2 * r) * t * t * t

  return signLat * (POLAR_TRANSITION_START + range * h)
}

/**
 * Convert spherical latitude back into Mercator latitude.
 *
 * Uses binary search because the polar remapping is monotonic.
 */
export function globeToMercatorLatitude(globeLat: number): number {
  const absLat = Math.min(HALF_PI, Math.abs(globeLat))
  const signLat = Math.sign(globeLat)

  if (absLat <= POLAR_TRANSITION_START) {
    return globeLat
  }

  let low = POLAR_TRANSITION_START
  let high = MAX_LATITUDE

  for (let i = 0; i < 24; i++) {
    const mid = (low + high) * 0.5

    if (mercatorToGlobeLatitude(mid) < absLat) {
      low = mid
    } else {
      high = mid
    }
  }

  return signLat * (low + high) * 0.5
}
