import * as tilebelt from '@mapbox/tilebelt'
import ElevationTileTexture from '../TileTextures/ElevationTileTexture.js'
import SatelliteTileTexture from '../TileTextures/SatelliteTileTexture.js'
import TileMesh from './TileMesh.js'
import { getParentTileAtZoom } from '../utils/map.js'
import { getTileCenter, lonLatToWorld } from '../utils/earth-coordinates.js'
import { EARTH_RADIUS } from '../config/constants.js'
import { tilesTextureCache } from '../caches/tiles-texture-cache.js'
import { Vec3 } from 'gpu-curtains'
import TilesManager from '../TilesManager/TilesManager.js'
import { GeographicCoordinates, XYZCoordinates } from '../types/geographic.js'
import { tilesElevationsCache } from '../caches/tiles-elevations-cache.js'

export interface MapTileOptions {
  tilesManager: TilesManager
  tile?: tilebelt.Tile
  screenSpaceError?: number
  onTileReady?: () => void
}

export default class MapTile {
  tilesManager: TilesManager
  renderer: TilesManager['renderer']
  zoom: number
  tile: tilebelt.Tile
  screenSpaceError: number

  ready: boolean

  desiredVisible: boolean
  visible: boolean
  onTileReady: () => void

  center: GeographicCoordinates

  centerWorld: XYZCoordinates

  elevationTileTexture: ElevationTileTexture | undefined
  satelliteTileTexture: SatelliteTileTexture | undefined

  tileMesh: TileMesh | undefined

  constructor({ tilesManager, tile = [0, 0, 10], screenSpaceError = 0, onTileReady = () => {} }: MapTileOptions) {
    this.tilesManager = tilesManager
    this.renderer = this.tilesManager.renderer
    this.tile = tile
    this.zoom = tile[2]

    this.screenSpaceError = screenSpaceError

    this.ready = false
    // Whether the coverage manager wants this tile rendered
    this.desiredVisible = false
    this.visible = true
    this.onTileReady = onTileReady

    // TESTS
    this.center = getTileCenter(this.tile)

    this.centerWorld = lonLatToWorld(this.center, 0, EARTH_RADIUS)

    this.setTile()
  }

  setTile() {
    this.setElevationTexture()
    this.setSatelliteTexture()
    this.setTileMesh()
  }

  setVisible(visible: boolean) {
    this.desiredVisible = visible

    this.updateVisibility()
  }

  updateVisibility() {
    const visible = this.ready && this.desiredVisible

    if (this.visible === visible) return

    this.visible = visible
    this.tileMesh?.setVisibility(visible)
  }

  setElevationTexture() {
    // elevation tile
    const { zooms, providers } = this.tilesManager

    // tile zoom must be less than max elevation
    // plus if we have 2x density elevation tiles, get tile 1 zoom higher
    // it will greatly leverage cache to improve perf, memory and bandwidth
    const tile =
      this.zoom > zooms.max.elevation
        ? getParentTileAtZoom(this.tile, zooms.max.elevation)
        : providers.elevation.density === 2 && this.zoom > 2
          ? getParentTileAtZoom(this.tile, this.zoom - 1)
          : this.tile

    // eager metadata
    const metadata = tilesElevationsCache.getSource(tile)
    if (metadata) {
      this.tilesManager.onElevationMetadataAvailable(this.tile, metadata)
    }

    this.elevationTileTexture = tilesTextureCache.getTexture({
      tile,
      type: 'elevation',
      provider: providers.elevation,
    })

    if (this.elevationTileTexture) {
      this.elevationTileTexture.addTileCoverage(this.tile)
      this.onTileReadyCheck()
    } else {
      this.elevationTileTexture = new ElevationTileTexture({
        tilesManager: this.tilesManager,
        tile,
        onTextureReady: () => {
          tilesTextureCache.addTexture({
            tile,
            type: 'elevation',
            texture: this.elevationTileTexture!,
            provider: providers.elevation,
          })

          const metadata = tilesElevationsCache.getSource(tile)

          if (metadata) {
            this.tilesManager.onElevationMetadataAvailable(this.tile, metadata)
          }

          this.onTileReadyCheck()
        },
      })
    }
  }

  resetElevationTextureZoomLevel() {
    this.tileMesh?.resetElevationTextureZoomLevel()
  }

  setSatelliteTexture() {
    const { providers } = this.tilesManager

    // satellite
    this.satelliteTileTexture = tilesTextureCache.getTexture({
      tile: this.tile,
      type: 'satellite',
      provider: providers.satellite,
    })

    if (!this.satelliteTileTexture) {
      this.satelliteTileTexture = new SatelliteTileTexture({
        tilesManager: this.tilesManager,
        tile: this.tile,
        onTextureReady: () => {
          tilesTextureCache.addTexture({
            tile: this.tile,
            type: 'satellite',
            texture: this.satelliteTileTexture!,
            provider: providers.satellite,
          })

          this.onTileReadyCheck()
        },
      })
    }
  }

  setTileMesh() {
    // tile
    this.tileMesh = new TileMesh({
      tilesManager: this.tilesManager,
      mapTile: this,
      parent: this.tilesManager.tilesGroup!,
      tile: this.tile,
      elevationTile: this.elevationTileTexture!,
      satelliteTile: this.satelliteTileTexture!,
      definition: this.tilesManager.getDefinitionAtZoomLevel(this.zoom),
      onMeshReady: this.onTileReadyCheck.bind(this),
      visible: this.visible,
    })

    // GLOBE
    const position = new Vec3(this.centerWorld.x, this.centerWorld.y, this.centerWorld.z)

    this.tileMesh.setPosition(position)

    this.onTileReadyCheck()
  }

  onTileReadyCheck() {
    if (
      this.elevationTileTexture &&
      this.elevationTileTexture.ready &&
      this.satelliteTileTexture &&
      this.satelliteTileTexture.ready &&
      this.tileMesh &&
      this.tileMesh.ready &&
      !this.ready
    ) {
      this.ready = true

      this.updateVisibility()
      // display tile
      this.onTileReady()
    }
  }

  updateElevationTexture() {
    if (this.tileMesh) {
      this.tileMesh.updateElevationTexture()
    }
  }

  updateSatelliteTexture() {
    if (this.tileMesh) {
      this.tileMesh.updateSatelliteTexture()
    }
  }

  destroy() {
    if (this.elevationTileTexture) {
      this.elevationTileTexture.removeTileCoverage(this.tile)
      this.elevationTileTexture.destroy()
      this.elevationTileTexture = undefined
    }

    if (this.satelliteTileTexture) {
      this.satelliteTileTexture.destroy()
      this.satelliteTileTexture = undefined
    }

    if (this.tileMesh) {
      this.tileMesh.destroy()
    }
  }
}
