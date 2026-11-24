import MapTile from '../Tiles/MapTile.js';
import type TilesManager from '../TilesManager/TilesManager.js';
import { GlobeTile } from '../GlobeLOD/GlobeLOD.js';
interface MapTilesManagerOptions {
    tilesManager: TilesManager;
}
export default class MapTilesManager {
    private readonly tilesManager;
    private active;
    readonly mapTiles: Map<string, MapTile>;
    private readonly pendingTiles;
    private desiredTiles;
    private renderedTiles;
    private requiredTiles;
    private readonly baseZoom;
    private readonly retentionUpdates;
    private readonly missingUpdates;
    private readonly retentionMs;
    private readonly unusedSince;
    private desiredAncestors;
    private readonly tileQueue;
    private readonly queuedTiles;
    private readonly maxTasksPerUpdate;
    private readonly maxCleanupTilesPerUpdate;
    private cleanupKeys;
    private cleanupIndex;
    private cleanupCoverageKeys;
    private cleanupCoverageCache;
    private needsScheduling;
    private needsCleanup;
    private tilesReady;
    constructor({ tilesManager }: MapTilesManagerOptions);
    init(): void;
    get isIdling(): boolean;
    private collectRequiredTiles;
    private collectDesiredAncestors;
    private hasHigherPriority;
    private enqueueTile;
    private heapifyUp;
    private heapifyDown;
    private swapQueueEntries;
    private popQueueEntry;
    /**
     * Add required tiles to the persistent queue and refresh the priority
     * of tiles that are already waiting in it.
     */
    private enqueueNewRequiredTiles;
    /**
     * Submit a bounded number of tasks to the task scheduler.
     *
     * Remaining candidates stay in the persistent heap and are processed
     * during subsequent updates.
     */
    private scheduleRequiredTiles;
    private applyRenderedVisibility;
    private updateRenderedCoverage;
    private shouldRefine;
    private isCoveredByDescendants;
    private getCoverageTree;
    private isAreaCovered;
    private beginCleanupSweep;
    private finishCleanupSweep;
    /**
     * Process only a limited number of loaded tiles per update.
     *
     * The coverage tree and key list are generated once per sweep,
     * rather than once for every cleanup operation.
     */
    private cleanupUnusedTiles;
    update(visibleTiles: GlobeTile[]): void;
    render(): void;
    destroy(): void;
}
export {};
