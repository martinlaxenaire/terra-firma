import * as tilebelt from '@mapbox/tilebelt'
import { Raycaster, Vec3 } from 'gpu-curtains'
import { getTileKey } from '../utils/map.js'

import type { GlobeVisibilityResult } from '../GlobeCameraVisibility/GlobeCameraVisibility.js'
import type { TileElevationMetadata } from '../caches/tiles-elevations-cache.js'
import { mercatorToGlobeLatitude } from '../utils/earth-coordinates.js'
import { DEG2RAD, EARTH_RADIUS } from '../config/constants.js'
import { smoothstep } from '../utils/maths.js'

export interface GlobeTileBounds {
  west: number
  south: number
  east: number
  north: number
}

export interface GlobeTile {
  x: number
  y: number
  z: number

  bounds: GlobeTileBounds

  // Conservative ECEF bounding sphere used for culling.
  boundingCenter: Vec3
  boundingRadius: number

  // Terrain-aware ECEF bounding sphere used for SSE.
  terrainBoundingCenter: Vec3
  terrainBoundingRadius: number

  // Actual terrain metadata, when available.
  terrainMetadata?: TileElevationMetadata

  screenSpaceError: number
}

export interface GlobeLODStats {
  visibleTileCount: number
  tilesByZoom: Record<number, number>
  visited: number
  frustumRejected: number
  horizonRejected: number
  subdivided: number
  selected: number
  maxZoomReached: number
}

export interface GlobeLODBaseOptions {
  cullingSpherePadding?: number
  terrainSpherePadding?: number

  // Conservative global terrain elevation range.
  minElevation?: number
  maxElevation?: number

  maxScreenSpaceError?: number
}

interface GlobeLODInternalOptions {
  maxZoom?: number

  getMaxZooms?: (tile: tilebelt.Tile) => {
    elevation: number
    satellite: number
  }

  getMeshDefinition?: (zoom: number) => number

  // Called when visible tiles or their SSE priorities change.
  onUpdate?: (tiles: GlobeTile[], stats: GlobeLODStats) => void
}

export interface GlobeLODOptions extends GlobeLODBaseOptions, GlobeLODInternalOptions {}

export class GlobeLOD {
  private readonly earthRadius: number
  private readonly cullingSpherePadding: number
  private readonly terrainSpherePadding: number

  private minElevation: number
  private maxElevation: number

  maxZoom: number
  private readonly maxTraversalNodes = 10_000
  private readonly maxScreenSpaceError: number

  private readonly tileSize = 256

  private readonly tileCache = new Map<string, GlobeTile>()

  // Retain metadata independently from GlobeTile instances.
  // Metadata may arrive before a tile is created by traversal.
  private readonly terrainMetadataCache = new Map<string, TileElevationMetadata>()

  visibleTiles: GlobeTile[] = []

  private stats: GlobeLODStats = {
    visibleTileCount: 0,
    tilesByZoom: {},
    visited: 0,
    frustumRejected: 0,
    horizonRejected: 0,
    subdivided: 0,
    selected: 0,
    maxZoomReached: 0,
  }

  private readonly getMaxZooms: (tile: tilebelt.Tile) => {
    elevation: number
    satellite: number
  }

  private readonly getMeshDefinition: (zoom: number) => number

  private readonly onUpdate?: GlobeLODOptions['onUpdate']

  private needsUpdate = true
  private lastVisibility?: GlobeVisibilityResult
  private previousVisibleSSE = new Map<string, number>()

