import * as tilebelt from '@mapbox/tilebelt'
import { getTileKey } from '../utils/map.js'
import { taskQueueScheduler } from '../core/task-queue-scheduler.js'
import MapTile from '../Tiles/MapTile.js'

import type TilesManager from '../TilesManager/TilesManager.js'
import { GlobeTile } from '../GlobeLOD/GlobeLOD.js'

interface MapTilesManagerOptions {
  tilesManager: TilesManager
}

interface TileQueueEntry {
  key: string
  tile: tilebelt.Tile
  priority: number
}

export default class MapTilesManager {
  private readonly tilesManager: TilesManager

  private active: boolean

  readonly mapTiles: Map<string, MapTile> = new Map()
  private readonly pendingTiles = new Set<string>()

  // Tiles currently requested by GlobeLOD.
  private desiredTiles = new Set<string>()

  // Tiles currently submitted for rendering.
  private renderedTiles = new Set<string>()

  // Tiles required for loading and fallback coverage.
  private requiredTiles = new Map<string, tilebelt.Tile>()

  private readonly baseZoom = 3

  private readonly retentionUpdates = 30
  private readonly missingUpdates = new Map<string, number>()

  private readonly retentionMs = 3000
  private readonly unusedSince = new Map<string, number>()

  private desiredAncestors = new Set<string>()

  // Persistent priority queue for tile loading.
  private readonly tileQueue: TileQueueEntry[] = []
  private readonly queuedTiles = new Set<string>()

  // Limit the number of tasks submitted to the scheduler per update.
  private readonly maxTasksPerUpdate = 48

  // Limit cleanup work per update.
  private readonly maxCleanupTilesPerUpdate = 64

  // Incremental cleanup state.
  private cleanupKeys: string[] | null = null
  private cleanupIndex = 0
  private cleanupCoverageKeys: Set<string> | null = null
  private cleanupCoverageCache: Map<string, boolean> | null = null

  private needsScheduling = false
  private needsCleanup = true

  private tilesReady = 0

  constructor({ tilesManager }: MapTilesManagerOptions) {
    this.tilesManager = tilesManager
    this.active = false
  }

  init(): void {
    this.active = true
  }

  get isIdling(): boolean {
    return (
      !!this.tilesReady &&
      this.tilesReady === this.mapTiles.size &&
      !this.needsScheduling &&
      !this.needsCleanup &&
      !this.pendingTiles.size &&
      !taskQueueScheduler.queue.length &&
      !this.tileQueue.length &&
      !this.cleanupCoverageCache
    )
  }

  // ---------------------------------------------------------------------------
  // Tile collection
  // ---------------------------------------------------------------------------

  private collectRequiredTiles(visibleTiles: GlobeTile[], priorities: Map<string, number>): Map<string, tilebelt.Tile> {
    const required = new Map<string, tilebelt.Tile>()

    const addTile = (tile: tilebelt.Tile, priority: number): void => {
      const key = getTileKey(tile)

      required.set(key, tile)

      // Keep the highest priority if a tile is encountered more than once.
      const currentPriority = priorities.get(key) ?? 0
      priorities.set(key, Math.max(currentPriority, priority))
    }

    for (const visibleTile of visibleTiles) {
      const rawPriority = visibleTile.screenSpaceError ?? 0

      const priority = Number.isFinite(rawPriority) ? Math.max(0, rawPriority) : 0

      let tile: tilebelt.Tile = [visibleTile.x, visibleTile.y, visibleTile.z]

      while (tile[2] > this.baseZoom) {
        const parent = tilebelt.getParent(tile)

        // Ancestors inherit the priority of the visible tile.
        addTile(parent, priority)

        // Keep siblings available for fallback coverage.
        // Siblings receive zero priority unless they are also required
        // by another visible tile.
        for (const child of tilebelt.getChildren(parent)) {
          addTile(child, 0)
        }

        tile = parent
      }

      addTile(tile, priority)
    }

    return required
  }

  private collectDesiredAncestors(visibleTiles: GlobeTile[]): Set<string> {
    const ancestors = new Set<string>()

    for (const visibleTile of visibleTiles) {
      let current: tilebelt.Tile = [visibleTile.x, visibleTile.y, visibleTile.z]

      while (current[2] > this.baseZoom) {
        current = tilebelt.getParent(current)
        ancestors.add(getTileKey(current))
      }
    }

    return ancestors
  }

  // ---------------------------------------------------------------------------
  // Persistent priority queue
  // ---------------------------------------------------------------------------

