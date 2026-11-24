import { gsap } from 'gsap'
import { GPUDeviceManager, GPUCameraRenderer, Vec3, DirectionalLight } from 'gpu-curtains'
import { GlobeOrbitControls } from './controls/GlobeOrbitControls.js'

import TilesManager from './TilesManager/TilesManager.js'
import type { POI, TilesManagerBaseConfig, TilesManagerBaseOptions } from './TilesManager/TilesManager.js'

import { providersKeys } from './providers-keys.js'

// only for gui
import { defaultTilesConfig, defaultTilesProviders } from './config/config.js'
import { EARTH_RADIUS } from './config/constants.js'
import { lonLatOffsetToWorld, lonLatToWorld } from './utils/earth-coordinates.js'
import { TilesProviders } from './types/providers.js'
import { GeographicCoordinates, GlobeOffset } from './types/geographic.js'
import { Sky } from './Sky/Sky.js'

export interface TerraFirmaBaseOptions extends TilesManagerBaseConfig {
  renderer: Omit<
    GPUCameraRenderer['options'],
    'camera' | 'deviceManager' | 'container' | 'autoResize' | 'context' | 'renderPass'
  >
}

export interface TerraFirmaOptions extends Omit<TerraFirmaBaseOptions, 'providers'> {
  container: string | HTMLElement
  poi: POI
  providers?: TilesProviders
  useFog?: boolean
  useSky?: boolean
  useWorkers?: boolean
  cameraOffset?: Partial<GlobeOffset>
  currentDate?: Date
}

export default class TerraFirma {
  options: NonNullable<TerraFirmaOptions>

  config!: TerraFirmaBaseOptions
  tilesManager!: TilesManager

  dpr!: number
  deviceManager!: GPUDeviceManager
  renderer!: GPUCameraRenderer
  scene!: GPUCameraRenderer['scene']
  camera!: GPUCameraRenderer['camera']
  orbitControls!: GlobeOrbitControls

  poi!: POI

  fog!: {
    color: Vec3
    near: number
    far: number
  }

  sun!: DirectionalLight
  sky: Sky | undefined

  constructor(options: TerraFirmaOptions) {
    this.options = options
    this.options.providers = options.providers ?? defaultTilesProviders
    this.options.useFog = options.useFog ?? false
    this.options.useSky = options.useSky ?? true
    this.options.useWorkers = options.useWorkers ?? false
    const defaultCameraOffset = { north: -4_000, west: 0, altitude: 2_000 }
    this.options.cameraOffset = (
      options.cameraOffset ? { ...defaultCameraOffset, ...options.cameraOffset } : defaultCameraOffset
    ) as GlobeOffset

    this.setConfig()

    this.setPOI(
      this.options.poi && this.options.poi.latitude !== undefined && this.options.poi.longitude !== undefined
        ? this.options.poi
        : {
            latitude: 0,
            longitude: 0,
          },
    )
  }

  async init() {
    await this.setRenderer()

    this.setFog()

    this.initTilesManager()

    this.setSky()
  }

  setPOI(poi: POI) {
    this.poi = poi
  }

  updatePOI(poi = { longitude: 0, latitude: 0 }, animation: { duration: number } | boolean = false) {
    const previousPOI = this.poi
    this.poi = poi

    if (this.tilesManager) {
      if (!animation || !previousPOI) {
        this.tilesManager.setPOI(poi)
      } else {
        this.getPointAltitude(this.poi).then((altitude) => {
          const { longitude, latitude } = this.poi

          // Exact POI position, including its altitude.
          const poiWorld = lonLatToWorld({ longitude, latitude }, altitude)

          const newTarget = new Vec3(poiWorld.x, poiWorld.y, poiWorld.z)

          // Offset around POI.
          const newPosition = newTarget.clone().add(
            lonLatOffsetToWorld(this.options.cameraOffset as GlobeOffset, {
              longitude,
              latitude,
            }),
          )

          this.orbitControls?.flyTo({
            position: newPosition,
            target: newTarget,
            ...(animation && typeof animation === 'object' && { duration: animation.duration }),
            onComplete: () => {
              this.tilesManager.poi = this.poi
            },
          })
        })
      }
    }
  }

  async getPointAltitude(
    point: GeographicCoordinates = {
      latitude: 0,
      longitude: 0,
    },
    exactAltitude = true,
  ): Promise<number> {
    return this.tilesManager?.getPointAltitude(point, exactAltitude)
  }

