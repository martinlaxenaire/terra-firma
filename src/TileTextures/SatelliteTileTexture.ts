import * as tilebelt from '@mapbox/tilebelt'
import type { SatelliteProvider } from '../types/providers.js'
import { MediaTexture } from 'gpu-curtains'
import { tilesAPI } from '../core/tiles-api.js'
import TilesManager from '../TilesManager/TilesManager.js'
import { tilesTextureCache } from '../caches/tiles-texture-cache.js'
import { taskQueueScheduler } from '../core/task-queue-scheduler.js'
import { getTileKey } from '../utils/map.js'

export interface SatelliteTileTextureOptions {
  tilesManager: TilesManager
  provider?: SatelliteProvider
  tile?: tilebelt.Tile
  onTextureReady?: () => void
}

export default class SatelliteTileTexture {
  type: 'satellite'
  tilesManager: TilesManager
  renderer: TilesManager['renderer']
  tile: tilebelt.Tile

  provider!: SatelliteProvider
  zoom!: number

  ready: boolean
  onTextureReady: () => void

  texture: MediaTexture | undefined

  constructor({
    tilesManager,
    provider = undefined,
    tile = [0, 0, 10],
    onTextureReady = () => {},
  }: SatelliteTileTextureOptions) {
    this.type = 'satellite'
    this.tilesManager = tilesManager
    this.renderer = this.tilesManager.renderer
    this.tile = tile

    this.ready = false
    this.onTextureReady = onTextureReady

    this.setProvider(provider || this.tilesManager.getCurrentProvider(this.type))

    this.tilesManager.satelliteTileTextures.set(getTileKey(this.tile), this)

    this.setTexture()
  }

  setProvider(provider: SatelliteProvider) {
    this.provider = provider
    this.zoom = Math.min(this.provider.maxZoom, this.tile[2])
  }

  createTexture() {
    if (this.texture) {
      this.texture.destroy()
    }

    this.texture = new MediaTexture(this.renderer, {
      label: `Satellite texture [${this.tile[0]}, ${this.tile[1]}, ${this.tile[2]}]`,
      name: 'satelliteTexture',
      generateMips: true,
      autoDestroy: false,
      useTransform: false,
      cache: false,
      placeholderColor: [125, 125, 125, 255],
    })

    this.texture.onAllSourcesLoaded(() => {
      if (!this.ready) {
        this.ready = true
        this.onTextureReady()
      }
    })
  }

  setTexture() {
    this.createTexture()

    taskQueueScheduler.addTask({
      callback: async () => {
        if (!this.texture) {
          this.createTexture()
        }

        await tilesAPI.setTileTexture({
          texture: this.texture!,
          tile: this.tile,
          tileType: this.type,
          provider: this.provider,
          useWorkers: this.tilesManager.options.useWorkers,
        })
      },
      priority: this.tile[2] * 100000,
    })
  }

  destroy({ removeFromTilesManager = true } = {}) {
    if (this.texture) {
      this.ready = false
      tilesTextureCache.removeTextureByTile({ type: 'satellite', tile: this.tile, provider: this.provider })
      this.texture.destroy()
      this.texture = undefined

      if (removeFromTilesManager) {
        this.tilesManager.satelliteTileTextures.delete(getTileKey(this.tile))
      }
    }
  }
}