  private hasHigherPriority(a: TileQueueEntry, b: TileQueueEntry): boolean {
    if (a.priority !== b.priority) {
      return a.priority > b.priority
    }

    // Prefer shallower tiles when priorities are equal.
    if (a.tile[2] !== b.tile[2]) {
      return a.tile[2] < b.tile[2]
    }

    return a.key < b.key
  }

  private enqueueTile(key: string, tile: tilebelt.Tile, priority: number): void {
    if (this.mapTiles.has(key) || this.pendingTiles.has(key)) {
      return
    }

    // If the tile is already queued, refresh its priority.
    const existingIndex = this.tileQueue.findIndex((entry) => entry.key === key)

    if (existingIndex !== -1) {
      const entry = this.tileQueue[existingIndex]

      if (entry.priority === priority) {
        return
      }

      const previousPriority = entry.priority
      entry.priority = priority

      if (priority > previousPriority) {
        this.heapifyUp(existingIndex)
      } else {
        this.heapifyDown(existingIndex)
      }

      this.needsScheduling = true
      return
    }

    const entry: TileQueueEntry = {
      key,
      tile,
      priority,
    }

    this.tileQueue.push(entry)
    this.queuedTiles.add(key)

    this.heapifyUp(this.tileQueue.length - 1)

    this.needsScheduling = true
  }

  private heapifyUp(startIndex: number): void {
    let index = startIndex

    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2)

      if (this.hasHigherPriority(this.tileQueue[parentIndex], this.tileQueue[index])) {
        break
      }

