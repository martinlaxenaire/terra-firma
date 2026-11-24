import GUI from 'lil-gui'
import TerraFirma from './src/TerraFirma'
import { POIs, DEFAULT_POI } from './config/poi'
import { tilesProviders } from './config/tiles-providers'
import { Mesh, LitMesh, SphereGeometry, Vec3 } from 'gpu-curtains'

window.addEventListener('load', async () => {
  const terraFirma = new TerraFirma({
    container: '#canvas',
    // useWorkers: true,
    poi: POIs[DEFAULT_POI],
    // poi: {
    //   latitude: 0,
    //   longitude: 0,
    // },
    // poi: {
    //   latitude: 35.68,
    //   longitude: 139.69,
    // },
    // cameraOffset: {
    //   north: 0,
    //   altitude: 10_000_000,
    // },
    // currentDate: new Date('2026-06-21T12:00:00'),
    // renderer: {
    //   lights: false,
    // },
  })

  await terraFirma.init()

  const everestBaseCamp = await terraFirma.getPoint3DPosition({
    latitude: 28.0072,
    longitude: 86.8594,
  })

  const sphere = new LitMesh(terraFirma.renderer, {
    geometry: new SphereGeometry(),
    depthCompare: 'greater',
    material: {
      color: new Vec3(1, 0, 0),
      shading: 'Unlit',
    },
  })

  sphere.scale.set(200)
  sphere.position.copy(everestBaseCamp)

  terraFirma.setCamera({
    target: everestBaseCamp,
  })

  const gui = new GUI()
  //gui.close()

  const mapFolder = gui.addFolder('Map')
  mapFolder
    .add(
      { poi: DEFAULT_POI },
      'poi',
      Object.keys(POIs).reduce((obj, poi) => ({ ...obj, [POIs[poi].name]: poi }), {}),
    )
    .onChange((value) => {
      terraFirma.updatePOI(POIs[value], true)
    })
    .name('POI')

  mapFolder
    .add({ useSunLight: true }, 'useSunLight')
    .onChange((value) => {
      terraFirma.useSunLight(value)
    })
    .name('Use sunlight')

  mapFolder
    .add({ useSunShadows: true }, 'useSunShadows')
    .onChange((value) => {
      terraFirma.useSunShadows(value)
    })
    .name('Use sun shadows')

  const skyFolder = mapFolder.addFolder('Sky')

  skyFolder
    .add({ useSky: true }, 'useSky')
    .onChange((value) => {
      terraFirma.useSky(value)
    })
    .name('Display sky')

  skyFolder.add(terraFirma.sky.mesh.uniforms.params.viewSamples, 'value', 8, 32, 1).name('View samples')

  mapFolder
    .add({ useFog: false }, 'useFog')
    .onChange((value) => {
      terraFirma.useFog(value)
    })
    .name('Use fog')

  const camFolder = gui.addFolder('Camera')
  camFolder.add(terraFirma.camera, 'fov', 20, 100, 1).onChange((value) => {
    if (terraFirma.camera) {
      terraFirma.camera.fov = value
    }
  })

  const debugFolder = gui.addFolder('Debug')

  debugFolder
    .add({ debugZoom: false }, 'debugZoom')
    .onChange((value) => {
      if (terraFirma.tilesManager) {
        terraFirma.tilesManager.setDebugZoom(value)
      }
    })
    .name('Display zoom levels')

  debugFolder
    .add({ debugElevation: false }, 'debugElevation')
    .onChange((value) => {
      if (terraFirma.tilesManager) {
        terraFirma.tilesManager.setDebugElevation(value)
      }
    })
    .name('Display elevation')

  const tMFolder = gui.addFolder('Tiles manager')

  tMFolder
    .add(
      {
        elevation: Object.values(tilesProviders.elevation).find(
          (provider) => provider.label === terraFirma.config.providers.elevation.label,
        ).label,
      },
      'elevation',
      Object.keys(tilesProviders.elevation).reduce(
        (obj, provider) => ({ ...obj, [tilesProviders.elevation[provider].label]: provider }),
        {},
      ),
    )
    .onChange((value) => {
      if (terraFirma.tilesManager) terraFirma.updateProvider('elevation', tilesProviders.elevation[value])
    })

  tMFolder
    .add(
      {
        satellite: Object.values(tilesProviders.satellite).find(
          (provider) => provider.label === terraFirma.config.providers.satellite.label,
        ).label,
      },
      'satellite',
      Object.keys(tilesProviders.satellite).reduce(
        (obj, provider) => ({ ...obj, [tilesProviders.satellite[provider].label]: provider }),
        {},
      ),
    )
    .onChange((value) => {
      if (terraFirma.tilesManager) terraFirma.updateProvider('satellite', tilesProviders.satellite[value])
    })
})