  constructor({
    // high value helps with foreground mountain details
    cullingSpherePadding = 500,
    terrainSpherePadding = 100,
    minElevation = 0,
    maxElevation = 9_000,
    maxZoom = 18,
    maxScreenSpaceError = 16,
    getMaxZooms = ([, , z]) => ({
      elevation: z,
      satellite: z,
    }),
    getMeshDefinition = (zoom) => zoom * 15,
    onUpdate,
  }: GlobeLODOptions) {
    this.earthRadius = EARTH_RADIUS
    this.cullingSpherePadding = cullingSpherePadding
    this.terrainSpherePadding = terrainSpherePadding

    this.minElevation = minElevation
    this.maxElevation = maxElevation

    this.maxZoom = maxZoom
    this.maxScreenSpaceError = maxScreenSpaceError

    this.getMaxZooms = getMaxZooms
    this.getMeshDefinition = getMeshDefinition

    this.onUpdate = onUpdate
  }

  get isIdling(): boolean {
    return !(this.needsUpdate && this.lastVisibility)
  }

  get cacheSize(): number {
    return this.tileCache.size
  }

  get metadataCacheSize(): number {
    return this.terrainMetadataCache.size
  }

  get isDirty(): boolean {
    return this.needsUpdate
  }

  private getTile(tileCoordinates: tilebelt.Tile): GlobeTile {
    const key = getTileKey(tileCoordinates)

    let tile = this.tileCache.get(key)

    if (!tile) {
      tile = this.createTile(tileCoordinates)
      this.tileCache.set(key, tile)
    }

    return tile
  }

  private getParentMetadata(tile: GlobeTile): TileElevationMetadata | undefined {
    let current: tilebelt.Tile = [tile.x, tile.y, tile.z]
    while (current[2] > 0) {
      current = tilebelt.getParent(current) as tilebelt.Tile
      const meta = this.terrainMetadataCache.get(getTileKey(current))
      if (meta) return meta
    }
    return undefined
  }

  /**
   * Called when an elevation tile has finished loading and
   * its metadata has been calculated.
   *
   * Does not invalidate MapTilesManager or trigger an immediate
   * traversal. The next update() incorporates the new metadata.
   */
  onElevationMetadataAvailable(coordinates: tilebelt.Tile, metadata: TileElevationMetadata): void {
    const key = getTileKey(coordinates)

    this.terrainMetadataCache.set(key, metadata)

    const tile = this.tileCache.get(key)

    if (tile) {
      if (tile.terrainMetadata && tile.terrainMetadata.average === metadata.average) {
        return
      }

      tile.terrainMetadata = metadata
      this.updateTerrainBoundingSphere(tile)
    }

    this.needsUpdate = true
  }

  /**
   * Change conservative global elevation limits.
   * Existing tile bounds are rebuilt to reflect the new limits.
   */
  setMaxElevation(maxElevation: number): void {
    if (this.maxElevation === maxElevation) return

    this.maxElevation = maxElevation
    this.rebuildTileBounds()
  }

  setMinElevation(minElevation: number): void {
    if (this.minElevation === minElevation) return

    this.minElevation = minElevation
    this.rebuildTileBounds()
  }

  private rebuildTileBounds(): void {
    for (const tile of this.tileCache.values()) {
      this.updateCullingBoundingSphere(tile)
      this.updateTerrainBoundingSphere(tile)
    }

    this.needsUpdate = true
  }

