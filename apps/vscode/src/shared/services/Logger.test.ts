import { describe, expect, it } from "bun:test"
import { strict as assert } from "node:assert"

// Logger.isVerbose is a private static captured at module load from
// process.env.IS_DEV, so pin the env BEFORE importing to exercise the
// production (non-verbose) path regardless of ambient runner config.
process.env.IS_DEV = "false"
const { Logger } = await import("./Logger")

describe("Logger (production, non-verbose)", () => {
	it("emits the Error message in ERROR output", () => {
		const lines: string[] = []
		// Logger.subscribers is a static Set with no unsubscribe, but bun runs each
		// test file in its own process so the capture subscriber cannot leak to
		// other suites.
		Logger.subscribe((msg) => lines.push(msg))

		Logger.error("x", new Error("boom"))

		assert.ok(
			lines.some((line) => line.includes("boom")),
			`expected "boom" in ERROR output, got: ${JSON.stringify(lines)}`,
		)
		expect(lines.some((line) => line.startsWith(`ERROR`) || line.includes(` ERROR `))).toBe(true)
	})
})
