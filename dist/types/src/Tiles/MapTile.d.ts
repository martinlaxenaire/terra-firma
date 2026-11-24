import * as tilebelt from '@mapbox/tilebelt';
import ElevationTileTexture from '../TileTextures/ElevationTileTexture.js';
import SatelliteTileTexture from '../TileTextures/SatelliteTileTexture.js';
import TileMesh from './TileMesh.js';
import TilesManager from '../TilesManager/TilesManager.js';
import { GeographicCoordinates, XYZCoordinates } from '../types/geographic.js';
export interface MapTileOptions {
    tilesManager: TilesManager;
    tile?: tilebelt.Tile;
    screenSpaceError?: number;
    onTileReady?: () => void;
}
export default class MapTile {
    tilesManager: TilesManager;
    renderer: TilesManager['renderer'];
    zoom: number;
    tile: tilebelt.Tile;
    screenSpaceError: number;
    ready: boolean;
    desiredVisible: boolean;
    visible: boolean;
    onTileReady: () => void;
    center: GeographicCoordinates;
    centerWorld: XYZCoordinates;
    elevationTileTexture: ElevationTileTexture | undefined;
    satelliteTileTexture: SatelliteTileTexture | undefined;
    tileMesh: TileMesh | undefined;
    constructor({ tilesManager, tile, screenSpaceError, onTileReady }: MapTileOptions);
    setTile(): void;
    setVisible(visible: boolean): void;
    updateVisibility(): void;
    setElevationTexture(): void;
    resetElevationTextureZoomLevel(): void;
    setSatelliteTexture(): void;
    setTileMesh(): void;
    onTileReadyCheck(): void;
    updateElevationTexture(): void;
    updateSatelliteTexture(): void;
    destroy(): void;
}
