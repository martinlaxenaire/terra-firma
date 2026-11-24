import { TileGeometry } from '../Tiles/TileGeometry.js'

export const tilesGeometriesCache = {
  geometries: new Map<number, TileGeometry>(),

  getGeometry(definition = 1): TileGeometry | undefined {
    const geometry = this.geometries.get(definition)

    if (geometry) {
      return geometry
    } else {
      return this.addGeometry(definition)
    }
  },

  addGeometry(definition = 1) {
    const geometry = new TileGeometry({ widthSegments: definition, heightSegments: definition })

    this.geometries.set(definition, geometry)

    return geometry
  },

  clearCache() {
    this.geometries.clear()
  },
}
