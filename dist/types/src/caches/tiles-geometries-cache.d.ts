import { TileGeometry } from '../Tiles/TileGeometry.js';
export declare const tilesGeometriesCache: {
    geometries: Map<number, TileGeometry>;
    getGeometry(definition?: number): TileGeometry | undefined;
    addGeometry(definition?: number): TileGeometry;
    clearCache(): void;
};
