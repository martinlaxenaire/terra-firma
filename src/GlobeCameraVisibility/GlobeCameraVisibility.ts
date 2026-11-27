import { PerspectiveCamera, Vec3, Vec2, RendererCamera } from 'gpu-curtains'
import { DEG2RAD, EARTH_RADIUS } from '../config/constants.js'
import { GeographicCoordinates } from '../types/geographic.js'
import { globeToMercatorLatitude } from '../utils/earth-coordinates.js'

export interface GlobeVisibilityResult {
  cameraPosition: Vec3
  frustum: Array<Float32Array>
  intersections: Vec3[]
  footprint: GeographicCoordinates[]
  focalLength: number
}

export interface GlobeCameraVisibilityBaseOptions {
  edgeSamples?: number
}

interface GlobeCameraVisibilityInternalOptions {
  onUpdate?: (result: GlobeVisibilityResult) => void
}

export interface GlobeCameraVisibilityOptions
  extends GlobeCameraVisibilityBaseOptions, GlobeCameraVisibilityInternalOptions {}

export class GlobeCameraVisibility {
  readonly camera: RendererCamera

  private readonly earthRadius: number
  private readonly edgeSamples: number
  private readonly onUpdate?: (result: GlobeVisibilityResult) => void

  private readonly _onMatricesChanged: undefined | (() => void)

  private cameraPosition: Vec3

  private _result: GlobeVisibilityResult | null = null

  private lastNear = 0
  private lastFar = 0
  private updatingClippingPlanes = false

  constructor(
    private readonly camera: RendererCamera,
    options: GlobeCameraVisibilityOptions,
  ) {
    this.camera = camera

    this.cameraPosition = new Vec3()

    this.earthRadius = EARTH_RADIUS
    this.edgeSamples = Math.max(1, options.edgeSamples ?? 16)
    this.onUpdate = options.onUpdate

    this._onMatricesChanged = this.camera.onMatricesChanged
  }

  init() {
    // Called after the world or projection matrices have changed
    this.camera.onMatricesChanged = () => {
      if (this._onMatricesChanged) this._onMatricesChanged()

      this.updateCameraClippingPlanes()

      this.update()
    }
  }

  get result(): GlobeVisibilityResult {
    if (!this._result) {
      return this.update()
    }

    return this._result
  }

  get altitude(): number {
    const cameraDistance = Math.sqrt(this.camera.actualPosition.lengthSq())
    return Math.max(0, cameraDistance - this.earthRadius)
  }

  //   private getCenterRay(): Vec3 {
  //     const inverseViewProjection = this.camera.viewProjectionMatrix.getInverse()
  //
  //     const nearPoint = new Vec3(0, 0, 1).applyMat4(inverseViewProjection)
  //
  //     const farPoint = new Vec3(0, 0, 0).applyMat4(inverseViewProjection)
  //
  //     return farPoint.sub(nearPoint).normalize()
  //   }

  private updateCameraClippingPlanes(): void {
    if (this.updatingClippingPlanes) return

    const cameraDistance = Math.sqrt(this.camera.actualPosition.lengthSq())
    const altitude = Math.max(0, cameraDistance - this.earthRadius)

    const near = Math.max(0.1, Math.min(100, altitude * 0.01))
    const far = Math.max(near + 1, cameraDistance + this.earthRadius * 2)

    // Avoid rebuilding the projection matrix for insignificant changes.
    const nearChanged = Math.abs(near - this.lastNear) > 0.01
    const farChanged = Math.abs(far - this.lastFar) > 1

    if (!nearChanged && !farChanged) {
      return
    }

    this.updatingClippingPlanes = true

    try {
      this.lastNear = near
      this.lastFar = far
      this.camera.near = near
      this.camera.far = far
    } finally {
      this.updatingClippingPlanes = false
    }
  }

