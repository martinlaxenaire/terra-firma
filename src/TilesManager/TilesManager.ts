import * as tilebelt from '@mapbox/tilebelt'
import { Sampler, Object3D, Vec3, Raycaster } from 'gpu-curtains'

import { EARTH_RADIUS } from '../config/constants.js'
import type { TilesProviders } from '../types/providers.js'
import type { TileElevationMetadata } from '../caches/tiles-elevations-cache.js'

import { tilesTextureCache } from '../caches/tiles-texture-cache.js'
import { tilesElevationsCache } from '../caches/tiles-elevations-cache.js'
import { taskQueueScheduler } from '../core/task-queue-scheduler.js'
import { defaultTilesConfig } from '../config/config.js'
import { GetRasterTile, tilesAPI } from '../core/tiles-api.js'
import { tilesGeometriesCache } from '../caches/tiles-geometries-cache.js'
import { tilesSourcesCache } from '../caches/tiles-sources-cache.js'
import {
  GlobeCameraVisibility,
  GlobeCameraVisibilityBaseOptions,
} from '../GlobeCameraVisibility/GlobeCameraVisibility.js'
import { GlobeLOD, GlobeLODBaseOptions } from '../GlobeLOD/GlobeLOD.js'
import MapTilesManager from '../MapTilesManager/MapTilesManager.js'
import TerraFirma from '../TerraFirma.js'
import { GeographicCoordinates } from '../types/geographic.js'
import ElevationTileTexture from '../TileTextures/ElevationTileTexture.js'
import SatelliteTileTexture from '../TileTextures/SatelliteTileTexture.js'
import { analyzePointElevation } from '../utils/map.js'

export interface POI extends GeographicCoordinates {
  name?: string
}

export interface TilesManagerBaseConfig {
  providers: TilesProviders
  maxTileDefinition?: number
  lod?: GlobeLODBaseOptions
  cameraVisibility?: GlobeCameraVisibilityBaseOptions
  onIdle?: () => void
}

export interface TilesManagerBaseOptions {
  useWorkers?: boolean
  poi: POI
  providers: TilesProviders

  parent: Object3D
  onPOIAltitude: (altitude: number) => void
  onCameraUpdate: (altitude: number) => void
  onIdle?: () => void
}

export interface TilesManagerOptions extends NonNullable<TilesManagerBaseConfig>, TilesManagerBaseOptions {}

interface TilesManagerState {
  isIdling: boolean
  debugZoom: boolean
  debugElevation: boolean
  // lercLoaded: boolean
  ready: boolean
  paused: boolean
}

export default class TilesManager {
  terraFirma: TerraFirma
  renderer: TerraFirma['renderer']

  options: NonNullable<TilesManagerOptions>
  state: TilesManagerState

  parent: Object3D
  tilesGroup!: Object3D
  raycaster!: Raycaster

  providers: TilesProviders

  zooms: {
    max: {
      elevation: number
      satellite: number
    }
  }

  poi!: POI

  mapTilesManager: MapTilesManager
  globeLOD!: GlobeLOD
  globeCameraVisibility!: GlobeCameraVisibility

  elevationTileTextures!: Map<string, ElevationTileTexture>
  satelliteTileTextures!: Map<string, SatelliteTileTexture>

  elevationSampler!: Sampler
  satelliteSampler!: Sampler

  constructor(terraFirma: TerraFirma, options = {} as TilesManagerOptions) {
    this.terraFirma = terraFirma
    this.renderer = this.terraFirma.renderer

    const defaultOptions = {
      useWorkers: false,
      poi: {
        latitude: 0,
        longitude: 0,
      },
      parent: null,
      onPOIAltitude: (_altitude: number) => {},
      onCameraUpdate: (_altitude: number) => {},
      onIdle: () => {},
    }

    const basicOptions: TilesManagerBaseOptions = { ...defaultOptions, ...options }

    this.options = { ...defaultTilesConfig, ...basicOptions }

    this.state = {
      isIdling: false,
      debugZoom: false,
      debugElevation: false,
      ready: false,
      paused: false,
    }

    const { poi, parent, providers } = this.options

    this.zooms = {
      max: {
        elevation: 0,
        satellite: 0,
      },
    }

    this.parent = parent

    this.providers = providers
    this.setMaxZooms()

    this.mapTilesManager = new MapTilesManager({ tilesManager: this })

    this.setSceneRenderingObjects()

    this.setGlobeLOD()
    this.setGlobeCameraVisibility()

    this.setPOI(poi)

    this.init()
  }

  setPOI(poi: POI) {
    this.poi = poi

    this.options.onPOIAltitude(EARTH_RADIUS + EARTH_RADIUS * 0.25)

    // get altitude
    this.getPointAltitude(this.poi).then((altitude) => {
      this.options.onPOIAltitude(altitude)
    })
  }

  init() {
    this.mapTilesManager.init()
    this.globeCameraVisibility.init()
    this.tilesGroup.parent = this.parent
    this.state.paused = false
  }

