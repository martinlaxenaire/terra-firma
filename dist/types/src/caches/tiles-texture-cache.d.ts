import SatelliteTileTexture from '../TileTextures/SatelliteTileTexture.js';
import ElevationTileTexture from '../TileTextures/ElevationTileTexture.js';
import { TileCacheBase, TileGetOptions, TileType } from '../types/caches.js';
type TileTexture = SatelliteTileTexture | ElevationTileTexture;
interface TileTextureCache extends TileCacheBase {
    texture: TileTexture;
}
interface TileTextureAddOptions extends TileGetOptions {
    texture: TileTexture;
}
declare function getTexture(options: TileGetOptions & {
    type?: 'elevation';
}): ElevationTileTexture | undefined;
declare function getTexture(options: TileGetOptions & {
    type: 'satellite';
}): SatelliteTileTexture | undefined;
export declare const tilesTextureCache: {
    elevation: Map<string, TileTextureCache>;
    satellite: Map<string, TileTextureCache>;
    maxLength: number;
    getKey({ tile, type, provider }: TileGetOptions): string;
    getTexture: typeof getTexture;
    addTexture({ tile, type, provider, texture }: TileTextureAddOptions): void;
    removeTextureByIndex({ type, index }: {
        type?: TileType;
        index?: number;
    }): void;
    removeTextureByTile({ type, tile, provider }: TileGetOptions): void;
    clearCache({ type }: {
        type?: TileType;
    }): void;
    clearAllCaches(): void;
};
export {};
