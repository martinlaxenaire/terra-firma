import * as tilebelt from '@mapbox/tilebelt';
import { Sampler, Object3D, Raycaster } from 'gpu-curtains';
import type { TilesProviders } from '../types/providers.js';
import type { TileElevationMetadata } from '../caches/tiles-elevations-cache.js';
import { GlobeCameraVisibility, GlobeCameraVisibilityBaseOptions } from '../GlobeCameraVisibility/GlobeCameraVisibility.js';
import { GlobeLOD, GlobeLODBaseOptions } from '../GlobeLOD/GlobeLOD.js';
import MapTilesManager from '../MapTilesManager/MapTilesManager.js';
import TerraFirma from '../TerraFirma.js';
import { GeographicCoordinates } from '../types/geographic.js';
import ElevationTileTexture from '../TileTextures/ElevationTileTexture.js';
import SatelliteTileTexture from '../TileTextures/SatelliteTileTexture.js';
export interface POI extends GeographicCoordinates {
    name?: string;
}
export interface TilesManagerBaseConfig {
    providers: TilesProviders;
    minTileDefinition?: number;
    lod?: GlobeLODBaseOptions;
    cameraVisibility?: GlobeCameraVisibilityBaseOptions;
}
export interface TilesManagerBaseOptions {
    useSunLight?: boolean;
    useSunShadows?: boolean;
    useFog?: boolean;
    useWorkers?: boolean;
    poi: POI;
    providers: TilesProviders;
    parent: Object3D;
    onPOIAltitude: (altitude: number) => void;
    onCameraUpdate: (altitude: number) => void;
    onMapComplete?: () => void;
    onIdle?: () => void;
}
export interface TilesManagerOptions extends NonNullable<TilesManagerBaseConfig>, TilesManagerBaseOptions {
}
interface TilesManagerState {
    isIdling: boolean;
    sunLight: boolean;
    sunShadows: boolean;
    fog: boolean;
    debugZoom: boolean;
    debugElevation: boolean;
    ready: boolean;
    paused: boolean;
}
export default class TilesManager {
    terraFirma: TerraFirma;
    renderer: TerraFirma['renderer'];
    options: NonNullable<TilesManagerOptions>;
    state: TilesManagerState;
    parent: Object3D;
    tilesGroup: Object3D;
    raycaster: Raycaster;
    providers: TilesProviders;
    zooms: {
        max: {
            elevation: number;
            satellite: number;
        };
    };
    poi: POI;
    mapTilesManager: MapTilesManager;
    globeLOD: GlobeLOD;
    globeCameraVisibility: GlobeCameraVisibility;
    elevationTileTextures: Map<string, ElevationTileTexture>;
    satelliteTileTextures: Map<string, SatelliteTileTexture>;
    elevationSampler: Sampler;
    satelliteSampler: Sampler;
    constructor(terraFirma: TerraFirma, options?: TilesManagerOptions);
    setPOI(poi: POI): void;
    init(): void;
    setMaxZooms(): void;
    getDefinitionAtZoomLevel(zoom?: number): number;
    setSceneRenderingObjects(): void;
    setGlobeLOD(): void;
    getCurrentTargetElevation(): number | undefined;
    onElevationMetadataAvailable(tile: tilebelt.Tile, metadata: TileElevationMetadata): void;
    setGlobeCameraVisibility(): void;
    getCurrentProvider<T extends keyof TilesProviders>(type: T): TilesProviders[T];
    updateProvider<T extends keyof TilesProviders>(type: T, provider: TilesProviders[T]): Promise<void>;
    getPointAltitude(point?: GeographicCoordinates, exactAltitude?: boolean): Promise<number>;
    setFog(useFog?: boolean): void;
    setSunLight(sunLight?: boolean): void;
    setSunShadows(sunShadows?: boolean): void;
    setDebugZoom(debugZoom?: boolean): void;
    setDebugElevation(debugElevation?: boolean): void;
    onIdle(): void;
    update(): void;
    cleanScene(): void;
    destroy(): void;
}
export {};