  /**
   * Calculate the closest distance from the camera to the
   * terrain represented by this tile.
   */
  private getDistanceToTile(tile: GlobeTile, cameraPosition: Vec3): number {
    const center = tile.terrainBoundingCenter

    const dx = center.x - cameraPosition.x
    const dy = center.y - cameraPosition.y
    const dz = center.z - cameraPosition.z
    const centerDistance = Math.sqrt(dx * dx + dy * dy + dz * dz)

    // Horizontal radius of the tile on the globe surface
    const n = Math.pow(2, tile.z)
    const tileHalfSpan = Math.min(this.earthRadius, (Math.PI * this.earthRadius) / Math.pow(2, tile.z))

    // True radial distance of the camera from Earth's center
    const cameraRadius = cameraPosition.length()
    const tileSurfaceRadius = center.length()

    // Read actual tile elevation bounds from terrainMetadata (never undefined!)
    const minElev = tile.terrainMetadata?.min ?? 0
    const maxElev = tile.terrainMetadata?.max ?? 500

    const minRadius = this.earthRadius + minElev
    const maxRadius = this.earthRadius + maxElev

    // Vertical distance from camera to the tile's elevation interval:
    // 0 if the camera is flying between the valley floor and the mountain summit!
    let verticalDist = 0
    if (cameraRadius > maxRadius) {
      verticalDist = cameraRadius - maxRadius
    } else if (cameraRadius < minRadius) {
      verticalDist = minRadius - cameraRadius
    }

    // Approximate horizontal distance along the surface from camera to tile center
    const radialDiff = cameraRadius - tileSurfaceRadius
    const horizontalDist = Math.sqrt(Math.max(0, centerDistance * centerDistance - radialDiff * radialDiff))

    // Distance to the NEAREST edge of the tile's footprint (0 if directly over/inside the tile)
    const closestHorizontalDist = Math.max(0, horizontalDist - tileHalfSpan)

    // Minimum safe floor (e.g., 25m) prevents division-by-zero / zoom-20 runaway while letting peaks reach zoom 15-16
    return Math.max(25, Math.hypot(closestHorizontalDist, verticalDist))
  }

  private getScreenSpaceError(tile: GlobeTile, visibility: GlobeVisibilityResult): number {
    const { cameraPosition, focalLength } = visibility

    const center = tile.terrainBoundingCenter
    const distance = this.getDistanceToTile(tile, cameraPosition)

    // Grazing angle foreshortening (1.0 looking straight down, 0.25 at horizon)
    const centerLen = center.length()
    const toCamX = cameraPosition.x - center.x
    const toCamY = cameraPosition.y - center.y
    const toCamZ = cameraPosition.z - center.z
    const toCamLen = Math.hypot(toCamX, toCamY, toCamZ)

    let foreshortening = 1.0
    if (centerLen > 0 && toCamLen > 0) {
      const viewDot = Math.max(0, (center.x * toCamX + center.y * toCamY + center.z * toCamZ) / (centerLen * toCamLen))
      foreshortening = 0.55 + 0.45 * Math.sqrt(viewDot)
    }

    const south = tile.bounds.south * DEG2RAD
    const north = tile.bounds.north * DEG2RAD
    const west = tile.bounds.west * DEG2RAD
    const east = tile.bounds.east * DEG2RAD

    const globeSouth = mercatorToGlobeLatitude(south)
    const globeNorth = mercatorToGlobeLatitude(north)

    const closestLatitude =
      globeSouth <= 0 && globeNorth >= 0 ? 0 : Math.min(Math.abs(globeSouth), Math.abs(globeNorth))

    const horizontalWidth = 2 * Math.PI * this.earthRadius * Math.cos(closestLatitude) * ((east - west) / (2 * Math.PI))
    const verticalHeight = this.earthRadius * Math.abs(globeNorth - globeSouth)
    const tileWidth = Math.max(horizontalWidth, verticalHeight)

    // Boost mid-distance tiles (5km - 60km) without changing closest tiles (< 1.5km) or far horizon (> 150km)
    const midNear = smoothstep(1_500, 5_000, distance) // 0 at close range -> 1 by 5 km
    const midFar = 1.0 - smoothstep(40_000, 140_000, distance) // 1 at 40 km -> 0 by 140 km
    const midRangeBoost = 1.0 + 1.0 * (midNear * midFar) // Up to 2x SSE in the mid-distance

    const toScreenSpace = (worldSize: number) => ((worldSize * focalLength) / distance) * foreshortening * midRangeBoost

    const maxZooms = this.getMaxZooms([tile.x, tile.y, tile.z])

    // World size of ONE pixel on THIS tile (halves with every zoom level!)
    const currentImageryPixelSize = tileWidth / this.tileSize
    const imageryError = tile.z < maxZooms.satellite ? toScreenSpace(currentImageryPixelSize) : 0

    // World size of ONE mesh triangle edge on THIS tile
    const meshDefinition = Math.max(1, this.getMeshDefinition(tile.z) - 1)
    const meshSpacing = tileWidth / meshDefinition
    const terrainError = tile.z < maxZooms.elevation ? toScreenSpace(meshSpacing) : 0

    return Math.max(imageryError, terrainError)
  }

