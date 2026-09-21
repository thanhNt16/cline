import type { ClineMessage } from "@shared/ExtensionMessage"
import { describe, expect, it } from "vitest"
import { clampMessageForDisplay } from "./clampMessage"

const big = (n: number, ch = "x") => ch.repeat(n)
const msg = (overrides: Partial<ClineMessage> = {}): ClineMessage => ({ ts: 1, type: "say", ...overrides })

describe("clampMessageForDisplay", () => {
	it("returns the same reference for small messages", () => {
		const m = msg({ text: "hello" })
		expect(clampMessageForDisplay(m)).toBe(m)
	})

	it("returns the same reference when text is exactly at the cap", () => {
		const m = msg({ text: big(100_000) })
		expect(clampMessageForDisplay(m)).toBe(m)
	})

	it("head+tail truncates oversized text with a marker", () => {
		const m = msg({ text: big(100_001) })
		const out = clampMessageForDisplay(m)
		expect(out).not.toBe(m)
		expect(out.text).toContain("[webview truncated")
		expect(out.text!.startsWith("x".repeat(40_000))).toBe(true)
		expect(out.text!.endsWith("x".repeat(40_000))).toBe(true)
		// Head + tail + marker must be well below the original.
		expect(out.text!.length).toBeLessThan(100_001)
	})

	it("keeps JSON tool payloads valid while clamping their long fields", () => {
		// say:"tool" text is JSON.stringify({tool, path, content, diff}) — ChatRow JSON.parses it
		// at render, so clamping MUST NOT break JSON syntax (this was the whole-webview crash).
		const payload = { tool: "editedExistingFile", path: "src/x.ts", content: big(150_000), diff: big(30_000) }
		const m = msg({ say: "tool", text: JSON.stringify(payload) })
		const out = clampMessageForDisplay(m)
		const parsed = JSON.parse(out.text!) as typeof payload
		expect(parsed.tool).toBe("editedExistingFile")
		expect(parsed.path).toBe("src/x.ts")
		expect(parsed.content).toContain("[webview truncated")
		expect(parsed.content.length).toBeLessThan(100_000)
		// Fields under the cap pass through unchanged.
		expect(parsed.diff).toBe(payload.diff)
	})

	it("handles nested JSON structures with oversized strings", () => {
		const payload = { nested: { deep: big(120_000) }, list: [big(10), big(150_000)] }
		const m = msg({ say: "api_req_started", text: JSON.stringify(payload) })
		const out = clampMessageForDisplay(m)
		const parsed = JSON.parse(out.text!) as typeof payload
		expect(parsed.nested.deep).toContain("[webview truncated")
		expect(parsed.list[0]).toBe(big(10))
		expect(parsed.list[1]).toContain("[webview truncated")
	})

	it("falls back to opaque clamping for non-JSON oversized text", () => {
		const m = msg({ text: `${big(50_000)} not json { ${big(60_000)}` })
		const out = clampMessageForDisplay(m)
		expect(out.text).toContain("[webview truncated")
		expect(out.text!.length).toBeLessThan(110_000)
	})

	it("JSON clamping is deterministic across repeated calls", () => {
		const m = msg({ say: "tool", text: JSON.stringify({ content: big(200_000, "a") }) })
		expect(clampMessageForDisplay(m)).toEqual(clampMessageForDisplay(m))
	})

	it("returns the same reference for small JSON payloads", () => {
		const m = msg({ say: "tool", text: JSON.stringify({ tool: "read_file", path: "a.ts" }) })
		expect(clampMessageForDisplay(m)).toBe(m)
	})

	it("clamps reasoning independently of text", () => {
		const m = msg({ text: "small", reasoning: big(120_000) })
		const out = clampMessageForDisplay(m)
		expect(out.text).toBe("small")
		expect(out.reasoning!.length).toBeLessThan(120_000)
		expect(out.reasoning).toContain("[webview truncated")
	})

	it("leaves images untouched", () => {
		const huge = big(150_000)
		const m = msg({ text: huge, images: [huge] })
		const out = clampMessageForDisplay(m)
		expect(out.images).toEqual([huge])
	})

	it("survives deeply nested JSON structures without crashing", () => {
		// Construct a deeply nested JSON object (depth 200) with a large innermost string
		let payload = `{"val": "${"x".repeat(120_000)}"}`
		for (let i = 0; i < 200; i++) {
			payload = `{"nested": ${payload}}`
		}
		const m = msg({ text: payload })
		expect(() => clampMessageForDisplay(m)).not.toThrow()
		const out = clampMessageForDisplay(m)
		expect(out.text).toContain("[webview truncated")
		const parsed = JSON.parse(out.text!)
		expect(parsed).toBeDefined()
	})

	it("is deterministic across repeated calls (snapshot convergence)", () => {
		const m = msg({ text: big(200_000, "a") })
		expect(clampMessageForDisplay(m)).toEqual(clampMessageForDisplay(m))
	})
})