  setMaxZooms() {
    this.zooms.max = {
      // take account of provider density
      elevation:
        this.providers.elevation.density === 2
          ? this.providers.elevation.maxZoom - 1
          : this.providers.elevation.maxZoom,
      satellite: this.providers.satellite.maxZoom,
    }
  }

  getDefinitionAtZoomLevel(zoom = 10) {
    // maxTileDefinition default to 64
    return Math.min(this.options.maxTileDefinition, Math.max(32, zoom * 8))
  }

  setSceneRenderingObjects() {
    this.elevationTileTextures = new Map()
    this.satelliteTileTextures = new Map()

    this.elevationSampler = new Sampler(this.renderer, {
      label: 'Elevation sampler',
      name: 'elevationSampler',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
      maxAnisotropy: 16,
    })

    this.satelliteSampler = new Sampler(this.renderer, {
      label: 'Satellite sampler',
      name: 'satelliteSampler',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
      maxAnisotropy: 16,
    })

    this.tilesGroup = new Object3D()

    this.raycaster = new Raycaster(this.renderer)
  }

  setGlobeLOD() {
    this.globeLOD = new GlobeLOD({
      ...this.options.lod,
      maxZoom: this.zooms.max.satellite,

      // Same elevation zoom selection as MapTile.
      getMaxZooms: ([, , zoom]) => {
        const { zooms, providers } = this

        const maxZooms = {
          elevation: zooms.max.elevation,
          satellite: zooms.max.satellite,
        }

        if (zoom > zooms.max.elevation) {
          maxZooms.elevation = Math.min(zoom, zooms.max.elevation)
        } else if (providers.elevation.density === 2 && zoom > 2) {
          maxZooms.elevation = zoom - 1
        }

        if (zoom > zooms.max.satellite) {
          maxZooms.satellite = zooms.max.satellite
        }

        return maxZooms
      },
      // Match MapTile's mesh definition.
      getMeshDefinition: (zoom) => {
        return this.getDefinitionAtZoomLevel(zoom)
      },
      onUpdate: (visibleTiles) => {
        this.mapTilesManager?.update(visibleTiles)

        // console.log(this.globeLOD.getStats())
        // console.table(this.globeLOD.getStats().tilesByZoom)
        // console.log('Visible tiles:', visibleTiles)
        //

        const currentTargetElevation = this.getCurrentTargetElevation()
        this.terraFirma.controls?.setCurrentElevation(currentTargetElevation)
      },
    })
  }

  getCurrentTargetElevation(): number | undefined {
    // center of screen
    this.raycaster.setFromNDCCoords(0, 0)
    const centerTile = this.globeLOD.getClosestTileToTargetFromRay(this.raycaster.ray)

    return centerTile?.terrainMetadata?.max
  }

  onElevationMetadataAvailable(tile: tilebelt.Tile, metadata: TileElevationMetadata) {
    this.globeLOD.onElevationMetadataAvailable(tile, metadata)
  }

  setGlobeCameraVisibility() {
    this.globeCameraVisibility = new GlobeCameraVisibility(this.renderer.camera, {
      ...this.options.cameraVisibility,
      onUpdate: (result) => {
        this.globeLOD.update(result)
        const altitude = this.globeCameraVisibility.altitude
        this.options.onCameraUpdate(altitude)
      },
    })
  }

  getCurrentProvider<T extends keyof TilesProviders>(type: T): TilesProviders[T] {
    return this.providers[type]
  }

  async updateProvider<T extends keyof TilesProviders>(type: T, provider: TilesProviders[T]) {
    if (!provider) {
      return
    }

    this.providers[type] = provider
    this.setMaxZooms()

    this.globeLOD.maxZoom = this.zooms.max.satellite
    this.globeLOD.update()

    // clear cache
    tilesTextureCache.clearCache({ type })

    if (type === 'elevation') {
      // force clear residual textures
      this.elevationTileTextures.forEach((tileTexture) => {
        if (tileTexture.texture) {
          tileTexture.destroy({ removeFromTilesManager: false, force: false })
        }
      })

      this.elevationTileTextures.forEach((tile) => {
        tile.setProvider(this.providers.elevation)
        tile.setTexture()
      })

      this.mapTilesManager.mapTiles.forEach((mapTile) => {
        mapTile.updateElevationTexture()
      })
    } else if (type === 'satellite') {
      this.satelliteTileTextures.forEach((tileTexture) => {
        if (tileTexture.texture) {
          tileTexture.destroy({ removeFromTilesManager: false })
        }
      })

      this.satelliteTileTextures.forEach((tile) => {
        tile.setProvider(this.providers.satellite)
        tile.setTexture()
      })

      this.mapTilesManager.mapTiles.forEach((mapTile) => {
        mapTile.updateSatelliteTexture()
      })
    }
  }

