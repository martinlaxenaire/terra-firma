import gsap from 'gsap'
import { Vec2, Vec3, Quat, PerspectiveCamera, OrthographicCamera } from 'gpu-curtains'
import { EARTH_RADIUS } from '../config/constants.js'
import { lerp } from '../utils/maths.js'
import { getSphericalDistanceFromVec3 } from '../utils/earth-coordinates.js'

// Based on gpu-curtains OrbitControls.

const tempVec2a = new Vec2()
const tempVec2b = new Vec2()
const tempVec3 = new Vec3()
const inverseQuat = new Quat()

const WORLD_UP = new Vec3(0, 1, 0)
const GLOBE_ROTATE_SENSITIVITY = 0.0005
const EPSILON = 0.00001

type Camera = PerspectiveCamera | OrthographicCamera

/** Defines the base parameters used to set / reset GlobeOrbitControls. */
export interface GlobeOrbitControlsBaseParams {
  /** The focus point of the controls. */
  target?: Vec3
  /** Current target elevation. */
  targetElevation?: number

  /** Whether to allow zooming. */
  enableZoom?: boolean
  /** Minimum camera distance from target. */
  minZoom?: number
  /** Maximum camera distance from target. */
  maxZoom?: number
  /** Zoom speed. */
  zoomSpeed?: number

  /** Whether to allow rotating. */
  enableRotate?: boolean
  /** Minimum vertical rotation angle for Ctrl-orbit. */
  minPolarAngle?: number
  /** Maximum vertical rotation angle for Ctrl-orbit. */
  maxPolarAngle?: number
  /** Minimum horizontal rotation angle for Ctrl-orbit. */
  minAzimuthAngle?: number
  /** Maximum horizontal rotation angle for Ctrl-orbit. */
  maxAzimuthAngle?: number
  /** Rotation speed. */
  rotateSpeed?: number
  /** Up vector used for camera lookAt computations. */
  up?: Vec3

  /** Whether to allow panning. */
  enablePan?: boolean
  /** Pan speed. */
  panSpeed?: number
}

export interface GlobeOrbitControlsParams extends GlobeOrbitControlsBaseParams {
  camera?: Camera
  element?: HTMLElement | Window
}

export class GlobeOrbitControls {
  /** Camera controlled by this instance. */
  camera: Camera

  #element: HTMLElement | Window | null = null

  /** Camera lookAt point / current POI. */
  target!: Vec3

  /**
   * Centre of the Earth.
   *
   * Normal left-drag rotates both camera and target around this point.
   * It is normally the world origin.
   */
  globeTarget = new Vec3()

  #offset = new Vec3()

  enabled: boolean

  enableZoom!: boolean
  #minZoom = 0
  maxZoom!: number
  zoomSpeed!: number
  #pinchDist = 0
  /** Current target estimated elevation. */
  targetElevation = 0

  enableRotate!: boolean
  minPolarAngle!: number
  maxPolarAngle!: number
  minAzimuthAngle!: number
  maxAzimuthAngle!: number
  rotateSpeed!: number
  up!: Vec3

  #isOrbiting = false
  #spherical = { radius: 1, phi: 0, theta: 0 }
  #basePhi = 0
  #rotateStart = new Vec2()
  #quaternion = new Quat()

  /** True for normal globe rotation, false for Ctrl-orbit around target. */
  #isGlobeOrbit = true

  enablePan!: boolean
  panSpeed!: number
  #isPaning = false
  #panStart = new Vec2()
  #panDelta = new Vec3()

  // Reusable quaternions for globe rotation.
  #horizontalRotation = new Quat()
  #verticalRotation = new Quat()

  // Prevent target.onChange from updating the camera halfway through
  // a compound globe rotation.
  #isUpdatingTarget = false

  #_onContextMenu: (e: MouseEvent) => void
  #_onMouseDown: (e: MouseEvent) => void
  #_onMouseMove: (e: MouseEvent) => void
  #_onMouseUp: (e: MouseEvent) => void
  #_onTouchStart: (e: TouchEvent) => void
  #_onTouchMove: (e: TouchEvent) => void
  #_onTouchEnd: (e: TouchEvent) => void
  #_onMouseWheel: (e: WheelEvent) => void

  #flyTween: gsap.core.Tween | null = null