  /**
   * Create a tile with:
   * - A conservative culling sphere using global elevation limits.
   * - A terrain sphere using actual metadata when available.
   */
  private createTile([x, y, z]: tilebelt.Tile): GlobeTile {
    const [west, south, east, north] = tilebelt.tileToBBOX([x, y, z])

    const bounds: GlobeTileBounds = {
      west,
      south,
      east,
      north,
    }

    const metadata = this.terrainMetadataCache.get(getTileKey([x, y, z]))

    const tile: GlobeTile = {
      x,
      y,
      z,
      bounds,

      boundingCenter: new Vec3(0, 0, 0),
      boundingRadius: this.cullingSpherePadding,

      terrainBoundingCenter: new Vec3(0, 0, 0),
      terrainBoundingRadius: 0,

      terrainMetadata: metadata,

      screenSpaceError: 0,
    }

    this.updateCullingBoundingSphere(tile)
    this.updateTerrainBoundingSphere(tile)

    return tile
  }

  private calculateBoundingSphere(
    tile: GlobeTile,
    centerElevation: number,
    minElevation: number,
    maxElevation: number,
  ): { center: Vec3; radius: number } {
    const n = Math.pow(2, tile.z)

    // Compute exact tile UV bounds matching the vertex shader
    const uMin = tile.x / n
    const uMax = (tile.x + 1) / n
    const vMin = tile.y / n
    const vMax = (tile.y + 1) / n

    // Helper matching WGSL getGlobePosition()
    const tileUVToWorld = (u: number, v: number, elevation: number): Vec3 => {
      const lon = u * 2 * Math.PI - Math.PI
      const mercatorLat = Math.atan(Math.sinh(Math.PI * (1 - 2 * v)))
      const lat = mercatorToGlobeLatitude(mercatorLat) // Same curve as WGSL!
      const radius = this.earthRadius + elevation
      const cosLat = Math.cos(lat)

      return new Vec3(radius * cosLat * Math.sin(lon), radius * Math.sin(lat), radius * cosLat * Math.cos(lon))
    }

    // Place center at the true projected midpoint of the tile
    const center = tileUVToWorld((uMin + uMax) * 0.5, (vMin + vMax) * 0.5, centerElevation)

    if (tile.z === 0) {
      const radius = Math.max(Math.abs(this.earthRadius + minElevation), Math.abs(this.earthRadius + maxElevation))
      return { center: new Vec3(0, 0, 0), radius }
    }

    const subdivisions = 8
    let maxRadiusSq = 0

    for (let y = 0; y <= subdivisions; y++) {
      const v = vMin + (vMax - vMin) * (y / subdivisions)
      for (let x = 0; x <= subdivisions; x++) {
        const u = uMin + (uMax - uMin) * (x / subdivisions)

        for (const elevation of [minElevation, maxElevation]) {
          const point = tileUVToWorld(u, v, elevation)
          const dx = point.x - center.x
          const dy = point.y - center.y
          const dz = point.z - center.z
          const distSq = dx * dx + dy * dy + dz * dz
          if (distSq > maxRadiusSq) {
            maxRadiusSq = distSq
          }
        }
      }
    }

    return { center, radius: Math.sqrt(maxRadiusSq) }
  }

  /**
   * Conservative culling bounds always use global elevation limits.
   * They never shrink just because local metadata is unavailable.
   */
  private updateCullingBoundingSphere(tile: GlobeTile): void {
    const sphere = this.calculateBoundingSphere(tile, 0, this.minElevation, this.maxElevation)

    tile.boundingCenter = sphere.center
    tile.boundingRadius = sphere.radius + this.cullingSpherePadding
  }

