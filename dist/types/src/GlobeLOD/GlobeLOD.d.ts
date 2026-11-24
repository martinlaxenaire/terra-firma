import * as tilebelt from '@mapbox/tilebelt';
import { Raycaster, Vec3 } from 'gpu-curtains';
import type { GlobeVisibilityResult } from '../GlobeCameraVisibility/GlobeCameraVisibility.js';
import type { TileElevationMetadata } from '../caches/tiles-elevations-cache.js';
export interface GlobeTileBounds {
    west: number;
    south: number;
    east: number;
    north: number;
}
export interface GlobeTile {
    x: number;
    y: number;
    z: number;
    bounds: GlobeTileBounds;
    boundingCenter: Vec3;
    boundingRadius: number;
    terrainBoundingCenter: Vec3;
    terrainBoundingRadius: number;
    terrainMetadata?: TileElevationMetadata;
    screenSpaceError: number;
}
export interface GlobeLODStats {
    visibleTileCount: number;
    tilesByZoom: Record<number, number>;
    visited: number;
    frustumRejected: number;
    horizonRejected: number;
    subdivided: number;
    selected: number;
    maxZoomReached: number;
}
export interface GlobeLODBaseOptions {
    cullingSpherePadding?: number;
    terrainSpherePadding?: number;
    minElevation?: number;
    maxElevation?: number;
    maxScreenSpaceError?: number;
}
interface GlobeLODInternalOptions {
    maxZoom?: number;
    getMaxZooms?: (tile: tilebelt.Tile) => {
        elevation: number;
        satellite: number;
    };
    getMeshDefinition?: (zoom: number) => number;
    onUpdate?: (tiles: GlobeTile[], stats: GlobeLODStats) => void;
}
export interface GlobeLODOptions extends GlobeLODBaseOptions, GlobeLODInternalOptions {
}
export declare class GlobeLOD {
    #private;
    private readonly earthRadius;
    private readonly cullingSpherePadding;
    private readonly terrainSpherePadding;
    private minElevation;
    private maxElevation;
    maxZoom: number;
    private readonly maxTraversalNodes;
    private readonly maxScreenSpaceError;
    private readonly tileSize;
    private readonly tileCache;
    private readonly terrainMetadataCache;
    visibleTiles: GlobeTile[];
    private stats;
    private readonly getMaxZooms;
    private readonly getMeshDefinition;
    private readonly onUpdate?;
    private needsUpdate;
    private lastVisibility?;
    private previousVisibleSSE;
    constructor({ cullingSpherePadding, terrainSpherePadding, minElevation, maxElevation, maxZoom, maxScreenSpaceError, getMaxZooms, getMeshDefinition, onUpdate, }: GlobeLODOptions);
    get isIdling(): boolean;
    get cacheSize(): number;
    get metadataCacheSize(): number;
    get isDirty(): boolean;
    private getTile;
    private getParentMetadata;
    /**
     * Called when an elevation tile has finished loading and
     * its metadata has been calculated.
     *
     * Does not invalidate MapTilesManager or trigger an immediate
     * traversal. The next update() incorporates the new metadata.
     */
    onElevationMetadataAvailable(coordinates: tilebelt.Tile, metadata: TileElevationMetadata): void;
    /**
     * Change conservative global elevation limits.
     * Existing tile bounds are rebuilt to reflect the new limits.
     */
    setMaxElevation(maxElevation: number): void;
    setMinElevation(minElevation: number): void;
    private rebuildTileBounds;
    /**
     * Calculate the closest distance from the camera to the
     * terrain represented by this tile.
     */
    private getDistanceToTile;
    private getScreenSpaceError;
    /**
     * Create a tile with:
     * - A conservative culling sphere using global elevation limits.
     * - A terrain sphere using actual metadata when available.
     */
    private createTile;
    private calculateBoundingSphere;
    /**
     * Conservative culling bounds always use global elevation limits.
     * They never shrink just because local metadata is unavailable.
     */
    private updateCullingBoundingSphere;
    /**
     * Terrain bounds use local min/max if available.
     * Otherwise they fall back to the conservative global range.
     */
    private updateTerrainBoundingSphere;
    getStats(): GlobeLODStats;
    private traverse;
    getClosestTileToTarget(cameraPosition: Vec3, target: Vec3, visibleTiles?: GlobeTile[]): GlobeTile | undefined;
    getClosestTileToTargetFromRay(ray: Raycaster['ray'], visibleTiles?: GlobeTile[]): GlobeTile | undefined;
    getClosestTileFromCamera(cameraPosition: Vec3, visibleTiles?: GlobeTile[]): GlobeTile | undefined;
    /**
     * Recalculate visible tiles.
     *
     * Call this from your normal camera/render update loop.
     * Metadata updates are incorporated here automatically.
     */
    update(visibility?: GlobeVisibilityResult | undefined): GlobeTile[];
    /**
     * Run update if needed.
     */
    render(): void;
    /**
     * Detect changes to visible tile keys or their SSE priorities.
     * Priority changes matter because MapTilesManager uses SSE
     * to prioritize loading.
     */
    private hasVisibleTilesChanged;
    get result(): GlobeTile[];
    private intersectsFrustum;
    /**
     * Convert longitude/latitude to ECEF.
     *
     * Coordinate convention:
     * - Y points north
     * - longitude 0° is +Z
     * - longitude 90° east is +X
     */
    private lonLatToECEF;
    private isBehindHorizon;
    destroy(): void;
}
export {};
