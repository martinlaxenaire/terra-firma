import { FullscreenPlane, GPUCameraRenderer, Mat4, MediaTexture, Vec3 } from 'gpu-curtains'
import { EARTH_RADIUS } from '../config/constants.js'
import { skyFs } from '../shaders/sky.js'

export class Sky {
  renderer: GPUCameraRenderer
  camera: GPUCameraRenderer['camera']

  sunPosition: Vec3
  mesh: FullscreenPlane

  constructor({
    renderer,
    camera,
    sunPosition = new Vec3(),
  }: {
    renderer: GPUCameraRenderer
    camera: GPUCameraRenderer['camera']
    sunPosition?: Vec3
  }) {
    this.renderer = renderer
    this.camera = camera
    this.sunPosition = sunPosition

    const starsMap = new MediaTexture(this.renderer, {
      label: 'Stars map',
      name: 'starsMap',
    })

    // https://svs.gsfc.nasa.gov/3572/
    // https://svs.gsfc.nasa.gov/4851/
    starsMap.loadImage('/images/TychoSkymapII.t3_04096x02048.jpg')

    this.mesh = new FullscreenPlane(this.renderer, {
      depth: false,
      depthCompare: 'greater-equal', // because of reversed depth
      bindings: [this.renderer.bindings.camera],
      textures: [starsMap],
      uniforms: {
        params: {
          struct: {
            viewSamples: {
              type: 'u32',
              value: 16,
            },
          },
        },
        globe: {
          struct: {
            earthRadius: {
              type: 'f32',
              value: EARTH_RADIUS,
            },
            sunPosition: {
              type: 'vec3f',
              value: this.sunPosition,
            },
          },
        },
        projection: {
          struct: {
            inverseViewProjectionMatrix: {
              type: 'mat4x4f',
              value: new Mat4().multiplyMatrices(this.camera.projectionMatrix, this.camera.viewMatrix).invert(),
            },
          },
        },
      },
      shaders: {
        fragment: {
          code: skyFs,
        },
      },
    })
  }

  updateCameraProjection() {
    if (this.mesh) {
      ;(this.mesh.uniforms.projection.inverseViewProjectionMatrix.value as Mat4)
        .multiplyMatrices(this.camera.projectionMatrix, this.camera.viewMatrix)
        .invert()

      // explicitly tell the uniform to update
      this.mesh.uniforms.projection.inverseViewProjectionMatrix.shouldUpdate = true
    }
  }

  destroy() {
    this.mesh?.remove()
  }
}
