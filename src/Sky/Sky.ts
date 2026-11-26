import { FullscreenPlane, GPUCameraRenderer, Mat4, MediaTexture, Vec3, sRGBToLinear } from 'gpu-curtains'
import { EARTH_RADIUS } from '../config/constants.js'
import { skyFs } from '../shaders/sky.js'
import TerraFirma from '../TerraFirma.js'

export class Sky {
  terraFirma: TerraFirma
  renderer: GPUCameraRenderer
  camera: GPUCameraRenderer['camera']

  mesh: FullscreenPlane

  constructor(terraFirma: TerraFirma) {
    this.terraFirma = terraFirma
    this.renderer = this.terraFirma.renderer
    this.camera = this.terraFirma.camera

    const starsMap = new MediaTexture(this.renderer, {
      label: 'Stars map',
      name: 'starsMap',
      format: 'rgba8unorm-srgb',
    })

    // https://svs.gsfc.nasa.gov/3572/
    // https://svs.gsfc.nasa.gov/4851/
    starsMap.loadImage('/images/TychoSkymapII.t3_04096x02048.jpg')

    this.mesh = new FullscreenPlane(this.renderer, {
      depth: false,
      depthCompare: 'greater-equal', // because of reversed depth
      bindings: [this.renderer.bindings.camera, this.terraFirma.bindings.globe, this.terraFirma.bindings.colors],
      textures: [starsMap],
      uniforms: {
        params: {
          struct: {
            viewSamples: {
              type: 'u32',
              value: 8,
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
