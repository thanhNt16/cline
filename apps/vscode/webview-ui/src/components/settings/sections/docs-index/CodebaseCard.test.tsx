import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import CodebaseCard from "./CodebaseCard"

const mocks = vi.hoisted(() => ({
	indexCodebase: vi.fn(),
	getTask: vi.fn(),
	startCodebaseWatch: vi.fn(),
	getCodebaseWatch: vi.fn(),
	stopCodebaseWatch: vi.fn(),
}))
vi.mock("@/services/grpc-client", () => ({
	DocsIndexServiceClient: {
		indexCodebase: mocks.indexCodebase,
		getTask: mocks.getTask,
		startCodebaseWatch: mocks.startCodebaseWatch,
		getCodebaseWatch: mocks.getCodebaseWatch,
		stopCodebaseWatch: mocks.stopCodebaseWatch,
	},
}))

const baseProps = (over: Record<string, unknown> = {}) => ({
	serverUrl: "http://x",
	connected: true,
	selectedProject: "myrepo",
	...over,
})

describe("CodebaseCard remote indexing", () => {
	beforeEach(() => {
		mocks.indexCodebase.mockReset()
		mocks.getTask.mockReset()
		mocks.startCodebaseWatch.mockReset()
		mocks.getCodebaseWatch.mockReset()
		mocks.stopCodebaseWatch.mockReset()
		// No watcher on mount.
		mocks.getCodebaseWatch.mockResolvedValue({ active: false })
	})

	it("posts the entered path and starts polling getTask", async () => {
		mocks.indexCodebase.mockResolvedValue({ status: "accepted", taskId: "task-1" })
		// First synchronous poll already reports done.
		mocks.getTask.mockResolvedValue({ status: "done", message: "indexed" })

		render(<CodebaseCard {...baseProps()} />)

		const input = screen.getByPlaceholderText("/absolute/path/on/server")
		fireEvent.change(input, { target: { value: "/srv/code" } })
		fireEvent.click(screen.getByText("Index"))

		await waitFor(() =>
			expect(mocks.indexCodebase).toHaveBeenCalledWith(
				expect.objectContaining({ project: "myrepo", path: "/srv/code" }),
			),
		)
		await waitFor(() => expect(mocks.getTask).toHaveBeenCalledWith(expect.objectContaining({ taskId: "task-1" })))
		await waitFor(() => expect(screen.getByText(/Done — indexed/)).toBeTruthy())
	})

	it("renders the server error inline when the index fails", async () => {
		mocks.indexCodebase.mockResolvedValue({ status: "error", error: "Path not found on server" })

		render(<CodebaseCard {...baseProps()} />)

		fireEvent.change(screen.getByPlaceholderText("/absolute/path/on/server"), { target: { value: "/bad" } })
		fireEvent.click(screen.getByText("Index"))

		await waitFor(() => expect(screen.getByText("Path not found on server")).toBeTruthy())
		expect(mocks.getTask).not.toHaveBeenCalled()
	})

	it("renders the watch toggle checked when the project is already watched", async () => {
		mocks.getCodebaseWatch.mockResolvedValue({
			active: true,
			path: "/srv/code",
			debounceSecs: 5,
			lastIndex: "2026-07-31T00:00:00Z",
		})

		render(<CodebaseCard {...baseProps()} />)

		await waitFor(() => expect(screen.getByText(/Watching: \/srv\/code/)).toBeTruthy())
		expect((screen.getAllByRole("checkbox")[0] as HTMLInputElement).checked).toBe(true)
	})
})

describe("CodebaseCard watcher toggle", () => {
	beforeEach(() => {
		mocks.indexCodebase.mockReset()
		mocks.getTask.mockReset()
		mocks.startCodebaseWatch.mockReset()
		mocks.getCodebaseWatch.mockReset()
		mocks.stopCodebaseWatch.mockReset()
	})

	it("calls stopCodebaseWatch when an active watcher is unchecked", async () => {
		// Start watched + a prior index task exists so canWatch is true.
		mocks.getCodebaseWatch.mockResolvedValue({ active: true, path: "/srv/code", debounceSecs: 5 })
		mocks.stopCodebaseWatch.mockResolvedValue({ active: false })

		render(<CodebaseCard {...baseProps()} />)

		await waitFor(() => expect(mocks.getCodebaseWatch).toHaveBeenCalled())
		const checkbox = screen.getAllByRole("checkbox")[0] as HTMLInputElement
		expect(checkbox.checked).toBe(true)

		fireEvent.click(checkbox)
		await waitFor(() =>
			expect(mocks.stopCodebaseWatch).toHaveBeenCalledWith(expect.objectContaining({ project: "myrepo" })),
		)
		// After stopping, the status read is re-asserted via the returned active:false.
		await waitFor(() => expect((screen.getAllByRole("checkbox")[0] as HTMLInputElement).checked).toBe(false))
	})

	it("disables the watcher until the project has been indexed", async () => {
		mocks.getCodebaseWatch.mockResolvedValue({ active: false })

		render(<CodebaseCard {...baseProps()} />)

		const checkbox = screen.getAllByRole("checkbox")[0] as HTMLInputElement
		expect(checkbox.disabled).toBe(true)
		expect(screen.getByText(/Index the project once before enabling/)).toBeTruthy()
		expect(mocks.startCodebaseWatch).not.toHaveBeenCalled()
	})
})
