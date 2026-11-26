import * as tilebelt from '@mapbox/tilebelt'
import { ElevationProvider, SatelliteProvider } from '../src/types/providers.js'

// POSSIBLE SOURCES
// elevation
// https://registry.opendata.aws/copernicus-dem/
// https://gee-community-catalog.org/projects/aster/
// https://www.geodose.com/p/tile-plus-plugin.html
//

export interface TilesProviders {
  elevation: Record<string, ElevationProvider>
  satellite: Record<string, SatelliteProvider>
}

export const tilesProviders: TilesProviders = {
  elevation: {
    arcgis: {
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
    arcgisTopobathy: {
      // https://services.arcgisonline.com/arcgis/rest/services/WorldElevation3D/TopoBathy3D/ImageServer
      label: 'ArcGIS Topobathy',
      type: 'lerc',
      encoding: 'terrarium',
      maxZoom: 16, // TODO
      density: 1,
      key: '',
      getTile: (tile) => {
        return `https://services.arcgisonline.com/arcgis/rest/services/WorldElevation3D/TopoBathy3D/ImageServer/tile/${tile[2]}/${tile[1]}/${tile[0]}`
      },
    },
    amazon: {
      // https://www.mapzen.com/blog/long-term-support-mapzen-maps/#terrain-tiles
      // https://github.com/tilezen/joerd/blob/master/docs/use-service.md
      // https://github.com/tilezen/joerd/blob/master/docs/formats.md
      label: 'Mapzen',
      type: 'image',
      maxZoom: 15,
      density: 1,
      encoding: 'terrarium',
      key: '',
      getTile: (tile) => {
        return `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${tile[2]}/${tile[0]}/${tile[1]}.png`
      },
    },
    nextzen: {
      // https://www.mapzen.com/blog/long-term-support-mapzen-maps/#terrain-tiles
      // https://github.com/tilezen/joerd/blob/master/docs/formats.md
      label: 'Nextzen',
      type: 'image',
      maxZoom: 14, // TODO
      density: 1,
      encoding: 'terrarium',
      key: import.meta.env.VITE_NEXTZEN_KEY,
      getTile: (tile, key) => {
        // could be 256 or 512 for regular tiles
        // could also be 260 or 516 for seamless tiles (not working actually tho)
        const size = 256
        return `https://tile.nextzen.org/tilezen/terrain/v1/${size}/terrarium/${tile[2]}/${tile[0]}/${tile[1]}.png?api_key=${key}`
      },
    },
    mapboxRGB: {
      // https://docs.mapbox.com/data/tilesets/guides/access-elevation-data/
      // https://docs.mapbox.com/data/tilesets/reference/mapbox-terrain-rgb-v1/
      // TODO credits https://docs.mapbox.com/help/getting-started/attribution/
      label: 'Mapbox RGB',
      type: 'image',
      maxZoom: 14, // 512px tiles -> this means a maxZoom 15 for 256px tiles
      density: 2,
      encoding: 'dem',
      key: import.meta.env.VITE_MAPBOX_KEY,
      getTile: (tile, key) => {
        // to use 512px tiles, add '@2x' before '.pngraw'
        return `https://api.mapbox.com/v4/mapbox.terrain-rgb/${tile[2]}/${tile[0]}/${tile[1]}@2x.pngraw?access_token=${key}`
      },
    },
    mapboxDEM: {
      // https://docs.mapbox.com/data/tilesets/guides/access-elevation-data/
      // https://docs.mapbox.com/data/tilesets/reference/mapbox-terrain-dem-v1/
      // TODO credits https://docs.mapbox.com/help/getting-started/attribution/
      // credits: https://api.mapbox.com/v4/mapbox.mapbox-terrain-dem-v1.json?access_token=API_KEY
      label: 'Mapbox DEM',
      type: 'image',
      maxZoom: 14, // 512px tiles -> this means a maxZoom 15 for 256px tiles
      density: 2,
      encoding: 'dem',
      key: import.meta.env.VITE_MAPBOX_KEY,
      getTile: (tile, key) => {
        return `https://api.mapbox.com/v4/mapbox.mapbox-terrain-dem-v1/${tile[2]}/${tile[0]}/${tile[1]}@2x.pngraw?access_token=${key}`
      },
    },
    maptiler: {
      // https://cloud.maptiler.com/tiles/terrain-rgb-v2/
      label: 'Maptiler',
      type: 'image',
      maxZoom: 12, // 512px tiles -> this means a maxZoom 13 for 256px tiles
      density: 2,
      encoding: 'dem',
      key: import.meta.env.VITE_MAPTILER_KEY,
      getTile: (tile, key) => {
        return `https://api.maptiler.com/tiles/terrain-rgb-v2/${tile[2]}/${tile[0]}/${tile[1]}.webp?key=${key}`
      },
    },
    maptilerV1: {
      // https://cloud.maptiler.com/tiles/terrain-rgb/
      label: 'Maptiler V1',
      type: 'image',
      maxZoom: 12, // 512px tiles -> this means a maxZoom 13 for 256px tiles
      density: 2,
      encoding: 'dem',
      key: import.meta.env.VITE_MAPTILER_KEY,
      getTile: (tile, key) => {
        return `https://api.maptiler.com/tiles/terrain-rgb/${tile[2]}/${tile[0]}/${tile[1]}.png?key=${key}`
      },
    },
    nasa: {
      // https://nasa-gibs.github.io/gibs-api-docs/available-visualizations/
      // https://nasa-gibs.github.io/gibs-api-docs/map-library-usage/
      // https://cmr.earthdata.nasa.gov/search/concepts/C1000000240-LPDAAC_ECS.html
      // https://nasa-gibs.github.io/gibs-api-docs/access-advanced-topics/#tiled-access-resolutions
      // https://gibs.earthdata.nasa.gov/colormaps/v1.0/ASTER_GDEM_Color_Index.xml
      label: 'NASA',
      type: 'image',
      maxZoom: 12,
      density: 1,
      encoding: 'hypso', // CANT PROCESS THIS ENCODING FOR NOW
      //mercator: '4326',
      getTile: (tile) => {
        // const epsg = 4326
        const epsg = 3857 // or 4326
        const layer = 'ASTER_GDEM_Color_Index' // or 'SRTM_Color_Index'
        // const matrixSet = '31.25m' // with epsg 4326
        const matrixSet = 'GoogleMapsCompatible_Level12'

        return `https://gibs.earthdata.nasa.gov/wmts/epsg${epsg}/best/${layer}/default/${matrixSet}/${tile[2]}/${tile[1]}/${tile[0]}.png`
      },
    },
    /*ign: {
      // https://geoservices.ign.fr/documentation/services/api-et-services-ogc/images-tuilees-wmts-ogc
      // https://geoservices.ign.fr/services-web-experts-altimetrie
      label: 'IGN',
      type: 'image',
      maxZoom: 14,
      encoding: 'hypso',
      key: '',
      getTile: (tile, key) => {
        return `https://wxs.ign.fr/altimetrie/geoportail/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ELEVATION.SLOPES&TILEMATRIXSET=PM&TILEMATRIX=${tile[2]}&TILECOL=${tile[0]}&TILEROW=${tile[1]}&STYLE=normal&FORMAT=image/jpeg`
      },
    },*/
  },
  satellite: {
    arcgis: {
      // https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer
      label: 'ArcGIS',
      type: 'image',
      maxZoom: 23,
      key: '',
      getTile: (tile) => {
        return `https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/${tile[2]}/${tile[1]}/${tile[0]}`
      },
    },
    ign: {
      // https://geoservices.ign.fr/documentation/services/api-et-services-ogc/images-tuilees-wmts-ogc
      label: 'IGN',
      type: 'image',
      maxZoom: 19,
      key: '',
      getTile: (tile) => {
        return `https://data.geopf.fr/wmts?gp-ol-ext=1.0.0-beta.16-644&layer=ORTHOIMAGERY.ORTHOPHOTOS&style=normal&tilematrixset=PM_0_19&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fjpeg&TileMatrix=${tile[2]}&TILECOL=${tile[0]}&TILEROW=${tile[1]}`
        // return `https://wxs.ign.fr/essentiels/geoportail/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&TILEMATRIXSET=PM&TILEMATRIX=${tile[2]}&TILECOL=${tile[0]}&TILEROW=${tile[1]}&STYLE=normal&FORMAT=image/jpeg`
      },
    },
    google: {
      // https://www.geodose.com/p/tile-plus-plugin.html
      // https://qms.nextgis.com/geoservices/5637/
      label: 'Google',
      type: 'image',
      maxZoom: 19,
      key: '',
      getTile: (tile) => {
        return `https://www.google.com/maps/vt?lyrs=s&x=${tile[0]}&y=${tile[1]}&z=${tile[2]}`
      },
    },
    yandex: {
      // https://qms.nextgis.com/geoservices/5006/
      label: 'Yandex',
      type: 'image',
      maxZoom: 20,
      key: '',
      getTile: (tile) => {
        return `https://core-sat.maps.yandex.net/tiles?l=sat&v=3.1016.0&x=${tile[0]}&y=${tile[1]}&z=${tile[2]}`
      },
    },
    bing: {
      label: 'Bing',
      type: 'image',
      key: '',
      maxZoom: 20,
      getTile: (tile) => {
        const tileToQuadKey = ([x, y, z]: tilebelt.Tile) => {
          let quadkey = ''
          for (let i = z; i > 0; i--) {
            let digit = 0
            const mask = 1 << (i - 1)
            if ((x & mask) !== 0) digit += 1
            if ((y & mask) !== 0) digit += 2
            quadkey += digit.toString()
          }
          return quadkey
        }

        const quadkey = tileToQuadKey(tile)

        return `https://ecn.t0.tiles.virtualearth.net/tiles/a${quadkey}.jpeg?n=z&g=15648`
      },
    },
    eoxCloudless: {
      label: 'EOX Cloudless',
      type: 'image',
      key: '',
      maxZoom: 13,
      getTile: (tile) => {
        const year = 2025
        return `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-${year}_3857/default/GoogleMapsCompatible/${tile[2]}/${tile[1]}/${tile[0]}.jpg`
      },
    },
    usgs: {
      label: 'USGS',
      type: 'image',
      key: '',
      maxZoom: 8,
      getTile: (tile) => {
        return `https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/${tile[2]}/${tile[1]}/${tile[0]}`
      },
    },
    // cesiumIon: {
    //   label: 'Cesium ION',
    //   type: 'image',
    //   key: '',
    //   maxZoom: 20,
    //   getTile: (tile, key) => {
    //     return `https://assets.ion.cesium.com/us-east-1/asset_depot/3954/Sentinel-2/2021/${tile[2]}/${tile[1]}/${tile[0]}.jpg`
    //   },
    // },
    nasa: {
      // https://nasa-gibs.github.io/gibs-api-docs/available-visualizations/
      // https://nasa-gibs.github.io/gibs-api-docs/map-library-usage/
      // https://cmr.earthdata.nasa.gov/search/concepts/C1000000240-LPDAAC_ECS.html
      // https://nasa-gibs.github.io/gibs-api-docs/access-advanced-topics/#tiled-access-resolutions
      label: 'NASA',
      type: 'image',
      maxZoom: 8,
      // density: 1,
      // encoding: 'nasa',
      //mercator: '4326',
      getTile: (tile) => {
        // const epsg = 4326
        const epsg = 3857 // or 4326
        const layer = 'BlueMarble_NextGeneration'
        // const matrixSet = '500m' // with epsg 4326
        const matrixSet = 'GoogleMapsCompatible_Level8'

        return `https://gibs.earthdata.nasa.gov/wmts/epsg${epsg}/best/${layer}/default/${matrixSet}/${tile[2]}/${tile[1]}/${tile[0]}.jpeg`
      },
    },
    mapQuest: {
      // https://nickvsnetworking.com/forsk-atoll-wms-map-tiles/
      label: 'Map Quest',
      type: 'image',
      maxZoom: 20,
      key: '',
      getTile: (tile) => {
        return `https://a.tiles.mapquest.com/render/latest/satellite/${tile[2]}/${tile[0]}/${tile[1]}/256@2x/png`
      },
    },
    /*alos: {
      label: 'ALOS',
      type: 'image',
      maxZoom: 15,
      key: '',
      getTile: (tile, key) => {
        return `https://www.eorc.jaxa.jp/ALOS/aw3d30/MapTiles/ver.3.2/${tile[2]}/${tile[0]}/${tile[1]}.png`
      }
    },*/
    mapbox: {
      // https://docs.mapbox.com/data/tilesets/reference/mapbox-satellite/
      label: 'Mapbox',
      type: 'image',
      maxZoom: 17, // TODO
      key: import.meta.env.VITE_MAPBOX_KEY,
      getTile: (tile, key) => {
        return `https://api.mapbox.com/v4/mapbox.satellite/${tile[2]}/${tile[0]}/${tile[1]}@2x.jpg90?access_token=${key}`
      },
    },
    maptiler: {
      // https://cloud.maptiler.com/tiles/satellite-v2/
      label: 'Maptiler',
      type: 'image',
      maxZoom: 20, // TODO
      key: import.meta.env.VITE_MAPTILER_KEY,
      getTile: (tile, key) => {
        return `https://api.maptiler.com/tiles/satellite-v2/${tile[2]}/${tile[0]}/${tile[1]}.jpg?key=${key}`
      },
    },
  },
}