      this.swapQueueEntries(parentIndex, index)
      index = parentIndex
    }
  }

  private heapifyDown(startIndex: number): void {
    let index = startIndex

    while (true) {
      const leftIndex = index * 2 + 1
      const rightIndex = index * 2 + 2

      let highestPriorityIndex = index

      if (
        leftIndex < this.tileQueue.length &&
        this.hasHigherPriority(this.tileQueue[leftIndex], this.tileQueue[highestPriorityIndex])
      ) {
        highestPriorityIndex = leftIndex
      }

      if (
        rightIndex < this.tileQueue.length &&
        this.hasHigherPriority(this.tileQueue[rightIndex], this.tileQueue[highestPriorityIndex])
      ) {
        highestPriorityIndex = rightIndex
      }

      if (highestPriorityIndex === index) {
        break
      }

      this.swapQueueEntries(index, highestPriorityIndex)
      index = highestPriorityIndex
    }
  }

  private swapQueueEntries(a: number, b: number): void {
    const temp = this.tileQueue[a]
    this.tileQueue[a] = this.tileQueue[b]
    this.tileQueue[b] = temp
  }

  private popQueueEntry(): TileQueueEntry | undefined {
    if (this.tileQueue.length === 0) {
      return undefined
    }

    const first = this.tileQueue[0]
    const last = this.tileQueue.pop()!

    if (this.tileQueue.length > 0) {
      this.tileQueue[0] = last
      this.heapifyDown(0)
    }

    return first
  }

  /**
   * Add required tiles to the persistent queue and refresh the priority
   * of tiles that are already waiting in it.
   */
  private enqueueNewRequiredTiles(
    nextRequiredTiles: Map<string, tilebelt.Tile>,
    priorities: Map<string, number>,
  ): void {
    for (const [key, tile] of nextRequiredTiles) {
      const priority = priorities.get(key) ?? 0

      this.enqueueTile(key, tile, priority)
    }
  }

  /**
   * Submit a bounded number of tasks to the task scheduler.
   *
   * Remaining candidates stay in the persistent heap and are processed
   * during subsequent updates.
   */
  private scheduleRequiredTiles(): void {
    let scheduled = 0

    while (scheduled < this.maxTasksPerUpdate && this.tileQueue.length > 0) {
      const entry = this.popQueueEntry()!

      this.queuedTiles.delete(entry.key)

      const { key, tile } = entry

      // Discard stale queue entries.
      if (!this.requiredTiles.has(key)) {
        continue
      }

      if (this.mapTiles.has(key) || this.pendingTiles.has(key)) {
        continue
      }

      this.pendingTiles.add(key)
      scheduled++

      taskQueueScheduler.addTask({
        callback: () => {
          this.pendingTiles.delete(key)

          if (!this.active) return

          // The camera may have moved since this task was queued.
          if (!this.requiredTiles.has(key)) return

          // Another task may already have created this tile.
          if (this.mapTiles.has(key)) return

          const mapTile = new MapTile({
            tilesManager: this.tilesManager,
            tile,
            screenSpaceError: entry.priority,

            onTileReady: () => {
              this.updateRenderedCoverage()
              this.tilesReady++
              this.needsCleanup = true
            },
          })

          this.mapTiles.set(key, mapTile)

          this.needsCleanup = true

          if (mapTile.ready) {
            this.updateRenderedCoverage()
          }
        },

        priority: entry.priority,
      })
    }

    this.needsScheduling = this.tileQueue.length > 0
  }

  // ---------------------------------------------------------------------------
  // Rendered coverage
  // ---------------------------------------------------------------------------

  private applyRenderedVisibility(next: Set<string>): void {
    for (const key of this.renderedTiles) {
      if (next.has(key)) continue

      this.mapTiles.get(key)?.setVisible(false)
    }

    for (const key of next) {
      if (this.renderedTiles.has(key)) continue

      this.mapTiles.get(key)?.setVisible(true)
    }

    this.renderedTiles = next
  }

  private updateRenderedCoverage(): void {
    const { keys, roots } = this.getCoverageTree()

    const nextRenderedTiles = new Set<string>()
    const coverageCache = new Map<string, boolean>()

    const visit = (tile: tilebelt.Tile): void => {
      const key = getTileKey(tile)
      const mapTile = this.mapTiles.get(key)

      const children = tilebelt.getChildren(tile)
      const shouldRefine = this.shouldRefine(tile)

      if (shouldRefine) {
        const canRefine = children.every((child) => this.isAreaCovered(child, keys, coverageCache))

        if (canRefine) {
          for (const child of children) {
            visit(child)
          }

          return
        }
      }

      if (mapTile?.ready) {
        nextRenderedTiles.add(key)
        return
      }

      for (const child of children) {
        if (this.isAreaCovered(child, keys, coverageCache)) {
          visit(child)
        }
      }
    }

    for (const tile of roots.values()) {
      visit(tile)
    }

    this.applyRenderedVisibility(nextRenderedTiles)
  }

  private shouldRefine(tile: tilebelt.Tile): boolean {
    return this.desiredAncestors.has(getTileKey(tile))
  }

  private isCoveredByDescendants(tile: tilebelt.Tile, treeKeys: Set<string>, cache: Map<string, boolean>): boolean {
    const children = tilebelt.getChildren(tile)

    return children.every((child) => this.isAreaCovered(child, treeKeys, cache))
  }

  private getCoverageTree(): {
    keys: Set<string>
    roots: Map<string, tilebelt.Tile>
  } {
    const keys = new Set<string>()
    const roots = new Map<string, tilebelt.Tile>()

    const addTileAndAncestors = (input: tilebelt.Tile): void => {
      let tile = input

      while (tile[2] > this.baseZoom) {
        keys.add(getTileKey(tile))
        tile = tilebelt.getParent(tile)
      }

      keys.add(getTileKey(tile))
      roots.set(getTileKey(tile), tile)
    }

    // Required tiles provide the intended coverage structure.
    for (const tile of this.requiredTiles.values()) {
      addTileAndAncestors(tile)
    }

    // Loaded tiles must remain in the tree to preserve fallback
    // coverage during camera rotation and changing visibility.
    for (const mapTile of this.mapTiles.values()) {
      addTileAndAncestors(mapTile.tile)
    }

    return { keys, roots }
  }

  private isAreaCovered(tile: tilebelt.Tile, treeKeys: Set<string>, cache: Map<string, boolean>): boolean {
    const key = getTileKey(tile)

    const cached = cache.get(key)
    if (cached !== undefined) return cached

    const mapTile = this.mapTiles.get(key)

    if (mapTile?.ready) {
      cache.set(key, true)
      return true
    }

    if (!treeKeys.has(key)) {
      cache.set(key, false)
      return false
    }

    const children = tilebelt.getChildren(tile)

    const covered = children.every((child) => {
      const childKey = getTileKey(child)

      if (!treeKeys.has(childKey)) {
        return false
      }

      return this.isAreaCovered(child, treeKeys, cache)
    })

    cache.set(key, covered)

    return covered
  }

  // ---------------------------------------------------------------------------
  // Incremental cleanup
  // ---------------------------------------------------------------------------

  private beginCleanupSweep(): void {
    this.cleanupKeys = [...this.mapTiles.keys()]
    this.cleanupIndex = 0

    const { keys } = this.getCoverageTree()

    this.cleanupCoverageKeys = keys
    this.cleanupCoverageCache = new Map<string, boolean>()
  }

  private finishCleanupSweep(): void {
    this.cleanupKeys = null
    this.cleanupIndex = 0
    this.cleanupCoverageKeys = null
    this.cleanupCoverageCache = null
  }

  /**
   * Process only a limited number of loaded tiles per update.
   *
   * The coverage tree and key list are generated once per sweep,
   * rather than once for every cleanup operation.
   */
  private cleanupUnusedTiles(): void {
    if (!this.cleanupKeys) {
      this.beginCleanupSweep()
    }

    const keys = this.cleanupKeys!
    const coverageKeys = this.cleanupCoverageKeys!
    const coverageCache = this.cleanupCoverageCache!

    let processed = 0

    while (this.cleanupIndex < keys.length && processed < this.maxCleanupTilesPerUpdate) {
      const key = keys[this.cleanupIndex++]
      processed++

      const mapTile = this.mapTiles.get(key)

      // It may have been removed since the sweep began.
      if (!mapTile) continue

      // Never destroy a tile currently being rendered.
      // if (mapTile.visible) {
      //   this.missingUpdates.delete(key)
      //   continue
      // }

      const isRequired = this.requiredTiles.has(key)

      // A required tile can be discarded once its descendants
      // provide complete coverage.
      const isReplaced = isRequired && this.isCoveredByDescendants(mapTile.tile, coverageKeys, coverageCache)

      if (mapTile.visible || (isRequired && !isReplaced)) {
        this.unusedSince.delete(key)
        continue
      }

      const unusedAt = this.unusedSince.get(key) ?? Date.now()

      if (!this.unusedSince.has(key)) {
        this.unusedSince.set(key, unusedAt)
      }

      if (Date.now() - unusedAt >= this.retentionMs) {
        mapTile.destroy()
        this.tilesReady = Math.max(0, this.tilesReady - 1)
        this.mapTiles.delete(key)
        this.unusedSince.delete(key)
      }

      //       if (isRequired && !isReplaced) {
      //         this.missingUpdates.delete(key)
      //         continue
      //       }
      //
      //       const updates = (this.missingUpdates.get(key) ?? 0) + 1
      //       this.missingUpdates.set(key, updates)
      //
      //       if (updates >= this.retentionUpdates) {
      //         mapTile.destroy()
      //         this.mapTiles.delete(key)
      //         this.missingUpdates.delete(key)
      //       }
    }

    if (this.cleanupIndex >= keys.length) {
      this.finishCleanupSweep()
      this.needsCleanup = false
    } else {
      this.needsCleanup = true
    }
  }

  // ---------------------------------------------------------------------------
  // Public update
  // ---------------------------------------------------------------------------

  update(visibleTiles: GlobeTile[]): void {
    if (!this.active) return

    const nextDesiredTiles = new Set(visibleTiles.map((tile) => getTileKey([tile.x, tile.y, tile.z])))

    const nextDesiredAncestors = this.collectDesiredAncestors(visibleTiles)

    const priorities = new Map<string, number>()
    const nextRequiredTiles = this.collectRequiredTiles(visibleTiles, priorities)

    // Enqueue new tiles and refresh priorities of tiles already queued.
    this.enqueueNewRequiredTiles(nextRequiredTiles, priorities)

    this.desiredTiles = nextDesiredTiles
    this.desiredAncestors = nextDesiredAncestors
    this.requiredTiles = nextRequiredTiles

    this.updateRenderedCoverage()

    this.needsCleanup = true
  }

  render(): void {
    if (!this.active) return

    if (this.needsScheduling) {
      this.scheduleRequiredTiles()
    }

    if (this.needsCleanup) {
      this.cleanupUnusedTiles()
    }
  }

  // ---------------------------------------------------------------------------
  // Destruction
  // ---------------------------------------------------------------------------

  destroy(): void {
    this.active = false
    this.needsCleanup = false

    for (const mapTile of this.mapTiles.values()) {
      mapTile.destroy()
      this.tilesReady = Math.max(0, this.tilesReady - 1)
    }

    this.mapTiles.clear()
    this.pendingTiles.clear()

    this.desiredTiles.clear()
    this.renderedTiles.clear()
    this.requiredTiles.clear()
    this.missingUpdates.clear()
    this.unusedSince.clear()
    this.desiredAncestors.clear()

    this.tileQueue.length = 0
    this.queuedTiles.clear()

    this.finishCleanupSweep()
  }
}
