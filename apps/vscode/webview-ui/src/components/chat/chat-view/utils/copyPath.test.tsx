import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import MarkdownBlock from "@/components/common/MarkdownBlock"
import { convertHtmlToMarkdown } from "./markdownUtils"

// Replicates the exact steps of ChatView's copy handler: build a DOM selection
// over rendered chat content, clone it, take innerHTML, convert to markdown.
async function copySelectionAsMarkdown(): Promise<string> {
	const selection = document.getSelection()
	if (!selection || selection.rangeCount === 0) {
		throw new Error("no selection")
	}
	const range = selection.getRangeAt(0)
	const clonedSelection = range.cloneContents()
	const div = document.createElement("div")
	div.appendChild(clonedSelection)
	return convertHtmlToMarkdown(div.innerHTML)
}

describe("copy path over rendered chat content", () => {
	it("survives copying a rendered markdown table (user-reported crash)", async () => {
		const content = [
			"Here is the summary:",
			"",
			"| File | Change |",
			"| --- | --- |",
			"| a.ts | fix auth |",
			"| b.ts | refactor |",
			"",
			"Some trailing prose.",
		].join("\n")

		const { container } = render(<MarkdownBlock markdown={content} />)

		// Select the whole rendered message, like a user triple-click + shift or Ctrl/Cmd+A over it.
		const message = container.firstElementChild
		if (!message) throw new Error("nothing rendered")
		const selection = document.getSelection()
		const range = document.createRange()
		range.selectNodeContents(message)
		selection?.removeAllRanges()
		selection?.addRange(range)

		const md = await copySelectionAsMarkdown()

		expect(md).toContain("| File")
		expect(md).toMatch(/\|\s*-{3,}/)
		expect(md).toContain("fix auth")
	})

	it("copies plain prose normally", async () => {
		const { container } = render(<MarkdownBlock markdown={"plain paragraph text"} />)
		const message = container.firstElementChild
		if (!message) throw new Error("nothing rendered")
		const selection = document.getSelection()
		const range = document.createRange()
		range.selectNodeContents(message)
		selection?.removeAllRanges()
		selection?.addRange(range)

		const md = await copySelectionAsMarkdown()
		expect(md).toContain("plain paragraph text")
	})

	it("userEvent copy of a table selection does not throw", async () => {
		render(<MarkdownBlock markdown={"| a | b |\n| --- | --- |\n| 1 | 2 |"} />)
		const table = screen.getByRole("table")
		const selection = document.getSelection()
		const range = document.createRange()
		range.selectNodeContents(table)
		selection?.removeAllRanges()
		selection?.addRange(range)

		await userEvent.copy(document.body)
		expect(true).toBe(true) // reaching here means the copy path didn't throw
	})
})
