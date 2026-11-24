import * as tilebelt from '@mapbox/tilebelt'
import type { ElevationProvider } from '../types/providers.js'
import { getTileKey, getTileBBoxCenterCoords } from '../utils/map.js'
import { MediaTexture } from 'gpu-curtains'
import { tilesAPI } from '../core/tiles-api.js'
import TilesManager from '../TilesManager/TilesManager.js'
import { tilesTextureCache } from '../caches/tiles-texture-cache.js'
import { taskQueueScheduler } from '../core/task-queue-scheduler.js'
import { GeographicCoordinates } from '../types/geographic.js'

export interface ElevationTileTextureOptions {
  tilesManager: TilesManager
  provider?: ElevationProvider
  tile?: tilebelt.Tile
  onTextureReady?: () => void
}

export default class ElevationTileTexture {
  type: 'elevation'
  tilesManager: TilesManager
  renderer: TilesManager['renderer']
  tile: tilebelt.Tile

  provider!: ElevationProvider
  zoom!: number

  tilesCoverageSet: Set<string>

  ready: boolean
  onTextureReady: () => void

  tileBBox: number[]

  size: {
    x: number
    y: number
  }

  tileCenter: GeographicCoordinates

  texture: MediaTexture | undefined

  constructor({
    tilesManager,
    provider = undefined,
    tile = [0, 0, 10],
    onTextureReady = () => {},
  }: ElevationTileTextureOptions) {
    this.type = 'elevation'
    this.tilesManager = tilesManager
    this.renderer = this.tilesManager.renderer
    this.tile = tile

    this.tilesCoverageSet = new Set() // all the tiles that use that elevation texture

    this.ready = false
    this.onTextureReady = onTextureReady

    this.setProvider(provider || this.tilesManager.getCurrentProvider(this.type))

    this.tileBBox = tilebelt.tileToBBOX(tile)

    this.size = {
      x: Math.abs(this.tileBBox[0] - this.tileBBox[2]),
      y: Math.abs(this.tileBBox[1] - this.tileBBox[3]),
    }

    this.tileCenter = getTileBBoxCenterCoords(this.tileBBox)

    this.setTile()
    this.setTexture()
  }

  setProvider(provider: ElevationProvider) {
    this.provider = provider
    // should not be necessary
    this.zoom = Math.min(this.provider.maxZoom, this.tile[2])
  }

  setTile() {
    if (this.tile[2] !== this.zoom) {
      this.tile = tilebelt.pointToTile(this.tileCenter.longitude, this.tileCenter.latitude, this.zoom)
    }

    this.tilesManager.elevationTileTextures.set(getTileKey(this.tile), this)

    this.addTileCoverage(this.tile)
  }

  addTileCoverage(tile: tilebelt.Tile) {
    this.tilesCoverageSet.add(getTileKey(tile))
  }

  removeTileCoverage(tile: tilebelt.Tile) {
    this.tilesCoverageSet.delete(getTileKey(tile))
  }

  createTexture() {
    if (this.texture) {
      this.texture.destroy()
    }

    this.texture = new MediaTexture(this.renderer, {
      label: `Elevation texture [${this.tile[0]}, ${this.tile[1]}, ${this.tile[2]}]`,
      name: 'elevationTexture',
      // format: 'rgba16float',
      autoDestroy: false,
      useTransform: false,
      cache: false,
      generateMips: false,
    })

    this.texture.size.depth = 1

    this.texture.onAllSourcesLoaded(() => {
      if (!this.ready) {
        this.ready = true
        this.onTextureReady()
      }
    })
  }

  async setElevationTexture() {
    if (!this.texture) {
      this.createTexture()
    }

    const elevationSource = await tilesAPI.setTileTexture({
      texture: this.texture!,
      tile: this.tile,
      provider: this.provider,
      tileType: this.type,
      useWorkers: this.tilesManager.options.useWorkers,
    })

    if (!elevationSource?.valid) {
      this.tilesManager.elevationTileTextures.delete(getTileKey(this.tile))
      this.tile = tilebelt.getParent(this.tile)
      this.tilesManager.elevationTileTextures.set(getTileKey(this.tile), this)
      this.tilesCoverageSet.forEach((tileKey) => {
        const mapTile = this.tilesManager.mapTilesManager.mapTiles.get(tileKey)
        if (mapTile) {
          mapTile.resetElevationTextureZoomLevel()
        }
      })

      await this.setElevationTexture()
    }
  }

  setTexture() {
    // reset ready flag
    this.ready = false

    this.createTexture()

    taskQueueScheduler.addTask({
      callback: async () => {
        await this.setElevationTexture()
      },
      priority: this.tile[2] * 1000000,
    })
  }

  destroy({ removeFromTilesManager = true, force = false } = {}) {
    if (this.texture && (!this.tilesCoverageSet.size || force)) {
      this.tilesManager.elevationTileTextures.delete(getTileKey(this.tile))
      this.ready = false
      tilesTextureCache.removeTextureByTile({ type: 'elevation', tile: this.tile, provider: this.provider })
      this.texture.destroy()
      this.texture = undefined

      if (removeFromTilesManager) {
        this.tilesManager.satelliteTileTextures.delete(getTileKey(this.tile))
      }
    }
  }
}
