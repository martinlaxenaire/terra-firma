import { TerraFirmaBaseOptions } from '../TerraFirma.js'
import { TilesProviders } from '../types/providers.js'
import { EARTH_RADIUS } from './constants.js'

export const defaultTilesProviders: TilesProviders = {
  elevation: {
    // https://developers.arcgis.com/documentation/tiled-elevation-service/
    // https://services.arcgisonline.com/ArcGIS/rest/services/WorldElevation3D/Terrain3D/ImageServer
    label: 'ArcGIS',
    type: 'lerc',
    encoding: 'terrarium',
    maxZoom: 16, // TODO
    density: 1,
    key: '',
    getTile: (tile) => {
      return `https://services.arcgisonline.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer/tile/${tile[2]}/${tile[1]}/${tile[0]}`
    },
  },
  satellite: {
    // https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer
    label: 'ArcGIS',
    type: 'image',
    maxZoom: 23,
    getTile: (tile) => {
      return `https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/${tile[2]}/${tile[1]}/${tile[0]}`
    },
  },
}

export const defaultTilesConfig: TerraFirmaBaseOptions = {
  providers: defaultTilesProviders,
  maxTileDefinition: 64,
  renderer: {
    hdrRendering: true,
    toneMapping: 'Khronos',
    colorSpace: 'srgb',
    lights: {
      maxAmbientLights: 1,
      maxDirectionalLights: 1,
      maxPointLights: 0,
      maxSpotLights: 0,
    },
  },
  controls: {
    minZoom: 200,
    maxZoom: EARTH_RADIUS * 2,
    zoomSpeed: 1,
    maxPolarAngle: Math.PI * 0.75,
    minPolarAngle: 0.01,
  },
  cameraOffset: {
    north: -4_000,
    west: 0,
    altitude: 2_000,
  },
  onIdle: () => {},
}
