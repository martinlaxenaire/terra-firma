import * as tilebelt from '@mapbox/tilebelt';
import { TileSource } from '../caches/tiles-sources-cache.js';
import { ElevationProvider, SatelliteProvider } from '../types/providers.js';
import { TileElevationMetadata } from '../caches/tiles-elevations-cache.js';
import { TileType } from '../types/caches.js';
import type { MediaTexture } from 'gpu-curtains';
import { LercWorkerPool } from '../WorkerPool/LercWorkerPool.js';
export type FetchTileResponse = {
    source: ImageBitmap | HTMLImageElement | ArrayBuffer;
    valid: boolean;
};
export interface FetchTileOptions {
    url: string;
    type: ElevationProvider['type'];
    encoding?: ElevationProvider['encoding'];
}
export interface GetRasterTileOptions {
    tile: tilebelt.Tile;
    tileType: TileType;
    provider: ElevationProvider | SatelliteProvider;
    useWorkers?: boolean;
}
export interface GetRasterTile {
    source: TileSource;
    metadata: TileElevationMetadata | undefined;
    valid: boolean;
}
export interface SetTileTextureOptions extends GetRasterTileOptions {
    texture: MediaTexture;
}
export declare const tilesAPI: {
    supportOffscreenCanvas: boolean;
    lercPool: LercWorkerPool;
    createEmptyImageData(size: number | undefined, encoding: ElevationProvider['encoding'] | undefined): ImageData;
    createEmptyTile(size: number | undefined, encoding: ElevationProvider['encoding'] | undefined): Promise<ImageBitmap>;
    processLercRasterTile(rasterTile: ArrayBuffer): Promise<{
        source: ImageData;
        valid: boolean;
    }>;
    fetchTile({ url, type, encoding }: FetchTileOptions): Promise<FetchTileResponse>;
    fetchTileFromWorker({ url, type, encoding, }: FetchTileOptions): Promise<FetchTileResponse>;
    getRasterTile({ tile, tileType, provider, useWorkers, }: GetRasterTileOptions): Promise<GetRasterTile | undefined>;
    setTileTexture({ texture, tile, tileType, provider, useWorkers, }: SetTileTextureOptions): Promise<GetRasterTile | undefined>;
    destroy(): void;
};
