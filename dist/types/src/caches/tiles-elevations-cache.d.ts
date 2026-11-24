import * as tilebelt from '@mapbox/tilebelt';
export interface TileElevationMetadata {
    min: number;
    max: number;
    average: number;
}
interface TileElevationAddOptions {
    tile: tilebelt.Tile;
    elevation: TileElevationMetadata | undefined;
}
export declare const tilesElevationsCache: {
    elevationSamples: Map<string, TileElevationMetadata>;
    getSource(tile?: tilebelt.Tile): TileElevationMetadata | undefined;
    addSource({ tile, elevation }: TileElevationAddOptions): void;
    clearCache(): void;
};
export {};