  async getPoint3DPosition(
    point: GeographicCoordinates = {
      latitude: 0,
      longitude: 0,
    },
  ): Promise<Vec3> {
    const altitude = await this.getPointAltitude(point, true)
    const pointToWorld = lonLatToWorld(point, altitude)
    return new Vec3(pointToWorld.x, pointToWorld.y, pointToWorld.z)
  }

  setConfig() {
    const { container, useFog, cameraOffset, currentDate, ...baseOptions } = this.options
    this.config = { ...defaultTilesConfig, ...baseOptions }
  }

  async setRenderer() {
    this.dpr = Math.min(1.5, window.devicePixelRatio)

    this.deviceManager = new GPUDeviceManager({
      label: '3D map renderer device manager',
      autoRender: false,
      adapterOptions: {
        minFeatureLevel: 'compatibility',
      },
    })

    await this.deviceManager.init()

    gsap.ticker.add(() => this.deviceManager.render())

    this.renderer = new GPUCameraRenderer({
      deviceManager: this.deviceManager,
      container: this.options.container,
      pixelRatio: this.dpr,
      ...this.config.renderer,
      renderPass: {
        depthFormat: 'depth32float',
        depthClearValue: 0,
      },
      camera: {
        near: 10,
        far: 200_000,
        reversePerspective: true,
      },
    })

    this.scene = this.renderer.scene
    this.camera = this.renderer.camera

    this.orbitControls = new GlobeOrbitControls({
      camera: this.camera,
      element: this.renderer!.domElement!.element,
      maxZoom: EARTH_RADIUS * 2,
      maxPolarAngle: Math.PI * 0.75,
      minPolarAngle: 0.01,
    })

    this.renderer.onBeforeRender(() => this.render())
  }

  initTilesManager() {
    console.log(this)

    const basicOptions: TilesManagerBaseOptions = {
      providersAPIKeys: providersKeys,
      useFog: this.options.useFog ?? false,
      useWorkers: this.options.useWorkers ?? false,
      parent: this.scene,
      poi: this.poi,
      providers: this.config.providers,
      onPOIAltitude: (altitude: number) => {
        this.setCameraFromPOI(altitude)
      },
      onCameraUpdate: (altitude: number) => {
        this.orbitControls.zoomSpeed = this.getZoomSpeed(altitude)
        this.sky?.updateCameraProjection()
      },
      onMapComplete: () => {
        console.log('MAP COMPLETE!', this.tilesManager)
        console.log('NB OF TILES', this.tilesManager.mapTilesManager.mapTiles.size)
      },
      onIdle: () => {
        // TODO
      },
    }

    const options = { ...this.config, ...basicOptions }

    this.tilesManager = new TilesManager(this, options)
  }

  async updateProvider<T extends keyof TilesProviders>(type: T, provider: TilesProviders[T]) {
    await this.tilesManager?.updateProvider(type, provider)
  }

  getZoomSpeed(altitude: number) {
    const minSpeed = 1
    const maxSpeed = 100_000
    const referenceAltitude = 10_000
    const referenceSpeed = 1_000
    const exponent = 1.2

    const speed = referenceSpeed * Math.pow(Math.max(0, altitude) / referenceAltitude, exponent)

    return Math.min(maxSpeed, Math.max(minSpeed, speed))
  }

  setCameraFromPOI(altitude = 10_000) {
    const { longitude, latitude } = this.poi

    // Exact POI position, including its altitude.
    const poiWorld = lonLatToWorld({ longitude, latitude }, altitude)

    const target = new Vec3(poiWorld.x, poiWorld.y, poiWorld.z)

    // Local up: radial direction away from Earth's center.
    const up = target.clone().normalize()

    // Offset around POI.
    const position = target.clone().add(
      lonLatOffsetToWorld(this.options.cameraOffset as GlobeOffset, {
        longitude,
        latitude,
      }),
    )

    this.orbitControls.reset({
      zoomSpeed: (EARTH_RADIUS + altitude) * 0.001,
      minZoom: 200, // meters above POI
      position,
      target,
      targetElevation: altitude,
      up,
    })
  }

  setCamera({ position = this.camera.position, target = this.orbitControls.target }: { position: Vec3; target: Vec3 }) {
    const up = target.clone().normalize()

    this.orbitControls.reset({
      position,
      target,
      up,
    })
  }

