import * as tilebelt from '@mapbox/tilebelt';
import type { ElevationProvider } from '../types/providers.js';
import { MediaTexture } from 'gpu-curtains';
import TilesManager from '../TilesManager/TilesManager.js';
import { GeographicCoordinates } from '../types/geographic.js';
export interface ElevationTileTextureOptions {
    tilesManager: TilesManager;
    provider?: ElevationProvider;
    tile?: tilebelt.Tile;
    onTextureReady?: () => void;
}
export default class ElevationTileTexture {
    type: 'elevation';
    tilesManager: TilesManager;
    renderer: TilesManager['renderer'];
    tile: tilebelt.Tile;
    provider: ElevationProvider;
    zoom: number;
    tilesCoverageSet: Set<string>;
    ready: boolean;
    onTextureReady: () => void;
    tileBBox: number[];
    size: {
        x: number;
        y: number;
    };
    tileCenter: GeographicCoordinates;
    texture: MediaTexture | undefined;
    constructor({ tilesManager, provider, tile, onTextureReady, }: ElevationTileTextureOptions);
    setProvider(provider: ElevationProvider): void;
    setTile(): void;
    addTileCoverage(tile: tilebelt.Tile): void;
    removeTileCoverage(tile: tilebelt.Tile): void;
    createTexture(): void;
    setElevationTexture(): Promise<void>;
    setTexture(): void;
    destroy({ removeFromTilesManager, force }?: {
        force?: boolean | undefined;
        removeFromTilesManager?: boolean | undefined;
    }): void;
}
