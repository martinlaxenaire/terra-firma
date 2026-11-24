export interface TaskQueueItem {
  callback: () => void
  priority: number
  isRunning: boolean
  id: number
}

export const taskQueueScheduler = {
  taskIndex: 0,

  ticker:
    typeof window === 'undefined'
      ? () => {}
      : 'requestIdleCallback' in window
        ? window.requestIdleCallback.bind(window)
        : setTimeout.bind(window),
  clearTicker:
    typeof window === 'undefined'
      ? () => {}
      : 'requestIdleCallback' in window
        ? window.cancelIdleCallback.bind(window)
        : clearTimeout.bind(window),

  queue: <Array<TaskQueueItem>>[],

  addSingleTask(task = { callback: () => {}, priority: 1 }) {
    const { callback, priority } = task

    const queueItem = {
      callback,
      priority,
      isRunning: false,
      id: this.taskIndex,
    }

    this.queue.push(queueItem)
    this.taskIndex++
  },

  addTasks(tasks = []) {
    const tasksLength = tasks.length
    for (let i = 0; i < tasksLength; i++) {
      this.addSingleTask(tasks[i])
    }

    this.sortQueue()
  },

  addTask(task = { callback: () => {}, priority: 1 }) {
    this.addSingleTask(task)
    this.sortQueue()
  },

  sortQueue() {
    this.queue.sort((task1, task2) => task2.priority - task1.priority)
  },

  clearAll() {
    this.queue = []
  },

  // needs to be called in a raf ticker
  executeQueue() {
    this.queue.forEach((task) => {
      if (task.isRunning) return
      task.isRunning = true

      const id = this.ticker(() => {
        task.callback()
        this.clearTicker(id)
        this.queue = this.queue.filter((t) => t.id !== task.id)
      }) as number
    })
  },
}
