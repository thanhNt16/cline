/**
 * MarkdownBlock – table layout regression test
 * --------------------------------------------------
 * Wide markdown tables (e.g. columns containing long file paths) used to
 * overflow the chat row and get clipped, with narrow columns collapsing to a
 * single character per line because MarkdownRow's `wrap-anywhere` inherits
 * into table cells.
 *
 * The fix wraps every table in `.md-table-wrapper` (overflow-x: auto) and
 * resets `overflow-wrap` inside cells. jsdom does not do layout, so this test
 * locks in the DOM contract the CSS fix depends on.
 */

import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/context/ExtensionStateContext", () => ({
	__esModule: true,
	useExtensionState: () => ({ state: {}, dispatch: vi.fn() }),
}))

vi.mock("@/services/grpc-client", () => ({
	FileServiceClient: {
		ifFileExistsRelativePath: vi.fn().mockResolvedValue({ value: false }),
		openFileRelativePath: vi.fn().mockResolvedValue({}),
		openFile: vi.fn().mockResolvedValue({}),
	},
	StateServiceClient: { togglePlanActMode: vi.fn().mockResolvedValue({}) },
}))

import MarkdownBlock from "../MarkdownBlock"

const TABLE_MARKDOWN = `
| Layer | File | Function / Line |
| --- | --- | --- |
| API service | \`src/services/seafarer/index.tsx\` | \`fetchSeafarerList(payload)\` — 8–30 |
| React hook | \`src/features/auth/screens/AboutProfilePage/api/index.ts\` | \`useSeafarerList\` — lines 74–109 |
`

describe("MarkdownBlock – table rendering", () => {
	it("wraps tables in a horizontally scrollable container", () => {
		const { container } = render(<MarkdownBlock markdown={TABLE_MARKDOWN} />)

		const table = container.querySelector("table")
		expect(table).not.toBeNull()

		// The table must be a direct child of the scroll wrapper, otherwise a
		// wide table overflows the chat row and becomes unreachable.
		const wrapper = table?.parentElement
		expect(wrapper?.classList.contains("md-table-wrapper")).toBe(true)
	})

	it("preserves table structure and cell content", () => {
		const { container } = render(<MarkdownBlock markdown={TABLE_MARKDOWN} />)

		expect(container.querySelectorAll("thead th")).toHaveLength(3)
		expect(container.querySelectorAll("tbody tr")).toHaveLength(2)

		const firstRowCells = container.querySelectorAll("tbody tr")[0].querySelectorAll("td")
		expect(firstRowCells).toHaveLength(3)
		expect(firstRowCells[0].textContent?.trim()).toBe("API service")
	})

	it("renders non-table markdown without adding a table wrapper", () => {
		const { container } = render(<MarkdownBlock markdown="Just a paragraph." />)
		expect(container.querySelector(".md-table-wrapper")).toBeNull()
	})
})
