export declare class LercWorkerPool {
    private workers;
    private idleWorkers;
    private queue;
    private pendingTasks;
    private nextTaskId;
    constructor(poolSize?: number);
    decodeTile(rasterTile: ArrayBuffer): Promise<ImageData | null>;
    private dispatch;
    private handleMessage;
    destroy(): void;
}
