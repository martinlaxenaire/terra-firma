export interface TaskQueueItem {
    callback: () => void;
    priority: number;
    isRunning: boolean;
    id: number;
}
export declare const taskQueueScheduler: {
    taskIndex: number;
    ticker: typeof setTimeout | (() => void) | (((callback: IdleRequestCallback, options?: IdleRequestOptions) => number) & typeof requestIdleCallback);
    clearTicker: ((handle: number) => void) & typeof cancelIdleCallback;
    queue: Array<TaskQueueItem>;
    addSingleTask(task?: {
        callback: () => void;
        priority: number;
    }): void;
    addTasks(tasks?: never[]): void;
    addTask(task?: {
        callback: () => void;
        priority: number;
    }): void;
    sortQueue(): void;
    clearAll(): void;
    executeQueue(): void;
};
