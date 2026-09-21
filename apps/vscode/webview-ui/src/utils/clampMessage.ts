import type { ClineMessage } from "@shared/ExtensionMessage"

/**
 * Per-field soft cap (in UTF-16 code units) on the text a single display message may hold in the
 * webview replica. The transcript COUNT cap in messageReducer bounds the NUMBER of retained
 * messages but not their SIZE: a long task that reads large files or dumps big command output
 * produces a few multi-megabyte `text`/`reasoning` strings, and the webview replica is
 * display-only, so holding + rendering + syntax-highlighting those strings grows renderer memory
 * without limit until the frame is OOM-killed (blank screen — uncatchable by any error boundary).
 *
 * Clamping at the replica ingress bounds the dominant memory vector. The host and the agent are
 * unaffected: they own the authoritative transcript; the webview only displays a copy.
 *
 * ponytail: 100k chars is generous for any reasonable code block / tool output and blocks the
 * multi-MB offenders (~100x reduction on a 10MB file read). If OOM persists, lower this and/or
 * add a total-replica-byte bound in the reducer.
 */
const MAX_FIELD_CHARS = 100_000
const HEAD = 40_000
const TAIL = 40_000

function clampString(value: string): string {
	if (value.length <= MAX_FIELD_CHARS) return value
	const dropped = value.length - HEAD - TAIL
	return `${value.slice(0, HEAD)}\n\n…[webview truncated ${dropped} chars to avoid OOM — full text is in the extension transcript]\n\n${value.slice(-TAIL)}`
}

/**
 * Clamp a JSON-serialized `text` field WITHOUT breaking its JSON syntax: some says/asks (e.g.
 * `say:"tool"`, `say:"api_req_started"`) serialize their payload as JSON in `text`, and
 * ChatRow parses that text at render. A raw head+tail splice injects the truncation marker
 * mid-string and produces invalid JSON → SyntaxError in ChatRow → RootErrorBoundary kills the
 * whole webview (the "UI crash on long file-heavy tasks"). Instead, parse and clamp the largest
 * string field(s) inside the payload, then re-stringify — valid JSON in, valid JSON out.
 */
function clampJsonText(value: string): string {
	let parsed: unknown
	try {
		parsed = JSON.parse(value)
		// JSON.parse is iterative (any depth), but our walk and JSON.stringify are recursive:
		// adversarial/deep payloads (~5k+ nesting) would otherwise RangeError out of the
		// updater and kill the webview via the error boundary. The catch covers the whole
		// clamp+stringify, not just the parse.
		if (parsed === null || typeof parsed !== "object") {
			return clampString(value)
		}
		return JSON.stringify(clampJsonStrings(parsed))
	} catch {
		// Not JSON (or already-corrupted legacy text), or walk/stringify blew the stack:
		// fall back to the opaque clamp.
		return clampString(value)
	}
}

/**
 * Recursively clamp any string longer than MAX_FIELD_CHARS inside a JSON object, preserving
 * structure. Returns the same object when nothing changes.
 */
function clampJsonStrings(node: unknown): unknown {
	if (typeof node === "string") return clampString(node)
	if (Array.isArray(node)) return node.map(clampJsonStrings)
	if (node !== null && typeof node === "object") {
		let changed = false
		const out: Record<string, unknown> = {}
		for (const [key, value] of Object.entries(node)) {
			const clamped = clampJsonStrings(value)
			if (clamped !== value) changed = true
			out[key] = clamped
		}
		return changed ? out : node
	}
	return node
}

/**
 * Return a display-safe copy of `message`: oversized `text` and `reasoning` are head+tail
 * truncated with a marker. Returns the SAME object reference when nothing changes so callers
 * (and the convergent-replica reducer's identity checks) are unaffected for normal messages.
 *
 * Pure and deterministic: the same input always clamps to the same output, so repeated
 * full-snapshot merges converge identically. `images` are deliberately left untouched
 * (truncating base64 corrupts the image).
 */
export function clampMessageForDisplay<T extends ClineMessage>(message: T): T {
	const text = message.text
	const reasoning = message.reasoning
	const overText = typeof text === "string" && text.length > MAX_FIELD_CHARS
	const overReasoning = typeof reasoning === "string" && reasoning.length > MAX_FIELD_CHARS
	if (!overText && !overReasoning) return message
	const next: T = { ...message }
	if (overText) next.text = clampJsonText(text as string)
	if (overReasoning) next.reasoning = clampString(reasoning as string)
	return next
}
