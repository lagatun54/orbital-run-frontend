import type { LocalResult } from '../game/round/interfaces/match.js'
import { isRecord, isScore } from '../shared/validation.js'

const prefix = 'orbital-run:local-result:'
const pending = new Map<string, LocalResult>()

export function saveLocalResult(result: LocalResult) {
  pending.set(result.id, result)
  try {
    localStorage.setItem(prefix + result.id, JSON.stringify(result))
    return true
  } catch {
    return false
  }
}

export function pendingLocalResults() {
  const results = new Map(pending)
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(prefix)) continue
      try {
        const raw = localStorage.getItem(key)
        if (raw === null) continue
        const result: unknown = JSON.parse(raw)
        if (isLocalResult(result) && result.id === key.slice(prefix.length)) results.set(result.id, result)
      } catch {
        // A damaged entry should not prevent other results from syncing.
      }
    }
  } catch {
    // Keep sending results from this tab if browser storage is unavailable.
  }
  return results.values()
}

export function forgetLocalResult(id: string) {
  pending.delete(id)
  try {
    localStorage.removeItem(prefix + id)
  } catch {
    // If the browser retries a stored result later, the server deduplicates it.
  }
}

function isLocalResult(value: unknown): value is LocalResult {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string' &&
    isScore(value.score) && isScore(value.botScore)
}