  /**
   * Terrain bounds use local min/max if available.
   * Otherwise they fall back to the conservative global range.
   */
  private updateTerrainBoundingSphere(tile: GlobeTile): void {
    // Use own metadata -> fallback to closest loaded ancestor -> fallback to flat sea level (0..500m)
    // Never use the 9,000m culling ceiling for SSE bounds, or low-altitude cameras clamp distance to 1m!
    const metadata = tile.terrainMetadata ?? this.getParentMetadata(tile)

    const minElevation = metadata?.min ?? 0
    const maxElevation = metadata?.max ?? 500
    const centerElevation = metadata?.average ?? (minElevation + maxElevation) * 0.5

    const sphere = this.calculateBoundingSphere(tile, centerElevation, minElevation, maxElevation)

    tile.terrainBoundingCenter = sphere.center

    // Add DEM uncertainty padding only on coarser tiles where peaks may be subsampled
    const demUncertaintyPadding =
      tile.z >= 13 ? this.terrainSpherePadding : Math.max(this.terrainSpherePadding, 200000 / Math.pow(2, tile.z))

    tile.terrainBoundingRadius = sphere.radius + demUncertaintyPadding
  }

  getStats(): GlobeLODStats {
    return this.stats
  }

  private traverse(tile: GlobeTile, visibility: GlobeVisibilityResult, result: GlobeTile[]): void {
    this.stats.visited++

    const { cameraPosition, frustum } = visibility

    // 1. Culling: Always use conservative bounds (maxElevation: 9000) if metadata isn't loaded yet
    const cullCenter = tile.terrainMetadata ? tile.terrainBoundingCenter : tile.boundingCenter
    const cullRadius = tile.terrainMetadata ? tile.terrainBoundingRadius : tile.boundingRadius

    if (!this.intersectsFrustum(cullCenter, cullRadius, frustum)) {
      this.stats.frustumRejected++
      return
    }

    if (this.isBehindHorizon(cullCenter, cullRadius, cameraPosition)) {
      this.stats.horizonRejected++
      return
    }

    const screenSpaceError = this.getScreenSpaceError(tile, visibility)

    tile.screenSpaceError = screenSpaceError

    const maxZooms = this.getMaxZooms([tile.x, tile.y, tile.z])
    const effectiveMaxZoom = Math.min(this.maxZoom, Math.max(maxZooms.satellite, maxZooms.elevation))

    // Only subdivide if this tile already has metadata (for zoom >= 6)
    // AND we haven't exceeded your provider's max zoom
    if (
      tile.z >= effectiveMaxZoom ||
      screenSpaceError <= this.maxScreenSpaceError ||
      (!tile.terrainMetadata && tile.z >= 6 && tile.z <= maxZooms.elevation)
    ) {
      this.stats.selected++
      this.stats.maxZoomReached = Math.max(tile.z, this.stats.maxZoomReached)
      result.push(tile)
      return
    }

    const children = tilebelt.getChildren([tile.x, tile.y, tile.z]) as tilebelt.Tile[]

    if (this.stats.visited + children.length > this.maxTraversalNodes) {
      this.stats.selected++
      this.stats.maxZoomReached = Math.max(tile.z, this.stats.maxZoomReached)

      result.push(tile)
      return
    }

    for (const child of children) {
      this.stats.subdivided++
      this.traverse(this.getTile(child), visibility, result)
    }
  }