  constructor({
    camera,
    element,
    target = new Vec3(),
    targetElevation = 0,

    enableZoom = true,
    minZoom = 0,
    maxZoom = Infinity,
    zoomSpeed = 1,

    enableRotate = true,
    minPolarAngle = 0,
    maxPolarAngle = Math.PI,
    minAzimuthAngle = -Infinity,
    maxAzimuthAngle = Infinity,
    rotateSpeed = 1,
    up = new Vec3(0, 1, 0),

    enablePan = true,
    panSpeed = 1,
  }: GlobeOrbitControlsParams) {
    if (!camera) {
      throw new Error('GlobeOrbitControls requires a camera.')
    }

    this.camera = camera
    this.enabled = true

    this.#setBaseParams({
      target,
      targetElevation,
      enableZoom,
      minZoom,
      maxZoom,
      zoomSpeed,
      enableRotate,
      minPolarAngle,
      maxPolarAngle,
      minAzimuthAngle,
      maxAzimuthAngle,
      rotateSpeed,
      up,
      enablePan,
      panSpeed,
    })

    this.#_onContextMenu = this.#onContextMenu.bind(this)
    this.#_onMouseDown = this.#onMouseDown.bind(this)
    this.#_onMouseMove = this.#onMouseMove.bind(this)
    this.#_onMouseUp = this.#onMouseUp.bind(this)
    this.#_onTouchStart = this.#onTouchStart.bind(this)
    this.#_onTouchMove = this.#onTouchMove.bind(this)
    this.#_onTouchEnd = this.#onTouchEnd.bind(this)
    this.#_onMouseWheel = this.#onMouseWheel.bind(this)

    this.element = element ?? (typeof window !== 'undefined' ? window : null)

    this.useCamera(camera)
  }

  /**
   * Set or replace the controlled camera.
   */
  useCamera(camera: Camera) {
    this.camera = camera

    this.#updateSphericalFromPosition()

    this.target.onChange(() => {
      if (!this.#isUpdatingTarget) {
        this.#update()
      }
    })

    this.#update()
  }

  /**
   * Set / reset base parameters.
   */
  #setBaseParams({
    target,
    targetElevation = this.targetElevation,
    enableZoom = this.enableZoom,
    minZoom = this.minZoom,
    maxZoom = this.maxZoom,
    zoomSpeed = this.zoomSpeed,

    enableRotate = this.enableRotate,
    minPolarAngle = this.minPolarAngle,
    maxPolarAngle = this.maxPolarAngle,
    minAzimuthAngle = this.minAzimuthAngle,
    maxAzimuthAngle = this.maxAzimuthAngle,
    rotateSpeed = this.rotateSpeed,
    up = this.up,

    enablePan = this.enablePan,
    panSpeed = this.panSpeed,
  }: GlobeOrbitControlsBaseParams = {}) {
    if (target) {
      this.target = target
    }

    this.targetElevation = targetElevation

    this.enableZoom = enableZoom
    this.minZoom = minZoom
    this.maxZoom = maxZoom
    this.zoomSpeed = zoomSpeed

    this.enableRotate = enableRotate
    this.minPolarAngle = minPolarAngle
    this.maxPolarAngle = maxPolarAngle
    this.minAzimuthAngle = minAzimuthAngle
    this.maxAzimuthAngle = maxAzimuthAngle
    this.rotateSpeed = rotateSpeed
    this.up = up.clone().normalize()

    this.enablePan = enablePan
    this.panSpeed = panSpeed
  }

  get minZoom(): number {
    return this.#minZoom
  }

  set minZoom(minZoom: number) {
    this.#minZoom = minZoom
  }

  /**
   * Reset the controls.
   */
  reset({
    position,
    target,
    targetElevation,

    enableZoom = this.enableZoom,
    minZoom = this.minZoom,
    maxZoom = this.maxZoom,
    zoomSpeed = this.zoomSpeed,

    enableRotate = this.enableRotate,
    minPolarAngle = this.minPolarAngle,
    maxPolarAngle = this.maxPolarAngle,
    minAzimuthAngle = this.minAzimuthAngle,
    maxAzimuthAngle = this.maxAzimuthAngle,
    rotateSpeed = this.rotateSpeed,
    up = this.up,

    enablePan = this.enablePan,
    panSpeed = this.panSpeed,
  }: { position?: Vec3 } & GlobeOrbitControlsBaseParams = {}) {
    this.#setBaseParams({
      target,
      targetElevation,
      enableZoom,
      minZoom,
      maxZoom,
      zoomSpeed,
      enableRotate,
      minPolarAngle,
      maxPolarAngle,
      minAzimuthAngle,
      maxAzimuthAngle,
      rotateSpeed,
      up,
      enablePan,
      panSpeed,
    })

    if (position) {
      this.updatePosition(position)
    } else {
      this.#update()
    }
  }

  /**
   * Derive spherical coordinates from a world-space camera position.
   *
   * The spherical offset is always relative to target. This is important:
   * zoom always changes camera distance to target, regardless of the
   * operation that last moved the globe.
   */
  #getSphericalFromPosition(position = this.camera.position) {
    this.#quaternion.setFromUnitVectors(WORLD_UP, this.up)

    tempVec3.copy(position).sub(this.target)

    // inverseQuat.copy(this.#quaternion).invert()
    inverseQuat.copy(this.#quaternion)

    inverseQuat.elements[0] *= -1
    inverseQuat.elements[1] *= -1
    inverseQuat.elements[2] *= -1

    tempVec3.applyQuat(inverseQuat)

    const radius = Math.max(tempVec3.length(), EPSILON)

    return {
      radius,
      theta: Math.atan2(tempVec3.x, tempVec3.z),
      phi: Math.acos(Math.min(Math.max(tempVec3.y / radius, -1), 1)),
    }
  }

  /**
   * Derive spherical coordinates from a world-space camera position.
   *
   * The spherical offset is always relative to target. This is important:
   * zoom always changes camera distance to target, regardless of the
   * operation that last moved the globe.
   */
  #updateSphericalFromPosition(position = this.camera.position, updateBasePhi = false) {
    const { radius, theta, phi } = this.#getSphericalFromPosition(position)

    this.#spherical.radius = radius
    this.#spherical.theta = theta
    this.#spherical.phi = phi

    this.#spherical.theta = Math.min(this.maxAzimuthAngle, Math.max(this.minAzimuthAngle, this.#spherical.theta))
    this.#spherical.phi = Math.min(this.maxPolarAngle, Math.max(this.minPolarAngle, this.#spherical.phi))

    if (updateBasePhi) {
      this.#basePhi = this.#spherical.phi
    }
  }

  /**
   * Override the camera position.
   */
  updatePosition(position = new Vec3()) {
    this.#updateSphericalFromPosition(position, true)
    this.#update()
  }

  set element(value: HTMLElement | Window | null) {
    if (this.#element && (!value || this.#element !== value)) {
      this.#removeEvents()
    }

    this.#element = value

    if (value) {
      this.#addEvents()
    }
  }

  get element() {
    return this.#element
  }

  #addEvents() {
    this.#element?.addEventListener('contextmenu', this.#_onContextMenu as EventListener, false)
    this.#element?.addEventListener('mousedown', this.#_onMouseDown as EventListener, false)
    this.#element?.addEventListener('mousemove', this.#_onMouseMove as EventListener, false)
    this.#element?.addEventListener('mouseup', this.#_onMouseUp as EventListener, false)
    this.#element?.addEventListener('touchstart', this.#_onTouchStart as EventListener, { passive: false })
    this.#element?.addEventListener('touchmove', this.#_onTouchMove as EventListener, { passive: false })
    this.#element?.addEventListener('touchend', this.#_onTouchEnd as EventListener, false)
    this.#element?.addEventListener('wheel', this.#_onMouseWheel as EventListener, { passive: false })
  }

  #removeEvents() {
    this.#element?.removeEventListener('contextmenu', this.#_onContextMenu as EventListener, false)
    this.#element?.removeEventListener('mousedown', this.#_onMouseDown as EventListener, false)
    this.#element?.removeEventListener('mousemove', this.#_onMouseMove as EventListener, false)
    this.#element?.removeEventListener('mouseup', this.#_onMouseUp as EventListener, false)
    this.#element?.removeEventListener(
      'touchstart',
      this.#_onTouchStart as EventListener,
      { passive: false } as EventListenerOptions,
    )
    this.#element?.removeEventListener(
      'touchmove',
      this.#_onTouchMove as EventListener,
      { passive: false } as EventListenerOptions,
    )
    this.#element?.removeEventListener('touchend', this.#_onTouchEnd as EventListener, false)
    this.#element?.removeEventListener(
      'wheel',
      this.#_onMouseWheel as EventListener,
      { passive: false } as EventListenerOptions,
    )
  }

  #onMouseDown(e: MouseEvent) {
    if (!this.enabled) return

    // if (e.button === 0 && this.enableRotate) {
    //   this.#isOrbiting = true
    //   this.#isGlobeOrbit = !e.ctrlKey
    //   this.#rotateStart.set(e.clientX, e.clientY)
    // } else if (e.button === 2 && this.enablePan) {
    //   this.#isPaning = true
    //   this.#panStart.set(e.clientX, e.clientY)
    // }

    if (e.button === 0 && this.enableRotate) {
      this.#isOrbiting = true
      this.#isGlobeOrbit = true
      this.#rotateStart.set(e.clientX, e.clientY)
    } else if (e.button === 2 && this.enableRotate) {
      this.#isOrbiting = true
      this.#isGlobeOrbit = false
      this.#rotateStart.set(e.clientX, e.clientY)
    }

    e.stopPropagation()
    e.preventDefault()
  }

  #onTouchStart(e: TouchEvent) {
    if (!this.enabled) return

    this.#pinchDist = 0

    if (e.touches.length === 1 && this.enableRotate) {
      this.#isOrbiting = true
      this.#isGlobeOrbit = true
      this.#rotateStart.set(e.touches[0].clientX, e.touches[0].clientY)
    }
  }

  #onMouseMove(e: MouseEvent) {
    if (!this.enabled) return

    if (this.#isOrbiting && this.enableRotate) {
      this.#rotate(e.clientX, e.clientY)
    } else if (this.#isPaning && this.enablePan) {
      this.#pan(e.clientX, e.clientY)
    }
  }

  #onTouchMove(e: TouchEvent) {
    if (!this.enabled) return

    if (e.touches.length === 2 && this.enableZoom) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)

      if (this.#pinchDist) {
        const zoom = this.#pinchDist - dist

        if (zoom) {
          this.#zoom(zoom * 2)
        }
      }

      this.#pinchDist = dist
    } else if (this.#isOrbiting && this.enableRotate && e.touches.length === 1) {
      this.#rotate(e.touches[0].clientX, e.touches[0].clientY)
    }

    e.preventDefault()
  }

  #onMouseUp(_e: MouseEvent) {
    this.#isOrbiting = false
    this.#isPaning = false
  }

  #onTouchEnd(_e: TouchEvent) {
    this.#isOrbiting = false
    this.#isPaning = false
    this.#pinchDist = 0
  }

  #onMouseWheel(e: WheelEvent) {
    if (this.enabled && this.enableZoom) {
      this.#zoom(e.deltaY)
      e.preventDefault()
    }
  }

  #onContextMenu(e: MouseEvent) {
    if (!this.enabled) return
    e.preventDefault()
  }

  /**
   * Rebuild camera position from target + spherical offset.
   *
   * target is deliberately not modified here. Zoom therefore cannot
   * move the lookAt point.
   */
  #update() {
    const sinPhiRadius = this.#spherical.radius * Math.sin(Math.max(EPSILON, this.#spherical.phi))

    this.#offset.set(
      sinPhiRadius * Math.sin(this.#spherical.theta),
      this.#spherical.radius * Math.cos(this.#spherical.phi),
      sinPhiRadius * Math.cos(this.#spherical.theta),
    )

    this.#quaternion.setFromUnitVectors(WORLD_UP, this.up)
    this.#offset.applyQuat(this.#quaternion)

    this.camera.position.copy(this.target).add(this.#offset)

    tempVec3.crossVectors(this.target, this.camera.position)
    const useDefaultUp = tempVec3.lengthSq() < EPSILON

    this.camera.lookAt(this.target, useDefaultUp ? null : this.up)
  }

  /**
   * Set a quaternion from an axis and angle.
   */
  #setAxisAngle(quaternion: Quat, axis: Vec3, angle: number) {
    const halfAngle = angle * 0.5
    const sinHalfAngle = Math.sin(halfAngle)
    const normalizedAxis = axis.clone().normalize()

    quaternion.elements[0] = normalizedAxis.x * sinHalfAngle
    quaternion.elements[1] = normalizedAxis.y * sinHalfAngle
    quaternion.elements[2] = normalizedAxis.z * sinHalfAngle
    quaternion.elements[3] = Math.cos(halfAngle)
  }

  #updateTargetFromElevation() {
    this.#isUpdatingTarget = true

    this.target
      .sub(this.globeTarget)
      .normalize()
      .multiplyScalar(EARTH_RADIUS + this.targetElevation)
      .add(this.globeTarget)
    this.#isUpdatingTarget = false
  }

  setCurrentElevation(elevation: number | undefined) {
    if (elevation === undefined) return
    this.targetElevation = elevation
  }

  /**
   * Rotate the Earth beneath the camera.
   *
   * Both the camera position and target are rotated around globeTarget.
   * The camera-to-target relationship is therefore preserved, while
   * target/lookAt moves across the globe.
   *
   * Rotation axes are taken from the camera's current screen-space
   * right/up directions, so this does not assume a particular initial
   * longitude, latitude, or camera heading.
   */
  #rotateGlobe(deltaX: number, deltaY: number, height: number) {
    if (height <= 0) return

    const distance = this.camera.position.distance(this.globeTarget)
    const altitude = Math.max(0, distance - EARTH_RADIUS)
    const altitudeSensitivity = Math.max(1, altitude / 12_000)
    const sensitivity = GLOBE_ROTATE_SENSITIVITY * altitudeSensitivity

    // const altitudeRatio = altitude / EARTH_RADIUS
    // const sensitivity = GLOBE_ROTATE_SENSITIVITY * Math.pow(1 + altitudeRatio, 10)

    const anglePerPixel = (2 * Math.PI * this.rotateSpeed * sensitivity) / height

    const elements = this.camera.modelMatrix.elements

    const cameraRight = new Vec3(elements[0], elements[1], elements[2]).normalize()

    const cameraUp = new Vec3(elements[4], elements[5], elements[6]).normalize()

    // Dragging right/down rotates the camera in the opposite direction,
    // making the globe appear to move with the pointer beneath it.
    this.#setAxisAngle(this.#horizontalRotation, cameraUp, -deltaX * anglePerPixel)
    this.#setAxisAngle(this.#verticalRotation, cameraRight, -deltaY * anglePerPixel)

    // Capture the new world-space positions before modifying target.
    const newCameraPosition = this.camera.position.clone().sub(this.globeTarget)

    const newTargetPosition = this.target.clone().sub(this.globeTarget)

    // Apply the same two rotations to both positions.
    newCameraPosition.applyQuat(this.#verticalRotation)
    newCameraPosition.applyQuat(this.#horizontalRotation)

    newTargetPosition.applyQuat(this.#verticalRotation)
    newTargetPosition.applyQuat(this.#horizontalRotation)

    // The camera's local up direction must follow the globe too.
    const newUp = this.up.clone()
    newUp.applyQuat(this.#verticalRotation)
    newUp.applyQuat(this.#horizontalRotation)

    newCameraPosition.add(this.globeTarget)
    newTargetPosition.add(this.globeTarget)

    // Intersect the ray with the terrain sphere.
    const terrainRadius = EARTH_RADIUS + this.targetElevation

    // Ensure the camera remains at least minZoom above the current terrain.
    const minCameraDistance = terrainRadius + this.minZoom
    const newCameraDistance = newCameraPosition.distance(this.globeTarget)

    if (newCameraDistance < minCameraDistance) {
      const cameraTargetDistance = newCameraPosition.distance(newTargetPosition)

      // back camera position from minZoom
      // newCameraPosition
      //   .sub(this.target)
      //   .normalize()
      //   .multiplyScalar(cameraTargetDistance + this.minZoom)
      //   .add(this.target)
      newCameraPosition.normalize().multiplyScalar(terrainRadius + this.minZoom)
    }

    // Ray from the rotated camera through the rotated target.
    const rayDirection = newTargetPosition.clone().sub(newCameraPosition).normalize()

    const rayOrigin = newCameraPosition.clone().sub(this.globeTarget)

    const b = rayOrigin.dot(rayDirection)
    const c = rayOrigin.lengthSq() - terrainRadius * terrainRadius

    const discriminant = b * b - c

    if (discriminant >= 0) {
      const t = -b - Math.sqrt(discriminant)

      if (t > 0) {
        newTargetPosition.copy(rayDirection).multiplyScalar(t).add(newCameraPosition)
      }
    }

    // Update target without triggering an intermediate camera update.
    this.#isUpdatingTarget = true
    this.target.copy(newTargetPosition)
    this.up.copy(newUp)
    this.#isUpdatingTarget = false

    // Re-derive the camera offset relative to the newly rotated target.
    // Its radius is unchanged, so this rotation does not zoom.
    this.#updateSphericalFromPosition(newCameraPosition)

    this.#update()
  }

  /**
   * Compute the [0..1] flattening blend factor for a given camera radius.
   */
  #getFlattenBlend(radius: number): number {
    const startFlattenRadius = EARTH_RADIUS * 0.025
    const endFlattenRadius = this.maxZoom * 0.75

    const rawT =
      endFlattenRadius > startFlattenRadius
        ? (radius - startFlattenRadius) / (endFlattenRadius - startFlattenRadius)
        : 0
    const t = Math.min(1, Math.max(0, rawT))

    // Smoothstep easing
    return t * t * (3 - 2 * t)
  }

  /**
   * Conventional orbit around the fixed target.
   * Used only while Ctrl is held at the start of a left drag.
   */
  #rotateTarget(deltaX: number, deltaY: number, height: number) {
    if (height <= 0) return

    const anglePerPixel = (2 * Math.PI * this.rotateSpeed) / height
    const minSafePhi = Math.max(this.minPolarAngle, EPSILON)

    this.#spherical.theta -= deltaX * anglePerPixel
    this.#spherical.phi -= deltaY * anglePerPixel

    this.#spherical.theta = Math.min(this.maxAzimuthAngle, Math.max(this.minAzimuthAngle, this.#spherical.theta))
    this.#spherical.phi = Math.min(this.maxPolarAngle, Math.max(minSafePhi, this.#spherical.phi))

    // Invert the zoom lerp so the next #zoom tick continues smoothly from the
    // current #spherical.phi without jumping.
    const blend = this.#getFlattenBlend(this.#spherical.radius)
    if (blend < 0.99) {
      const invertedBasePhi = (this.#spherical.phi - minSafePhi * blend) / (1 - blend)
      this.#basePhi = Math.min(this.maxPolarAngle, Math.max(minSafePhi, invertedBasePhi))
    } else {
      this.#basePhi = this.#spherical.phi
    }

    this.#update()
  }

  /**
   * Handle left-drag rotation.
   */
  #rotate(x: number, y: number) {
    tempVec2a.set(x, y)

    tempVec2b.copy(tempVec2a).sub(this.#rotateStart)

    const deltaX = tempVec2b.x
    const deltaY = tempVec2b.y

    this.#rotateStart.copy(tempVec2a)

    const height =
      this.camera instanceof PerspectiveCamera
        ? this.camera.size.height
        : this.camera instanceof OrthographicCamera
          ? (this.camera.top - this.camera.bottom) * 2
          : 0

    if (this.#isGlobeOrbit) {
      this.#rotateGlobe(deltaX, deltaY, height)
    } else {
      this.#rotateTarget(deltaX, deltaY, height)
    }
  }

  /**
   * Pan by translating target/lookAt and keeping the camera offset.
   */
  #pan(x: number, y: number) {
    tempVec2a.set(x, y)
    tempVec2b.copy(tempVec2a).sub(this.#panStart).multiplyScalar(this.panSpeed)

    this.#panDelta.set(0)

    tempVec3.copy(this.camera.position).sub(this.target)
    let targetDistance = tempVec3.length()

    // pan left
    // get right direction axis accounting for camera transform
    tempVec3.set(
      this.camera.modelMatrix.elements[0],
      this.camera.modelMatrix.elements[1],
      this.camera.modelMatrix.elements[2],
    )

    if (this.camera instanceof PerspectiveCamera) {
      targetDistance *= Math.tan(((this.camera.fov / 2) * Math.PI) / 180.0)
      tempVec3.multiplyScalar(-(2 * tempVec2b.x * targetDistance) / this.camera.size.height)
    } else if (this.camera instanceof OrthographicCamera) {
      targetDistance *= 1 / ((this.camera.top - this.camera.bottom) * 2)
      tempVec3.multiplyScalar(-(2 * tempVec2b.x * targetDistance) / ((this.camera.right - this.camera.left) * 2))
    }
    this.#panDelta.add(tempVec3)

    // pan up
    // get up direction axis accounting for camera transform
    tempVec3.set(
      this.camera.modelMatrix.elements[4],
      this.camera.modelMatrix.elements[5],
      this.camera.modelMatrix.elements[6],
    )

    if (this.camera instanceof PerspectiveCamera) {
      tempVec3.multiplyScalar((2 * tempVec2b.y * targetDistance) / this.camera.size.height)
    } else if (this.camera instanceof OrthographicCamera) {
      tempVec3.multiplyScalar((2 * tempVec2b.y * targetDistance) / ((this.camera.top - this.camera.bottom) * 2))
    }

    this.#panDelta.add(tempVec3)

    this.#panStart.copy(tempVec2a)

    this.target.add(this.#panDelta)
    this.#offset.copy(this.camera.position).sub(this.target)
    this.#spherical.radius = this.#offset.length()

    this.#update()
  }

  /**
   * Zoom by changing only the spherical radius and phi.
   * target/lookAt is not modified.
   */
  #zoom(value: number) {
    const prevRadius = this.#spherical.radius

    const newRadius = Math.min(
      this.maxZoom,
      Math.max(this.minZoom + EPSILON, prevRadius + (value * this.zoomSpeed) / 100),
    )

    const minSafePhi = Math.max(this.minPolarAngle, EPSILON)
    const prevBlend = this.#getFlattenBlend(prevRadius)
    const newBlend = this.#getFlattenBlend(newRadius)

    this.#spherical.radius = newRadius

    if (newRadius > prevRadius) {
      // Zoom out: progressive centering from current angle toward minSafePhi
      const remaining = 1 - prevBlend
      if (remaining > EPSILON && newBlend > prevBlend) {
        const stepRatio = Math.min(1, (newBlend - prevBlend) / remaining)
        this.#spherical.phi = lerp(this.#spherical.phi, minSafePhi, stepRatio)
      } else if (newBlend >= 1) {
        // If the user zooms close to maxZoom after a rotateTaget,
        // bring the globe slowly back toward center
        this.#spherical.phi = lerp(this.#spherical.phi, minSafePhi, 0.15)
      }
    } else {
      // Zoom in: going back from current angle toward #basePhi
      if (prevBlend > 0.0001 && newBlend < prevBlend) {
        const stepRatio = Math.min(1, (prevBlend - newBlend) / prevBlend)
        this.#spherical.phi = lerp(this.#spherical.phi, this.#basePhi, stepRatio)
      }
    }

    this.#spherical.phi = Math.min(this.maxPolarAngle, Math.max(minSafePhi, this.#spherical.phi))

    this.#update()
  }

  /**
   * Cancel a running `flyTo` animation.
   */
  cancelFlyTo() {
    if (this.#flyTween) {
      this.#flyTween.kill()
      this.#flyTween = null
      this.enabled = true
    }
  }

  /**
   * Animate camera around the globe toward a new position and target,
   * with a zoom arc proportionnal to the spherical distance.
   */
  flyTo({
    position: newPosition,
    target: newTarget,
    duration,
    minDuration = 1,
    maxDuration = 7.5,
    ease = 'expo.inOut',
    onComplete,
  }: {
    position: Vec3
    target: Vec3
    // Based on spherical distance if ommited
    duration?: number
    minDuration?: number
    maxDuration?: number
    ease?: string
    onComplete?: () => void
  }): gsap.core.Tween {
    this.cancelFlyTo()

    const center = this.globeTarget.clone()

    // Initial state
    const startTarget = this.target.clone()
    const startPosition = this.camera.position.clone()
    const startUp = this.up.clone().normalize()

    const startNormal = startTarget.clone().sub(center)
    const endNormal = newTarget.clone().sub(center)

    const startTargetRadius = startNormal.length()
    const endTargetRadius = endNormal.length()

    if (startTargetRadius > 0.0001) startNormal.normalize()
    else startNormal.copy(startUp)

    if (endTargetRadius > 0.0001) endNormal.normalize()
    else endNormal.copy(newTarget).normalize()

    // Spherical quaternion rotation
    const fullRotation = new Quat()
    const dot = startNormal.dot(endNormal)

    if (dot < -0.9999) {
      const orthoAxis = Math.abs(startNormal.y) < 0.9 ? WORLD_UP : new Vec3(1, 0, 0)
      const rotationAxis = new Vec3().copy(startNormal).cross(orthoAxis).normalize()
      this.#setAxisAngle(fullRotation, rotationAxis, Math.PI)
    } else {
      fullRotation.setFromUnitVectors(startNormal, endNormal)
    }

    const endUp = startUp.clone().applyQuat(fullRotation).normalize()

    // Decompose local offsets in start and end spaces
    const buildInverseBasis = (upVec: Vec3) => {
      const q = new Quat()
      if (upVec.y < -0.9999) {
        q.elements[0] = 1
        q.elements[1] = 0
        q.elements[2] = 0
        q.elements[3] = 0
      } else {
        q.setFromUnitVectors(WORLD_UP, upVec)
      }
      q.invert()
      return q
    }

    const invStartQuat = buildInverseBasis(startUp)
    const invEndQuat = buildInverseBasis(endUp)

    const localStartOffset = startPosition.clone().sub(startTarget).applyQuat(invStartQuat)
    const localEndOffset = newPosition.clone().sub(newTarget).applyQuat(invEndQuat)

    const startCamOffsetLength = localStartOffset.length()
    const endCamOffsetLength = localEndOffset.length()

    const localStartDir = startCamOffsetLength > 0.0001 ? localStartOffset.clone().normalize() : new Vec3(0, 1, 0)
    const localEndDir = endCamOffsetLength > 0.0001 ? localEndOffset.clone().normalize() : new Vec3(0, 1, 0)

    // Compute spherical distance, adaptive duration, and max zoom height
    const sphericalDist = getSphericalDistanceFromVec3(startTarget, newTarget)
    const maxArcDist = Math.PI * EARTH_RADIUS
    const distanceRatio = Math.min(1, sphericalDist / maxArcDist)

    const durationFactor = Math.pow(distanceRatio, 0.3)
    const resolvedDuration = duration ?? lerp(minDuration, maxDuration, durationFactor)

    // Cap the peak camera offset directly at `this.maxZoom`
    const basePeakOffset = Math.max(startCamOffsetLength, endCamOffsetLength)
    const maxAllowedOffset = Number.isFinite(this.maxZoom) ? this.maxZoom : EARTH_RADIUS * 2.5
    const peakOffsetLength = lerp(basePeakOffset, maxAllowedOffset, distanceRatio)

    // Flatten intensity [0..1]: reaches 100% around 35% of a half-globe trip
    const rawFlatten = Math.min(1, distanceRatio / 0.35)
    const flattenStrength = rawFlatten * rawFlatten * (3 - 2 * rawFlatten)

    // Safe minimum polar angle (~1.15 deg) so `lookAt` never hits gimbal lock at the apogee
    const safeMinPhi = Math.max(this.minPolarAngle, 0.001)
    const cosSafePhi = Math.cos(safeMinPhi)
    const sinSafePhi = Math.sin(safeMinPhi)

    const wasEnabled = this.enabled
    this.enabled = false

    const animState = { t: 0 }
    const identityQuat = new Quat()
    const stepQuat = new Quat()
    const basisQuat = new Quat()

    this.#flyTween = gsap.to(animState, {
      t: 1,
      duration: resolvedDuration,
      ease,
      onUpdate: () => {
        const t = animState.t
        const arcWeight = Math.sin(t * Math.PI) // 0 -> 1 -> 0

        // Spherical rotation of target and up
        stepQuat.copy(identityQuat).slerp(fullRotation, t)

        const currentNormal = startNormal.clone().applyQuat(stepQuat).normalize()
        const currentTargetRadius = lerp(startTargetRadius, endTargetRadius, t)
        const currentTarget = currentNormal.multiplyScalar(currentTargetRadius).add(center)

        const currentUp = startUp.clone().applyQuat(stepQuat).normalize()

        // Interpolate local direction + flatten safely toward the apogee
        const currentLocalDir = localStartDir.clone().lerp(localEndDir, t).normalize()
        const currentFlattenBlend = flattenStrength * arcWeight

        if (currentFlattenBlend > 0.0001) {
          // Keep the current horizontal azimuth (x, z) for the zenith target
          // so the camera never twists sideways at the top of the arc
          const horizLen = Math.hypot(currentLocalDir.x, currentLocalDir.z)
          const dirX = horizLen > 0.0001 ? currentLocalDir.x / horizLen : 0
          const dirZ = horizLen > 0.0001 ? currentLocalDir.z / horizLen : 1

          const dynamicZenithDir = new Vec3(dirX * sinSafePhi, cosSafePhi, dirZ * sinSafePhi).normalize()

          currentLocalDir.lerp(dynamicZenithDir, currentFlattenBlend).normalize()
        }

        if (currentUp.y < -0.9999) {
          basisQuat.elements[0] = 1
          basisQuat.elements[1] = 0
          basisQuat.elements[2] = 0
          basisQuat.elements[3] = 0
        } else {
          basisQuat.setFromUnitVectors(WORLD_UP, currentUp)
        }

        const worldCamDir = currentLocalDir.applyQuat(basisQuat).normalize()

        // Zoom arc capped at `this.maxZoom`
        const baseOffsetLength = lerp(startCamOffsetLength, endCamOffsetLength, t)
        const extraZoomOut = Math.max(0, peakOffsetLength - baseOffsetLength)
        const currentOffsetLength = baseOffsetLength + extraZoomOut * arcWeight

        const currentPosition = currentTarget.clone().add(worldCamDir.multiplyScalar(currentOffsetLength))

        this.reset({
          position: currentPosition,
          target: currentTarget,
          up: currentUp,
        })
      },
      onComplete: () => {
        this.reset({
          position: newPosition.clone(),
          target: newTarget.clone(),
          up: endUp,
        })
        this.#flyTween = null
        this.enabled = wasEnabled
        onComplete?.()
      },
    })

    return this.#flyTween
  }

  /**
   * Remove event listeners.
   */
  destroy() {
    this.cancelFlyTo()
    this.element = null
  }
}
