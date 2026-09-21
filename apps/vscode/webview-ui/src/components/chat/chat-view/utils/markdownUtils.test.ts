import { describe, expect, it } from "vitest"

import { convertHtmlToMarkdown } from "./markdownUtils"

describe("convertHtmlToMarkdown", () => {
	it("converts a table to GFM table markdown instead of crashing", async () => {
		const html = `<table><thead><tr><th>File</th><th>Change</th></tr></thead><tbody><tr><td>a.ts</td><td>fix</td></tr><tr><td>b.ts</td><td>refactor</td></tr></tbody></table>`
		const md = await convertHtmlToMarkdown(html)
		expect(md).toContain("| File")
		expect(md).toMatch(/\|\s*-{3,}\s*\|/)
		expect(md).toMatch(/\|\s*a\.ts\s*\|\s*fix\s*\|/)
	})

	it("does not crash on other GFM nodes (strikethrough)", async () => {
		const html = `<p><del>gone</del></p>`
		const md = await convertHtmlToMarkdown(html)
		expect(md).toContain("~~gone~~")
	})

	it("preserves basic conversions", async () => {
		const html = `<ul><li>one</li><li>two</li></ul>`
		const md = await convertHtmlToMarkdown(html)
		expect(md).toContain("- one")
		expect(md).toContain("- two")
	})
})
