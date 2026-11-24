import * as tilebelt from '@mapbox/tilebelt';
import type { ElevationProvider } from '../types/providers.js';
import type { GeographicCoordinates } from '../types/geographic.js';
import type { TileElevationMetadata } from '../caches/tiles-elevations-cache.js';
import { TileSource } from '../caches/tiles-sources-cache.js';
export declare const getTileKey: ([x, y, z]: tilebelt.Tile) => string;
export declare const getTileBBoxCenterCoords: (tileBBox?: number[]) => GeographicCoordinates;
export declare const getTileCenterCoords: (tile?: tilebelt.Tile) => GeographicCoordinates;
export declare const getAllChildren: (tile: tilebelt.Tile, maxZoom: number) => tilebelt.Tile[];
export declare const getParentTileAtZoom: (tile?: tilebelt.Tile, zoom?: number) => tilebelt.Tile;
export declare const getAltitudeFromRGBEncoding: ({ r, g, b }: {
    b?: number | undefined;
    g?: number | undefined;
    r?: number | undefined;
}, encoding?: ElevationProvider['encoding'] | undefined) => number;
export declare const getRGBFromAltitudeEncoding: (altitude?: number, encoding?: ElevationProvider['encoding'] | undefined) => {
    r: number;
    g: number;
    b: number;
};
export declare const analyzeElevationFromCanvas: (canvas: HTMLCanvasElement | OffscreenCanvas, context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, encoding: ElevationProvider['encoding'] | undefined) => {
    min: number;
    max: number;
    average: number;
};
export declare const analyzeElevationImage: (image: HTMLImageElement | ImageBitmap, encoding: ElevationProvider['encoding'] | undefined) => TileElevationMetadata;
export declare const analyzePointElevation: (source: TileSource, tileFraction: tilebelt.Tile, encoding: ElevationProvider['encoding'] | undefined) => number;
