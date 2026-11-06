/** Keep cancellation attached while an interactive tool is waiting for the UI. */
export function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort)
    const onAbort = () => {
      cleanup()
      reject(signal.reason)
    }
    promise.then(
      value => { cleanup(); signal.aborted ? reject(signal.reason) : resolve(value) },
      error => { cleanup(); reject(error) },
    )
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  })
}

export function waitForInteraction<T>(
  pending: Map<string, (value: T) => void>,
  key: string,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      pending.delete(key)
      signal.removeEventListener('abort', onAbort)
    }
    const onAbort = () => { cleanup(); reject(signal.reason) }
    if (signal.aborted) { reject(signal.reason); return }
    pending.set(key, value => { cleanup(); resolve(value) })
    signal.addEventListener('abort', onAbort, { once: true })
  })
}
