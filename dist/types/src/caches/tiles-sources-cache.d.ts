import { TileCacheBase, TileGetOptions, TileType } from '../types/caches.js';
export type TileSource = ImageBitmap | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas;
interface TileSourceCache extends TileCacheBase {
    source: TileSource;
    url: string;
}
interface TileSourceAddOptions extends TileGetOptions {
    source: TileSource;
    url: string;
}
export declare const tilesSourcesCache: {
    elevation: Map<string, TileSourceCache>;
    satellite: Map<string, TileSourceCache>;
    maxLength: number;
    getKey({ tile, type, provider }: TileGetOptions): string;
    getSource({ tile, type, provider }: TileGetOptions): TileSourceCache | undefined;
    addSource({ tile, type, provider, source, url }: TileSourceAddOptions): void;
    removeSourceByIndex({ type, index }: {
        type?: TileType;
        index?: number;
    }): void;
    removeSourceByTile({ type, tile, provider }: TileGetOptions): void;
    clearCache({ type }: {
        type?: TileType;
    }): void;
    clearAllCaches(): void;
};
export {};
