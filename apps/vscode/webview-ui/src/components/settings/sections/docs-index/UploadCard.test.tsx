import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import UploadCard from "./UploadCard"

const mocks = vi.hoisted(() => ({
	uploadFile: vi.fn(),
	getTask: vi.fn(),
}))

vi.mock("@/services/grpc-client", () => ({
	DocsIndexServiceClient: {
		uploadFile: mocks.uploadFile,
		getTask: mocks.getTask,
	},
}))

const baseProps = (over: Record<string, unknown> = {}) => ({
	serverUrl: "http://x",
	connected: true,
	selectedProject: "p",
	onUploaded: vi.fn(),
	...over,
})

describe("UploadCard", () => {
	beforeEach(() => {
		mocks.uploadFile.mockReset()
		mocks.getTask.mockReset()
	})

	it("polls until indexing completes, then calls onUploaded only once", async () => {
		const onUploaded = vi.fn()
		mocks.uploadFile.mockResolvedValue({ taskId: "task-1", status: "accepted" } as any)
		// runs first, then succeeds on the next poll
		mocks.getTask.mockResolvedValueOnce({ status: "running" } as any).mockResolvedValueOnce({ status: "done" } as any)
		render(<UploadCard {...baseProps({ onUploaded })} />)
		await userEvent.click(screen.getByText("Upload File"))
		// polls every 1s, so allow past the first poll interval
		await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1), { timeout: 3000 })
		// stopped polling once the task was done (running + done = 2 calls, no more)
		expect(mocks.getTask.mock.calls.length).toBe(2)
	})

	it("does not call onUploaded when upload has no task id", async () => {
		const onUploaded = vi.fn()
		mocks.uploadFile.mockResolvedValue({ taskId: "", status: "error" } as any)
		render(<UploadCard {...baseProps({ onUploaded })} />)
		await userEvent.click(screen.getByText("Upload File"))
		await waitFor(() => expect(onUploaded).not.toHaveBeenCalled())
		expect(mocks.getTask).not.toHaveBeenCalled()
	})
})
