import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import CrawlsCard from "./CrawlsCard"

const mocks = vi.hoisted(() => ({
	listCrawls: vi.fn(),
	refreshCrawl: vi.fn(),
	deleteCrawl: vi.fn(),
	getTask: vi.fn(),
}))

vi.mock("@/services/grpc-client", () => ({
	DocsIndexServiceClient: {
		listCrawls: mocks.listCrawls,
		refreshCrawl: mocks.refreshCrawl,
		deleteCrawl: mocks.deleteCrawl,
		getTask: mocks.getTask,
	},
}))

const crawl = (over: Record<string, unknown> = {}) => ({
	crawlId: "c1",
	rootUrl: "https://example.com",
	status: "done",
	maxDepth: 3,
	maxPages: 50,
	pageCount: 7,
	createdAt: "2026-08-01",
	...over,
})

const resp = {
	crawls: [crawl(), crawl({ crawlId: "c2", rootUrl: "https://docs.example.com", status: "running", pageCount: 2 })],
}

const baseProps = (over: Record<string, unknown> = {}) => ({
	serverUrl: "http://x",
	connected: true,
	selectedProject: "p",
	refreshSignal: 0,
	...over,
})

describe("CrawlsCard", () => {
	beforeEach(() => {
		mocks.listCrawls.mockReset()
		mocks.refreshCrawl.mockReset()
		mocks.deleteCrawl.mockReset()
		mocks.getTask.mockReset()
	})

	it("renders rows from listCrawls", async () => {
		mocks.listCrawls.mockResolvedValue(resp as any)
		render(<CrawlsCard {...baseProps()} />)
		await waitFor(() => expect(screen.getByText("https://example.com")).toBeInTheDocument())
		expect(screen.getByText("https://docs.example.com")).toBeInTheDocument()
		expect(screen.getAllByText("Delete").length).toBe(2)
	})

	it("shows empty state when there are no crawls", async () => {
		mocks.listCrawls.mockResolvedValue({ crawls: [] } as any)
		render(<CrawlsCard {...baseProps()} />)
		await waitFor(() => expect(screen.getByText(/no crawls yet/i)).toBeInTheDocument())
	})

	it("deletes a crawl after confirm and reloads", async () => {
		mocks.listCrawls.mockResolvedValue(resp as any)
		mocks.deleteCrawl.mockResolvedValue({ status: "deleted" })
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true)
		render(<CrawlsCard {...baseProps()} />)
		await waitFor(() => expect(screen.getByText("https://example.com")).toBeInTheDocument())
		expect(mocks.listCrawls).toHaveBeenCalledTimes(1)
		await userEvent.click(screen.getAllByText("Delete")[0])
		await waitFor(() => expect(mocks.deleteCrawl).toHaveBeenCalledTimes(1))
		expect(mocks.deleteCrawl).toHaveBeenCalledWith(expect.objectContaining({ project: "p", crawlId: "c1" }))
		await waitFor(() => expect(mocks.listCrawls).toHaveBeenCalledTimes(2))
		confirmSpy.mockRestore()
	})

	it("does not delete when confirm is cancelled", async () => {
		mocks.listCrawls.mockResolvedValue(resp as any)
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false)
		render(<CrawlsCard {...baseProps()} />)
		await waitFor(() => expect(screen.getByText("https://example.com")).toBeInTheDocument())
		await userEvent.click(screen.getAllByText("Delete")[0])
		expect(mocks.deleteCrawl).not.toHaveBeenCalled()
		expect(mocks.listCrawls).toHaveBeenCalledTimes(1)
		confirmSpy.mockRestore()
	})

	it("refresh polls getTask with the returned taskId and reloads on done", async () => {
		mocks.listCrawls.mockResolvedValue(resp as any)
		mocks.refreshCrawl.mockResolvedValue({ taskId: "t1" })
		mocks.getTask.mockResolvedValue({ status: "done", message: "", detail: "" })
		render(<CrawlsCard {...baseProps()} />)
		await waitFor(() => expect(screen.getByText("https://example.com")).toBeInTheDocument())
		expect(mocks.listCrawls).toHaveBeenCalledTimes(1)
		// header reload button is first; [1] is the first row's Refresh
		await userEvent.click(screen.getAllByRole("button", { name: "Refresh" })[1])
		await waitFor(() => expect(mocks.refreshCrawl).toHaveBeenCalledTimes(1))
		expect(mocks.refreshCrawl).toHaveBeenCalledWith(expect.objectContaining({ project: "p", crawlId: "c1" }))
		await waitFor(() =>
			expect(mocks.getTask).toHaveBeenCalledWith(expect.objectContaining({ serverUrl: "http://x", taskId: "t1" })),
		)
		// poll completes with done → reload
		await waitFor(() => expect(mocks.listCrawls).toHaveBeenCalledTimes(2))
	})

	it("refetches when the refresh signal changes", async () => {
		mocks.listCrawls.mockResolvedValue(resp as any)
		const { rerender } = render(<CrawlsCard {...baseProps()} />)
		await waitFor(() => expect(screen.getByText("https://example.com")).toBeInTheDocument())
		expect(mocks.listCrawls).toHaveBeenCalledTimes(1)
		rerender(<CrawlsCard {...baseProps({ refreshSignal: 1 })} />)
		await waitFor(() => expect(mocks.listCrawls).toHaveBeenCalledTimes(2))
	})
})
