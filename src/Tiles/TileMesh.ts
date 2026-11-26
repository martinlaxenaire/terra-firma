import { MediaTexture, Mesh, Object3D, Sampler, Vec3, sRGBToLinear } from 'gpu-curtains'
import * as tilebelt from '@mapbox/tilebelt'
import { getTileBBoxCenterCoords } from '../utils/map.js'
import { tilesGeometriesCache } from '../caches/tiles-geometries-cache.js'
import { tileFs, tileVs } from '../shaders/tile.js'
import TilesManager from '../TilesManager/TilesManager.js'
import { EARTH_RADIUS, EARTH_CIRCUMFERENCE } from '../config/constants.js'
import MapTile from './MapTile.js'
import ElevationTileTexture from '../TileTextures/ElevationTileTexture.js'
import SatelliteTileTexture from '../TileTextures/SatelliteTileTexture.js'
import { TileGeometry } from './TileGeometry.js'

export interface TileMeshOptions {
  tilesManager: TilesManager
  mapTile: MapTile
  elevationTile: ElevationTileTexture
  satelliteTile: SatelliteTileTexture
  tile?: tilebelt.Tile
  definition?: number
  parent: Object3D
  visible?: boolean
  onMeshReady?: () => void
}

export default class TileMesh {
  tilesManager: TilesManager
  renderer: TilesManager['renderer']
  mapTile: MapTile
  zoom: number
  elevationTile: ElevationTileTexture
  satelliteTile: SatelliteTileTexture
  tile: tilebelt.Tile

  ready: boolean
  readyCallbackRegistered: boolean
  visible: boolean

  tileBBox: number[]
  definition: number
  position: Vec3
  tileCenter: {
    longitude: number
    latitude: number
  }

  parent: Object3D

  elevationTexture: MediaTexture | undefined
  satelliteTexture: MediaTexture | undefined

  mesh: Mesh | undefined

  geometry: TileGeometry | undefined

  onMeshReady: () => void

  constructor({
    tilesManager,
    mapTile,
    tile = [0, 0, 10],
    elevationTile,
    satelliteTile,
    definition = 1,
    parent,
    visible = true,
    onMeshReady = () => {},
  }: TileMeshOptions) {
    this.tilesManager = tilesManager
    this.renderer = this.tilesManager.renderer
    this.mapTile = mapTile
    this.zoom = tile[2]
    this.elevationTile = elevationTile
    this.satelliteTile = satelliteTile
    this.tile = tile

    this.ready = false
    this.readyCallbackRegistered = false
    this.visible = visible
    this.onMeshReady = onMeshReady

    this.tileBBox = tilebelt.tileToBBOX(tile)

    this.position = new Vec3()

    this.tileCenter = getTileBBoxCenterCoords(this.tileBBox)

    this.definition = definition
    this.parent = parent

    this.setGeometry()
    this.setTextures()
    this.setElevationTextureTransform()
    this.setMesh()
  }

  setTextures() {
    this.elevationTexture = new MediaTexture(this.renderer, {
      label: `Elevation texture [${this.tile[0]}, ${this.tile[1]}, ${this.tile[2]}]`,
      name: 'elevationTexture',
      // format: 'rgba16float',
      useTransform: true,
      cache: false,
      generateMips: false,
      fromTexture: this.elevationTile.texture,
    })

    this.satelliteTexture = new MediaTexture(this.renderer, {
      label: `Satellite texture [${this.tile[0]}, ${this.tile[1]}, ${this.tile[2]}]`,
      name: 'satelliteTexture',
      useTransform: false,
      cache: false,
      fromTexture: this.satelliteTile.texture,
    })
  }

  setElevationTextureTransform() {
    const [x, y, z] = this.tile
    const [ex, ey, ez] = this.elevationTile.tile

    const zoomDiff = z - ez
    const factor = Math.pow(2, zoomDiff)

    const scale = 1 / factor

    const offsetX = (x - ex * factor) / factor
    const offsetY = (y - ey * factor) / factor

    this.elevationTexture?.scale.set(scale, scale)
    this.elevationTexture?.offset.set(offsetX, offsetY)
  }

  updateElevationTexture() {
    if (this.mesh) {
      this.mesh.uniforms.params.elevationMapEncoding.value =
        this.elevationTile.provider.encoding === 'terrarium' ? 1 : 0
    }

    if (this.elevationTexture && this.elevationTile.texture) {
      this.elevationTexture.copy(this.elevationTile.texture)
    }
  }

  updateSatelliteTexture() {
    if (this.satelliteTexture && this.satelliteTile.texture) {
      this.satelliteTexture.copy(this.satelliteTile.texture)
    }
  }

  setGeometry() {
    this.geometry = tilesGeometriesCache.getGeometry(this.definition)
  }

