import LercWorker from '../../workers/decode-lerc-data-worker.js?worker'

// LercWorkerPool.ts
interface PendingTask {
  resolve: (imageData: ImageData | null) => void
  reject: (err: Error) => void
}

export class LercWorkerPool {
  private workers: Worker[] = []
  private idleWorkers: Worker[] = []
  private queue: Array<{
    id: number
    rasterTile: ArrayBuffer
    task: PendingTask
  }> = []
  private pendingTasks = new Map<number, PendingTask>()
  private nextTaskId = 0

  constructor(poolSize = navigator.hardwareConcurrency || 4) {
    for (let i = 0; i < poolSize; i++) {
      const worker = new LercWorker({ type: 'module' })
      worker.onmessage = (e) => this.handleMessage(worker, e)
      worker.onerror = (err) => console.error('LERC Worker error:', err)
      this.workers.push(worker)
      this.idleWorkers.push(worker)
    }
  }

  public decodeTile(rasterTile: ArrayBuffer): Promise<ImageData | null> {
    return new Promise((resolve, reject) => {
      const id = this.nextTaskId++
      const task = { resolve, reject }
      this.pendingTasks.set(id, task)

      if (this.idleWorkers.length > 0) {
        const worker = this.idleWorkers.pop()!
        this.dispatch(worker, id, rasterTile)
      } else {
        this.queue.push({ id, rasterTile, task })
      }
    })
  }

  private dispatch(worker: Worker, id: number, rasterTile: ArrayBuffer) {
    // Transfer rasterTile to the worker with zero-copy
    worker.postMessage({ id, rasterTile }, [rasterTile])
  }

  private handleMessage(worker: Worker, e: MessageEvent) {
    const { id, status, buffer, width, height, error } = e.data
    const task = this.pendingTasks.get(id)
    this.pendingTasks.delete(id)

    if (task) {
      if (status === 'empty') {
        // Resolve cleanly with null: zero console errors, zero stack trace overhead
        task.resolve(null)
      } else if (status === 'error') {
        task.reject(new Error(error))
      } else {
        // Reconstruct ImageData instantly from the transferred buffer
        const clampedArray = new Uint8ClampedArray(buffer)
        const imageData = new ImageData(clampedArray, width, height)
        task.resolve(imageData)
      }
    }

    // Immediately grab the next queued tile or return worker to idle pool
    if (this.queue.length > 0) {
      const next = this.queue.shift()!
      this.dispatch(worker, next.id, next.rasterTile)
    } else {
      this.idleWorkers.push(worker)
    }
  }

  public destroy() {
    this.workers.forEach((w) => w.terminate())
    this.workers = []
    this.idleWorkers = []
    this.queue = []
    this.pendingTasks.clear()
  }
}
