import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import IndexCard from "./IndexCard"

const mocks = vi.hoisted(() => ({
	getDocsIndexSettings: vi.fn(),
	updateDocsIndexSettings: vi.fn(),
	crawlUrl: vi.fn(),
	getTask: vi.fn(),
}))

vi.mock("@/services/grpc-client", () => ({
	DocsIndexServiceClient: {
		getDocsIndexSettings: mocks.getDocsIndexSettings,
		updateDocsIndexSettings: mocks.updateDocsIndexSettings,
		crawlUrl: mocks.crawlUrl,
		getTask: mocks.getTask,
	},
}))

const baseProps = (over: Record<string, unknown> = {}) => ({
	serverUrl: "http://x",
	connected: true,
	selectedProject: "p",
	...over,
})

const doneTask = {
	status: "done",
	progress: 1,
	message: "crawled",
	detail: "",
}

describe("IndexCard", () => {
	beforeEach(() => {
		mocks.getDocsIndexSettings.mockReset()
		mocks.updateDocsIndexSettings.mockReset()
		mocks.crawlUrl.mockReset()
		mocks.getTask.mockReset()
		// Self-loaded settings resolve with defaults so the mount effect doesn't warn.
		mocks.getDocsIndexSettings.mockResolvedValue({
			serverUrl: "",
			lastSelectedProject: "",
			crawlMaxDepth: 0,
			crawlMaxPages: 0,
		} as any)
	})

	it("renders a Crawl URL button and depth/max pages inputs", () => {
		render(<IndexCard {...baseProps()} />)
		expect(screen.getByRole("button", { name: "Crawl URL" })).toBeInTheDocument()
		expect(screen.getByText(/Depth/)).toBeInTheDocument()
		expect(screen.getByText(/Max pages/)).toBeInTheDocument()
	})

	it("calls crawlUrl with the input url and depth/max pages from the inputs", async () => {
		mocks.crawlUrl.mockResolvedValue({ crawlId: "c1", taskId: "t1", project: "p", status: "accepted" } as any)
		mocks.getTask.mockResolvedValue(doneTask as any)
		render(<IndexCard {...baseProps()} />)
		await userEvent.type(screen.getByPlaceholderText("https://example.com"), "https://x.io")
		fireEvent.change(screen.getByRole("spinbutton", { name: /depth/i }), { target: { value: "7" } })
		fireEvent.change(screen.getByRole("spinbutton", { name: /max pages/i }), { target: { value: "30" } })
		await userEvent.click(screen.getByRole("button", { name: "Crawl URL" }))
		await waitFor(() => expect(mocks.crawlUrl).toHaveBeenCalled())
		expect(mocks.crawlUrl).toHaveBeenCalledWith(
			expect.objectContaining({ serverUrl: "http://x", project: "p", url: "https://x.io", maxDepth: 7, maxPages: 30 }),
		)
	})

	it("persists depth/max pages changes via updateDocsIndexSettings", async () => {
		mocks.updateDocsIndexSettings.mockResolvedValue({} as any)
		render(<IndexCard {...baseProps({ workspacePath: "/ws" })} />)
		const depth = screen.getByRole("spinbutton", { name: /depth/i })
		await userEvent.clear(depth)
		await userEvent.type(depth, "5")
		await waitFor(() => expect(mocks.updateDocsIndexSettings).toHaveBeenCalled())
		expect(mocks.updateDocsIndexSettings).toHaveBeenCalledWith(
			expect.objectContaining({ workspacePath: "/ws", crawlMaxDepth: 5 }),
		)
	})

	it("loads saved depth/max pages from settings on mount", async () => {
		mocks.getDocsIndexSettings.mockResolvedValue({
			serverUrl: "",
			lastSelectedProject: "",
			crawlMaxDepth: 9,
			crawlMaxPages: 77,
		} as any)
		render(<IndexCard {...baseProps()} />)
		await waitFor(() => expect(screen.getByRole("spinbutton", { name: /depth/i })).toHaveValue(9))
		expect(screen.getByRole("spinbutton", { name: /max pages/i })).toHaveValue(77)
	})

	it("polls getTask until done then shows the result", async () => {
		mocks.crawlUrl.mockResolvedValue({ crawlId: "c1", taskId: "t1", project: "p", status: "accepted" } as any)
		mocks.getTask.mockResolvedValue(doneTask as any)
		render(<IndexCard {...baseProps()} />)
		await userEvent.type(screen.getByPlaceholderText("https://example.com"), "https://x.io")
		await userEvent.click(screen.getByRole("button", { name: "Crawl URL" }))
		await waitFor(() => expect(screen.getByText(/done/i)).toBeInTheDocument())
		expect(mocks.getTask).toHaveBeenCalledWith(expect.objectContaining({ serverUrl: "http://x", taskId: "t1" }))
	})

	it("shows an error when crawlUrl returns no task id", async () => {
		mocks.crawlUrl.mockResolvedValue({ crawlId: "", taskId: "", project: "p", status: "error" } as any)
		render(<IndexCard {...baseProps()} />)
		await userEvent.type(screen.getByPlaceholderText("https://example.com"), "https://x.io")
		await userEvent.click(screen.getByRole("button", { name: "Crawl URL" }))
		await waitFor(() => expect(screen.getByText(/did not return a task id/i)).toBeInTheDocument())
	})

	it("disables the crawl controls when not connected or no project selected", async () => {
		render(<IndexCard {...baseProps({ connected: false, selectedProject: "" })} />)
		expect(screen.getByRole("button", { name: "Crawl URL" })).toBeDisabled()
		expect(screen.getByPlaceholderText("https://example.com")).toBeDisabled()
		expect(screen.getByRole("spinbutton", { name: /depth/i })).toBeDisabled()
		expect(screen.getByRole("spinbutton", { name: /max pages/i })).toBeDisabled()
	})
})