  getMetersPerPixel(z: number, y: number, tileSize = 256): number {
    // Convert tile Y coordinate to center latitude in radians
    const n = Math.PI - (2 * Math.PI * (y + 0.5)) / Math.pow(2, z)
    const latRad = Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))

    const resolutionAtEquator = EARTH_CIRCUMFERENCE / (tileSize * Math.pow(2, z))
    return resolutionAtEquator * Math.cos(latRad)
  }

  resetElevationTextureZoomLevel() {
    this.setElevationTextureTransform()
    if (this.mesh) {
      this.mesh.uniforms.tile.metersPerPixel.value = this.getMetersPerPixel(
        this.elevationTile.tile[2],
        this.elevationTile.tile[1],
      )
    }
  }

  setMesh() {
    const textures = [this.elevationTexture, this.satelliteTexture].filter(Boolean) as MediaTexture[]
    const samplers = [this.tilesManager.elevationSampler, this.tilesManager.satelliteSampler].filter(
      Boolean,
    ) as Sampler[]

    this.mesh = new Mesh(this.renderer, {
      label: `Tile [${this.tile[0]}, ${this.tile[1]}, ${this.tile[2]}]`,
      geometry: this.geometry,
      frustumCulling: false,
      // cullMode: 'none',
      textures,
      samplers,
      depthCompare: 'greater', // reverse Z
      shaders: {
        vertex: {
          code: tileVs,
        },
        fragment: {
          code: tileFs,
        },
      },
      bindings: [
        this.tilesManager.terraFirma.bindings.globe,
        this.tilesManager.terraFirma.bindings.colors,
        this.tilesManager.terraFirma.bindings.features,
      ],
      uniforms: {
        tile: {
          struct: {
            current: {
              type: 'array<u32>',
              value: this.tile,
            },
            metersPerPixel: {
              type: 'f32',
              value: this.getMetersPerPixel(this.elevationTile.tile[2], this.elevationTile.tile[1]),
            },
          },
        },
        params: {
          struct: {
            skirtDepth: {
              type: 'f32',
              value: 3000.0,
            },
            elevationMapEncoding: {
              type: 'u32',
              value:
                this.elevationTile.provider.encoding === 'terrarium'
                  ? 1
                  : this.elevationTile.provider.encoding === 'hypso'
                    ? 2
                    : 0,
            },
            // This is used to eventually force rendering of a mesh with opacity 0 (discard in fs)
            // To force compile and render the mesh at least once so it can be considered ready
            // Before eventually set its visible property to false so it is not rendered anymore
            globalOpacity: {
              type: 'f32',
              value: 0,
            },
            fogNear: {
              type: 'f32',
              value: this.tilesManager.terraFirma.fog.near,
            },
            fogFar: {
              type: 'f32',
              value: this.tilesManager.terraFirma.fog.far,
            },
          },
        },
        debug: {
          struct: {
            elevationZoom: {
              type: 'u32',
              value: this.elevationTile.tile[2],
            },
            debugZoom: {
              type: 'u32',
              value: this.tilesManager.state.debugZoom ? 1 : 0,
            },
            elevation: {
              type: 'u32',
              value: this.tilesManager.state.debugElevation ? 1 : 0,
            },
          },
        },
      },
    })

    this.mesh.onBeforeRender(() => {
      if (
        !this.ready &&
        !this.readyCallbackRegistered &&
        this.mesh?.ready &&
        this.elevationTexture?.sourcesUploaded &&
        this.satelliteTexture?.sourcesUploaded
      ) {
        this.readyCallbackRegistered = true

        this.renderer.onBeforeRenderScene.add(
          () => {
            this.ready = true
            this.setGlobalOpacity(1)
            this.onMeshReady()
          },
          { once: true },
        )
      } else if (this.ready && (!this.elevationTexture?.texture || !this.satelliteTexture?.texture)) {
        // avoid rendering a tile mesh is one of the texture has been destroyed
        this.setVisibility(false)
      }
    })

    this.mesh.parent = this.parent
  }

  setVisibility(visible = false) {
    this.visible = visible

    if (this.mesh) {
      this.mesh.visible = visible
    }
  }

  setGlobalOpacity(opacity = 0) {
    if (this.mesh) {
      this.mesh.uniforms.params.globalOpacity.value = opacity
    }
  }

  setFog(useFog = true) {
    if (this.mesh) {
      this.mesh.uniforms.params.useFog.value = useFog ? 1 : 0
      this.mesh.uniforms.params.fogNear.value = this.tilesManager.terraFirma.fog.near
      this.mesh.uniforms.params.fogFar.value = this.tilesManager.terraFirma.fog.far
    }
  }

  setDebugZoom(debugZoom = false) {
    if (this.mesh) {
      this.mesh.uniforms.debug.debugZoom.value = debugZoom ? 1 : 0
    }
  }

  setDebugElevation(debugElevation = false) {
    if (this.mesh) {
      this.mesh.uniforms.debug.elevation.value = debugElevation ? 1 : 0
    }
  }

  setPosition(position = new Vec3()) {
    if (this.mesh) {
      this.position.copy(position)
    }
  }

  destroy() {
    this.elevationTexture?.destroy()
    this.elevationTexture = undefined
    this.satelliteTexture?.destroy()
    this.satelliteTexture = undefined
    this.mesh?.remove()
  }
}
