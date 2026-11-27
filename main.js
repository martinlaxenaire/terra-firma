import GUI from 'lil-gui'
import TerraFirma from './src/TerraFirma'
import { POIs, DEFAULT_POI } from './config/poi'
import { tilesProviders } from './config/tiles-providers'
import { TubeGeometry } from './src/geometries/TubeGeometry'
import { SphereGeometry, Vec3 } from 'gpu-curtains'
import { everestConfig } from './config/everest-config'

window.addEventListener('load', async () => {
  const terraFirma = new TerraFirma({
    container: '#canvas',
    // useWorkers: true,
    poi: POIs[DEFAULT_POI],
    // poi: everestConfig.camps[2].point,
    // poi: {
    //   latitude: 0,
    //   longitude: 0,
    // },
    // poi: {
    //   latitude: -31.5372,
    //   longitude: -68.5253,
    // },
    // cameraOffset: {
    //   north: 0,
    //   altitude: 10_000_000,
    // },
    // currentDate: new  Date('2026-06-21T12:00:00'),
    // renderer: {
    //   lights: false,
    // },
    // cameraOffset: { north: 2_500, west: 9_000, altitude: 1_500 },
  })

  await terraFirma.init()

  const pathToEverestMeshes = []
  const sphereGeometry = new SphereGeometry()

  everestConfig.camps.forEach((camp) => {
    const campMesh = terraFirma.addLitMesh({
      label: camp.label,
      geometry: sphereGeometry,
      material: {
        color: new Vec3(1, 0, 0),
        shading: 'Unlit',
      },
    })

    campMesh.scale.set(everestConfig.campsScale)
    campMesh.position.copy(camp.position)

    pathToEverestMeshes.push(campMesh)
  })

  everestConfig.paths.forEach((path, index) => {
    const pathGeometry = new TubeGeometry({
      points: [everestConfig.camps[index].position, ...path.positions, everestConfig.camps[index + 1].position],
      radius: everestConfig.pathRadius,
    })

    const pathMesh = terraFirma.addLitMesh({
      label: path.label,
      geometry: pathGeometry,
      material: {
        color: new Vec3(1, 0, 0),
        shading: 'Unlit',
      },
    })

    pathToEverestMeshes.push(pathMesh)

    // degug paths positions
    path.positions.forEach((position) => {
      const debugMesh = terraFirma.addLitMesh({
        geometry: sphereGeometry,
        material: {
          color: new Vec3(0, 1, 0),
          shading: 'Unlit',
        },
      })

      debugMesh.scale.set(everestConfig.pathRadius * 1.25)
      debugMesh.position.copy(position)

      pathToEverestMeshes.push(debugMesh)
    })
  })

  // const testPoints = [
  //   {
  //     latitude: 27.987994,
  //     longitude: 86.925043,
  //   },
  // ]
  // const testPathPoints = Promise.all(testPoints.map((point) => terraFirma.getPoint3DPosition(point))).then((points) => {
  //   points.forEach((point) => console.log(`new Vec3(${point.x}, ${point.y}, ${point.z}),`))
  // })

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
    .add({ showPathToEverest: true }, 'showPathToEverest')
    .onChange((value) => {
      pathToEverestMeshes.forEach((mesh) => (mesh.visible = value))
    })
    .name('Show Everest route')

  const dayCycleFolder = mapFolder.addFolder('Day/night')

  dayCycleFolder
    .add({ useSunLight: terraFirma.config.useSunLight }, 'useSunLight')
    .onChange((value) => {
      terraFirma.useSunLight(value)
    })
    .name('Use sunlight')

  dayCycleFolder
    .add({ useSunShadows: terraFirma.config.useSunShadows }, 'useSunShadows')
    .onChange((value) => {
      terraFirma.useSunShadows(value)
    })
    .name('Use sun shadows')

  dayCycleFolder
    .add({ hourOffset: 0 }, 'hourOffset', -12, 12, 0.01)
    .onChange((value) => {
      const now = new Date()
      const newDate = new Date(now.getTime() + value * 60 * 60 * 1000)
      terraFirma.setCurrentDate(newDate)
    })
    .name('Hour offset')

  const skyFolder = mapFolder.addFolder('Sky')

  skyFolder
    .add({ useSky: terraFirma.config.useSky }, 'useSky')
    .onChange((value) => {
      terraFirma.useSky(value)
    })
    .name('Display sky')

  skyFolder.add(terraFirma.sky.mesh.uniforms.params.viewSamples, 'value', 2, 20, 1).name('View samples')

  const fogFolder = mapFolder.addFolder('Fog')

  fogFolder
    .add({ useFog: terraFirma.config.useFog }, 'useFog')
    .onChange((value) => {
      terraFirma.useFog(value)
    })
    .name('Use fog')

  fogFolder
    .add({ dayIntensity: terraFirma.config.fog.dayIntensity }, 'dayIntensity', 0, 2, 0.05)
    .onChange((value) => {
      terraFirma.setFogIntensity({ dayIntensity: value })
    })
    .name('Day intensity')

  fogFolder
    .add({ nightIntensity: terraFirma.config.fog.nightIntensity }, 'nightIntensity', 0, 2, 0.05)
    .onChange((value) => {
      terraFirma.setFogIntensity({ nightIntensity: value })
    })
    .name('Night intensity')

  const camFolder = gui.addFolder('Camera')
  camFolder.add(terraFirma.camera, 'fov', 20, 100, 1).onChange((value) => {
    if (terraFirma.camera) {
      terraFirma.camera.fov = value
    }
  })

  const debugFolder = gui.addFolder('Debug')
  debugFolder.close()

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
