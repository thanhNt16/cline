import { IndexProgressEvent_Level } from "@shared/proto/cline/codebase_memory"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import IndexingCard from "./IndexingCard"

const baseProps = {
	status: { binaryInstalled: true, isIndexed: false } as any,
	isIndexing: true,
	onIndex: () => {},
	onReindex: () => {},
	hasWorkspace: true,
	autoIndex: false,
	onAutoIndexChange: () => {},
}

describe("IndexingCard progress", () => {
	it("shows the phase label, percent, and file counts from the latest event", () => {
		const progressLines = [
			{
				level: IndexProgressEvent_Level.INFO,
				message: "Extracting definitions — 100/200 files",
				phase: "Extracting definitions",
				percent: 45,
				filesDone: 100,
				filesTotal: 200,
			},
		]
		render(<IndexingCard {...baseProps} progressLines={progressLines as any} />)
		expect(screen.getAllByText(/45%/).length).toBeGreaterThanOrEqual(1)
		expect(screen.getAllByText(/100.*200 files/).length).toBeGreaterThanOrEqual(1)
		const bar = screen.getByRole("progressbar")
		expect(bar.getAttribute("aria-valuenow")).toBe("45")
	})

	it("renders an indeterminate bar when the latest event has no percent", () => {
		const progressLines = [
			{
				level: IndexProgressEvent_Level.INFO,
				message: "Retrying with crash isolation…",
				phase: "Retrying with crash isolation",
			},
		]
		render(<IndexingCard {...baseProps} progressLines={progressLines as any} />)
		expect(screen.getAllByText(/Retrying with crash isolation/).length).toBeGreaterThanOrEqual(1)
		const bar = screen.getByRole("progressbar")
		expect(bar.getAttribute("aria-valuenow")).toBeNull()
	})
})

describe("IndexingCard auto-index toggle", () => {
	it("reflects the autoIndex state and calls onAutoIndexChange when toggled", () => {
		const onAutoIndexChange = vi.fn()
		render(
			<IndexingCard
				{...baseProps}
				isIndexing={false}
				progressLines={[]}
				autoIndex={false}
				onAutoIndexChange={onAutoIndexChange}
			/>,
		)
		const checkbox = screen.getByRole("checkbox") as HTMLInputElement
		expect(checkbox.checked).toBe(false)
		fireEvent.click(checkbox)
		expect(onAutoIndexChange).toHaveBeenCalledWith(true)
	})
})
