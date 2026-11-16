export function getBackendOrigin(): string | null {
  const backendURL = import.meta.env.VITE_BACKEND_URL?.trim()
  return backendURL ? parseBackendOrigin(backendURL) : null
}

function parseBackendOrigin(value: string): string {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.href !== url.origin + '/') {
    throw new Error('VITE_BACKEND_URL must be an HTTP(S) origin without a path, query or credentials')
  }
  return url.origin
}
