import { safeJsonParse } from "./safeJsonParse"

describe("safeJsonParse", () => {
	it("returns fallback for undefined/empty string", () => {
		expect(safeJsonParse(undefined)).toBeNull()
		expect(safeJsonParse("", {})).toEqual({})
	})

	it("returns fallback for invalid JSON", () => {
		expect(safeJsonParse("{invalid")).toBeNull()
		expect(safeJsonParse<{ tool: string }>("{invalid", { tool: "unknown" })).toEqual({ tool: "unknown" })
	})

	it("parses valid JSON", () => {
		expect(safeJsonParse<{ a: number }>('{"a":1}')).toEqual({ a: 1 })
	})
})