  #getClosestTileFromOriginDirection(
    origin: Vec3,
    direction: Vec3,
    visibleTiles: GlobeTile[] = this.visibleTiles,
  ): GlobeTile | undefined {
    let closestTile: GlobeTile | undefined
    let closestDistance = Infinity

    for (const tile of visibleTiles) {
      const center = tile.terrainBoundingCenter
      const radius = tile.terrainBoundingRadius

      // Vector from the sphere center to the ray origin.
      const mx = origin.x - center.x
      const my = origin.y - center.y
      const mz = origin.z - center.z

      const b = mx * direction.x + my * direction.y + mz * direction.z
      const c = mx * mx + my * my + mz * mz - radius * radius

      // If the ray starts inside the bounding sphere, its entry distance is 0.
      if (c <= 0) {
        if (closestDistance > 0) {
          closestDistance = 0
          closestTile = tile
        }

        continue
      }

      // Ray-sphere intersection.
      const discriminant = b * b - c

      if (discriminant < 0) continue

      const distance = -b - Math.sqrt(discriminant)

      // Ignore intersections behind the camera.
      if (distance < 0) continue

      if (distance < closestDistance) {
        closestDistance = distance
        closestTile = tile
      }
    }

    return closestTile
  }

  getClosestTileToTarget(
    cameraPosition: Vec3,
    target: Vec3,
    visibleTiles: GlobeTile[] = this.visibleTiles,
  ): GlobeTile | undefined {
    const direction = target.clone().sub(cameraPosition)

    const directionLength = direction.lengthSq()

    if (directionLength === 0) return undefined

    // Normalize the ray direction.
    direction.normalize()

    return this.#getClosestTileFromOriginDirection(cameraPosition, direction, visibleTiles)
  }

  getClosestTileToTargetFromRay(
    ray: Raycaster['ray'],
    visibleTiles: GlobeTile[] = this.visibleTiles,
  ): GlobeTile | undefined {
    const { origin, direction } = ray

    return this.#getClosestTileFromOriginDirection(origin, direction.clone().multiplyScalar(-1), visibleTiles)
  }

  getClosestTileFromCamera(cameraPosition: Vec3, visibleTiles: GlobeTile[] = this.visibleTiles): GlobeTile | undefined {
    let closestTile: GlobeTile | undefined
    let closestDistance = Infinity

    for (const tile of visibleTiles) {
      const center = tile.terrainBoundingCenter
      const radius = tile.terrainBoundingRadius

      const distance = Math.max(0, cameraPosition.distance(center) - radius)

      if (distance < 0) continue

      if (distance < closestDistance) {
        closestTile = tile
        closestDistance = distance
      }
    }

    return closestTile
  }

  /**
   * Recalculate visible tiles.
   *
   * Call this from your normal camera/render update loop.
   * Metadata updates are incorporated here automatically.
   */
  update(visibility: GlobeVisibilityResult | undefined = this.lastVisibility): GlobeTile[] {
    if (visibility) {
      this.lastVisibility = visibility
    }

    this.stats = {
      visibleTileCount: 0,
      tilesByZoom: {},
      visited: 0,
      frustumRejected: 0,
      horizonRejected: 0,
      subdivided: 0,
      selected: 0,
      maxZoomReached: 0,
    }

    if (!this.lastVisibility) return []

    const currentVisibility = this.lastVisibility

    const result: GlobeTile[] = []

    this.traverse(this.getTile([0, 0, 0]), currentVisibility, result)

    for (const tile of result) {
      this.stats.tilesByZoom[tile.z] = (this.stats.tilesByZoom[tile.z] ?? 0) + 1
    }

    this.stats.visibleTileCount = result.length

    const changed = this.hasVisibleTilesChanged(result)

    this.previousVisibleSSE = new Map(
      result.map((tile) => [getTileKey([tile.x, tile.y, tile.z]), tile.screenSpaceError]),
    )

    this.visibleTiles = result
    this.needsUpdate = false

    if (changed) {
      this.onUpdate?.(result, this.stats)
    }

    return result
  }

  /**
   * Run update if needed.
   */
  render() {
    if (this.needsUpdate && this.lastVisibility) {
      this.update()
    }
  }

  /**
   * Detect changes to visible tile keys or their SSE priorities.
   * Priority changes matter because MapTilesManager uses SSE
   * to prioritize loading.
   */
  private hasVisibleTilesChanged(next: GlobeTile[]): boolean {
    if (next.length !== this.visibleTiles.length) {
      return true
    }

    for (const tile of next) {
      const key = getTileKey([tile.x, tile.y, tile.z])
      const previousSSE = this.previousVisibleSSE.get(key)

      if (previousSSE === undefined) return true

      if (Math.abs(previousSSE - tile.screenSpaceError) > 0.01) {
        return true
      }
    }

    return false
  }

  get result(): GlobeTile[] {
    return this.visibleTiles
  }

  private intersectsFrustum(center: Vec3, radius: number, frustumPlanes: GlobeVisibilityResult['frustum']): boolean {
    for (const plane of frustumPlanes) {
      const signedDistance = plane[0] * center.x + plane[1] * center.y + plane[2] * center.z + plane[3]

      if (signedDistance < -radius) {
        return false
      }
    }

    return true
  }

  /**
   * Convert longitude/latitude to ECEF.
   *
   * Coordinate convention:
   * - Y points north
   * - longitude 0° is +Z
   * - longitude 90° east is +X
   */
  private lonLatToECEF(longitude: number, latitude: number, radius = this.earthRadius): Vec3 {
    const lon = (longitude * Math.PI) / 180

    const mercatorLat = (latitude * Math.PI) / 180
    const lat = mercatorToGlobeLatitude(mercatorLat)

    const cosLat = Math.cos(lat)

    return new Vec3(radius * cosLat * Math.sin(lon), radius * Math.sin(lat), radius * cosLat * Math.cos(lon))
  }

  private isBehindHorizon(center: Vec3, radius: number, cameraPosition: Vec3): boolean {
    const cameraDistSq = cameraPosition.lengthSq()
    const earthRadius = this.earthRadius

    // Camera is inside or on the Earth sphere
    if (cameraDistSq <= earthRadius * earthRadius) {
      return false
    }

    // Vector from camera to bounding sphere center
    const toCenterX = center.x - cameraPosition.x
    const toCenterY = center.y - cameraPosition.y
    const toCenterZ = center.z - cameraPosition.z

    // Distance from camera to horizon tangent circle along -cameraPosition
    const cameraDist = Math.sqrt(cameraDistSq)
    const horizonDistSq = cameraDistSq - earthRadius * earthRadius
    const horizonDist = Math.sqrt(horizonDistSq)

    // Sine and cosine of the Earth's angular radius from the camera
    const sinAlpha = earthRadius / cameraDist
    const cosAlpha = horizonDist / cameraDist

    // Project (center - camera) onto -cameraPosition (direction toward Earth center)
    const dirToEarthX = -cameraPosition.x / cameraDist
    const dirToEarthY = -cameraPosition.y / cameraDist
    const dirToEarthZ = -cameraPosition.z / cameraDist

    const forward = toCenterX * dirToEarthX + toCenterY * dirToEarthY + toCenterZ * dirToEarthZ

    // Closest point on the bounding sphere toward the camera must be past the horizon tangent distance
    if (forward - radius < horizonDist) {
      return false
    }

    // Distance from the camera-to-Earth-center axis
    const toCenterDistSq = toCenterX * toCenterX + toCenterY * toCenterY + toCenterZ * toCenterZ
    const perpSq = Math.max(0, toCenterDistSq - forward * forward)
    const perp = Math.sqrt(perpSq)

    // Exact sphere-cone occlusion test:
    // Sphere is completely inside the Earth's shadow cone iff:
    // perp * cosAlpha + radius < forward * sinAlpha
    return perp * cosAlpha + radius < forward * sinAlpha
  }

  destroy(): void {
    this.visibleTiles = []
    this.tileCache.clear()
    this.terrainMetadataCache.clear()
    this.previousVisibleSSE.clear()
    this.lastVisibility = undefined
    this.needsUpdate = true
  }
}