  async getValidElevationTile(tile: tilebelt.Tile): Promise<GetRasterTile | undefined> {
    const rasterTile = await tilesAPI.getRasterTile({
      tile,
      tileType: 'elevation',
      provider: this.providers.elevation,
    })

    if (rasterTile.valid) {
      return rasterTile
    } else if (tile[2] > 2) {
      const parentTile = tilebelt.getParent(tile)
      return await this.getValidElevationTile(parentTile)
    }
  }

  async getPointAltitude(
    point: GeographicCoordinates = {
      latitude: 0,
      longitude: 0,
    },
    exactAltitude = true,
  ): Promise<number> {
    const tile = tilebelt.pointToTile(point.longitude, point.latitude, this.zooms.max.elevation - 2)

    const cached = tilesElevationsCache.getSource(tile)
    if (cached !== undefined && !exactAltitude) return cached.max

    const sourceCache = tilesSourcesCache.getSource({ tile, type: 'elevation', provider: this.providers.elevation })

    let rasterTile: GetRasterTile | undefined

    if (sourceCache?.source) {
      rasterTile = {
        source: sourceCache.source,
        metadata: cached,
        valid: true,
      }
    }

    if (!rasterTile?.source) {
      rasterTile = await this.getValidElevationTile(tile)
    }

    if (rasterTile) {
      if (rasterTile.metadata) {
        tilesElevationsCache.addSource({ tile, elevation: rasterTile.metadata })
      }

      if (exactAltitude) {
        const tileFraction = tilebelt.pointToTileFraction(point.longitude, point.latitude, this.zooms.max.elevation - 2)
        const fraction: tilebelt.Tile = [tileFraction[0] - tile[0], tileFraction[1] - tile[1], tile[2]]

        if (rasterTile.source) {
          const pointElevation = analyzePointElevation(rasterTile.source, fraction, this.providers.elevation.encoding)
          if (pointElevation >= 0) {
            return pointElevation
          } else {
            return rasterTile.metadata?.max ?? 0
          }
        }

        return 0
      } else {
        return rasterTile.metadata?.max ?? 0
      }
    }

    return 0
  }

  setDebugZoom(debugZoom = false) {
    this.state.debugZoom = debugZoom

    this.mapTilesManager.mapTiles?.forEach((mapTile) => {
      mapTile.tileMesh?.setDebugZoom(debugZoom)
    })
  }

  setDebugElevation(debugElevation = false) {
    this.state.debugElevation = debugElevation

    this.mapTilesManager.mapTiles?.forEach((mapTile) => {
      mapTile.tileMesh?.setDebugElevation(debugElevation)
    })
  }

  onIdle() {
    // TODO
    // const visibleMeshes = this.renderer.meshes.filter((mesh) => mesh.visible)
    // const invisibleMeshes = this.renderer.meshes.filter((mesh) => !mesh.visible)
    // console.log('QUEUE finished', this, visibleMeshes, invisibleMeshes)

    console.log('QUEUE finished', {
      meshes: this.renderer.meshes.length,
      textures: this.renderer.textures.length,
      mapTiles: this.mapTilesManager.mapTiles.size,
      stats: this.globeLOD.getStats(),
    })
    this.options.onIdle?.()
  }

  update() {
    if (this.state.paused) return

    if (this.state.isIdling && this.mapTilesManager && (!this.mapTilesManager.isIdling || !this.globeLOD.isIdling)) {
      this.state.isIdling = false
    }

    this.globeLOD.render()
    taskQueueScheduler.executeQueue()
    this.mapTilesManager?.render()

    this.renderer.onBeforeRenderScene.add(
      () => {
        if (
          !this.state.isIdling &&
          this.mapTilesManager.isIdling &&
          this.globeLOD.isIdling &&
          !this.terraFirma.deviceManager.texturesQueue.length
        ) {
          this.state.isIdling = true

          this.state.ready = true

          this.onIdle()
        }
      },
      { once: true },
    )
  }

  cleanScene() {
    this.state.paused = true

    if (this.parent && this.tilesGroup) {
      this.tilesGroup.parent = null
    }

    this.mapTilesManager.destroy()
    this.globeLOD.destroy()
    this.globeCameraVisibility.destroy()

    // force textures cleanup
    this.elevationTileTextures.forEach((tileTexture) => {
      if (tileTexture.texture) {
        tileTexture.destroy({ removeFromTilesManager: true, force: true })
      }
    })

    this.satelliteTileTextures.forEach((tileTexture) => {
      if (tileTexture.texture) {
        tileTexture.destroy()
      }
    })

    tilesGeometriesCache.clearCache()
    tilesTextureCache.clearAllCaches()
    tilesSourcesCache.clearAllCaches()
    tilesElevationsCache.clearCache()

    taskQueueScheduler.clearAll()

    this.elevationTileTextures.clear()
    this.satelliteTileTextures.clear()

    console.log('CLEAN UP finished', this.renderer.meshes.length)

    // enough?
    this.state.paused = false
  }

  destroy() {
    this.cleanScene()

    tilesAPI.destroy()

    this.state.paused = true
  }
}
