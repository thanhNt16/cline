import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import ChatErrorBoundary from "./ChatErrorBoundary"

vi.mock("@/utils/reportWebviewError", () => ({
	reportWebviewError: vi.fn(),
}))

function BuggyComponent({ shouldThrow, text = "OK" }: { shouldThrow: boolean; text?: string }) {
	if (shouldThrow) {
		throw new Error("Simulated render crash")
	}
	return <div>{text}</div>
}

describe("ChatErrorBoundary", () => {
	it("renders children normally when no error occurs", () => {
		render(
			<ChatErrorBoundary>
				<div>Healthy Content</div>
			</ChatErrorBoundary>,
		)
		expect(screen.getByText("Healthy Content")).toBeDefined()
	})

	it("catches render errors and displays error card with message", () => {
		// Suppress console.error in test output for expected error boundary catch
		const spy = vi.spyOn(console, "error").mockImplementation(() => {})

		render(
			<ChatErrorBoundary errorTitle="Failed to render message">
				<BuggyComponent shouldThrow={true} />
			</ChatErrorBoundary>,
		)

		expect(screen.getByText("Failed to render message")).toBeDefined()
		expect(screen.getByText(/Simulated render crash/)).toBeDefined()
		spy.mockRestore()
	})

	it("recovers when resetKeys change", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {})

		const { rerender } = render(
			<ChatErrorBoundary resetKeys={[1]}>
				<BuggyComponent shouldThrow={true} />
			</ChatErrorBoundary>,
		)
		expect(screen.getByText(/Simulated render crash/)).toBeDefined()

		// Change resetKeys to indicate a new message/update arrived
		rerender(
			<ChatErrorBoundary resetKeys={[2]}>
				<BuggyComponent shouldThrow={false} text="Recovered" />
			</ChatErrorBoundary>,
		)

		expect(screen.queryByText(/Simulated render crash/)).toBeNull()
		expect(screen.getByText("Recovered")).toBeDefined()
		spy.mockRestore()
	})
})
