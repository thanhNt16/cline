/**
 * Safe JSON parser that never throws. Returns `fallback` (defaulting to null) on any parse error.
 */
export function safeJsonParse<T = unknown>(value: string | undefined | null, fallback: T | null = null): T | null {
	if (!value) {
		return fallback
	}
	try {
		return JSON.parse(value) as T
	} catch {
		return fallback
	}
}
