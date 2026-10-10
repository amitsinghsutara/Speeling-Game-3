/**
 * Tiny console logger with a tag, so adviser and policy activity can be
 * followed in the browser's developer console. Messages stay on the device.
 */
export type LogFn = (message: string, details?: unknown) => void

export const consoleLog =
  (tag: string): LogFn =>
  (message, details) => {
    if (typeof console === 'undefined') return
    if (details === undefined) console.info(`[${tag}] ${message}`)
    else console.info(`[${tag}] ${message}`, details)
  }

export const silentLog: LogFn = () => {}