  /**
   * Calculates real-time Sun position in Earth-Centered Earth-Fixed (ECEF) space
   * mapped to a standard Y-up 3D engine (like gpu-curtains).
   *
   * Coordinate Convention:
   * +Y = North Pole (90° N)
   * +Z = Prime Meridian at Equator (0° N, 0° E)
   * +X = 90° East at Equator (0° N, 90° E)
   */
  getRealTimeSunPositionECEF(position = new Vec3(), date = new Date(), scaleFactor = 1_000_000) {
    const rad = Math.PI / 180
    const AU_IN_METERS = 149597870700

    // 1. Julian Date & Centuries since J2000.0
    const jd = date.getTime() / 86400000 + 2440587.5
    const T = (jd - 2451545.0) / 36525.0

    // 2. Solar Mean Longitude & Mean Anomaly
    const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360
    const M = (357.52911 + T * (35999.05029 - 0.0001537 * T)) % 360
    const Mrad = M * rad

    // 3. Equation of Center & True Ecliptic Longitude
    const C =
      (1.914602 - T * (0.004817 + 0.000014 * T)) * Math.sin(Mrad) +
      (0.019993 - 0.000101 * T) * Math.sin(2 * Mrad) +
      0.000289 * Math.sin(3 * Mrad)
    const trueLongitude = (L0 + C) * rad

    // 4. Sun Distance (scaled to avoid float32 jitter in shaders)
    const eccentricity = 0.016708634 - T * (0.000042037 + 0.0000001267 * T)
    const trueAnomaly = (M + C) * rad
    const distanceAU = (1.000001018 * (1 - eccentricity * eccentricity)) / (1 + eccentricity * Math.cos(trueAnomaly))
    const r = (distanceAU * AU_IN_METERS) / scaleFactor

    // 5. Obliquity of the Ecliptic (Axial Tilt)
    const obliquity = (23.439291 - T * 0.0130042) * rad

    // 6. ECI (Earth-Centered Inertial) Coordinates
    const xECI = r * Math.cos(trueLongitude)
    const yECI = r * Math.cos(obliquity) * Math.sin(trueLongitude)
    const zECI = r * Math.sin(obliquity) * Math.sin(trueLongitude)

    // 7. Rotate by Greenwich Mean Sidereal Time (GMST) to get ECEF
    const gmstDeg = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - (T * T * T) / 38710000
    const theta = (gmstDeg % 360) * rad

    const cosT = Math.cos(theta)
    const sinT = Math.sin(theta)

    // ECEF in Astronomical Z-Up (X = Prime Meridian, Y = 90°E, Z = North Pole)
    const xECEF = xECI * cosT + yECI * sinT
    const yECEF = -xECI * sinT + yECI * cosT
    const zECEF = zECI

    // 8. Map to gpu-curtains Y-Up World Space (+Y = North, +Z = Prime Meridian, +X = 90°E)
    return position.set(yECEF, zECEF, xECEF)
  }

  setSky() {
    this.sun = new DirectionalLight(this.renderer)
    this.getRealTimeSunPositionECEF(this.sun.position, this.options.currentDate)
    this.sky = new Sky({ renderer: this.renderer, camera: this.camera, sunPosition: this.sun.position })
    this.useSky(this.options.useSky)
  }

  setCurrentDate(date = new Date()) {
    this.options.currentDate = date
    this.getRealTimeSunPositionECEF(this.sun.position, this.options.currentDate)
  }

  useSunLight(useSunLight = true) {
    this.tilesManager?.setSunLight(useSunLight)
  }

  useSunShadows(useSunShadows = true) {
    this.tilesManager?.setSunShadows(useSunShadows)
  }

  useSky(useSky = true) {
    this.options.useSky = useSky
    if (this.sky) {
      this.sky.mesh.visible = this.options.useSky
    }
  }

  useFog(useFog = false) {
    this.tilesManager?.setFog(useFog)
  }

  setFog() {
    this.fog = {
      color: new Vec3(1),
      near: 0,
      far: 150_000,
    }
  }

  render() {
    if (!this.options.currentDate) {
      this.getRealTimeSunPositionECEF(this.sun.position)
    }

    if (this.tilesManager) {
      this.tilesManager.update()
    }
  }

  destroy() {
    if (this.deviceManager) {
      gsap.ticker.remove(() => this.deviceManager.render())
    }

    if (this.tilesManager) {
      this.tilesManager.destroy()
    }

    // if (this.sky) {
    //   this.sky.destroy()
    // }

    this.sky?.destroy()
    this.renderer.destroy()
    this.deviceManager.destroy()
  }
}
