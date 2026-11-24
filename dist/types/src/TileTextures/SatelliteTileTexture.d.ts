import * as tilebelt from '@mapbox/tilebelt';
import type { SatelliteProvider } from '../types/providers.js';
import { MediaTexture } from 'gpu-curtains';
import TilesManager from '../TilesManager/TilesManager.js';
export interface SatelliteTileTextureOptions {
    tilesManager: TilesManager;
    provider?: SatelliteProvider;
    tile?: tilebelt.Tile;
    onTextureReady?: () => void;
}
export default class SatelliteTileTexture {
    type: 'satellite';
    tilesManager: TilesManager;
    renderer: TilesManager['renderer'];
    tile: tilebelt.Tile;
    provider: SatelliteProvider;
    zoom: number;
    ready: boolean;
    onTextureReady: () => void;
    texture: MediaTexture | undefined;
    constructor({ tilesManager, provider, tile, onTextureReady, }: SatelliteTileTextureOptions);
    setProvider(provider: SatelliteProvider): void;
    createTexture(): void;
    setTexture(): void;
    destroy({ removeFromTilesManager }?: {
        removeFromTilesManager?: boolean | undefined;
    }): void;
}