  /**
   * This needs to be called only with fresh camera matrices.
   * @returns
   */
  update(): GlobeVisibilityResult {
    // Inverse view-projection matrix for unprojecting NDC coordinates.
    const inverseViewProjection = this.camera.viewProjectionMatrix.getInverse()

    this.cameraPosition.copy(this.camera.actualPosition)

    const frustum = this.camera.frustumPlanes

    const intersections: Vec3[] = []

    // Sample the viewport perimeter.
    const samples: Vec3[] = []

    for (let i = 0; i <= this.edgeSamples; i++) {
      const t = i / this.edgeSamples

      // Top edge.
      samples.push(new Vec3(-1 + 2 * t, 1, 0))

      // Right edge.
      samples.push(new Vec3(1, 1 - 2 * t, 0))

      // Bottom edge.
      samples.push(new Vec3(1 - 2 * t, -1, 0))

      // Left edge.
      samples.push(new Vec3(-1, -1 + 2 * t, 0))
    }

    // Also sample the center of the viewport.
    samples.push(new Vec3(0, 0, 0))

    // Reverse-Z: near = 1, far = 0.
    const nearDepth = 1
    const farDepth = 0

    for (const sample of samples) {
      const nearPoint = sample.clone().set(sample.x, sample.y, nearDepth).applyMat4(inverseViewProjection)

      const farPoint = sample.clone().set(sample.x, sample.y, farDepth).applyMat4(inverseViewProjection)

      const direction = farPoint.sub(nearPoint).normalize()

      const intersection = this.intersectSphere(this.cameraPosition, direction, this.earthRadius)

      if (intersection) {
        intersections.push(intersection)
      }
    }

    const footprint = intersections.map((point) => this.toLonLat(point))

    this._result = {
      cameraPosition: this.cameraPosition,
      frustum,
      intersections,
      footprint,
      focalLength:
        this.camera instanceof PerspectiveCamera
          ? this.camera.size.height / (2 * Math.tan(this.camera.fov * DEG2RAD * 0.5))
          : this.camera.top - this.camera.bottom,
    }

    this.onUpdate?.(this._result)

    return this._result
  }

  /**
   * Intersect a ray with the Earth sphere.
   *
   * Ray: origin + t * direction
   */
  private intersectSphere(origin: Vec3, direction: Vec3, radius: number): Vec3 | null {
    const b = 2 * origin.dot(direction)
    const c = origin.lengthSq() - radius ** 2

    const discriminant = b * b - 4 * c

    if (discriminant < 0) return null

    const sqrtDiscriminant = Math.sqrt(discriminant)

    const t1 = (-b - sqrtDiscriminant) * 0.5
    const t2 = (-b + sqrtDiscriminant) * 0.5

    const t = t1 > 0 ? t1 : t2 > 0 ? t2 : Infinity

    if (!Number.isFinite(t)) return null

    return direction.clone().multiplyScalar(t).add(origin)
  }

  /**
   * Convert an ECEF point to longitude and latitude.
   *
   * Convention:
   * - Y is north
   * - longitude 0 is +Z
   * - longitude 90° east is +X
   */
  private toLonLat(point: Vec3): GeographicCoordinates {
    const radius = Math.sqrt(point.lengthSq())

    return {
      longitude: Math.atan2(point.x, point.z),
      latitude: Math.asin(Math.max(-1, Math.min(1, point.y / radius))),
    }
  }

  /**
   * Convert geographic coordinates into normalized XYZ Web Mercator UV.
   *
   * The returned coordinates correspond to the original tile projection,
   * not the distorted spherical projection.
   */
  private toTileUV(point: Vec3): Vec2 {
    const geographic = this.toLonLat(point)

    const mercatorLat = globeToMercatorLatitude(geographic.latitude)

    const u = (geographic.longitude + Math.PI) / (2 * Math.PI)

    const v = (1 - Math.asinh(Math.tan(mercatorLat)) / Math.PI) * 0.5

    return new Vec2(u, Math.max(0, Math.min(1, v)))
  }

  destroy(): void {
    this._result = null
    this.camera.onMatricesChanged = this._onMatricesChanged
  }
}
