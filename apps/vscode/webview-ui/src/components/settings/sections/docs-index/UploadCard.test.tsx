import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import UploadCard from "./UploadCard"

const mocks = vi.hoisted(() => ({
	uploadFile: vi.fn(),
}))

vi.mock("@/services/grpc-client", () => ({
	DocsIndexServiceClient: {
		uploadFile: mocks.uploadFile,
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
	})

	it("calls onUploaded immediately after upload succeeds (regardless of indexing)", async () => {
		const onUploaded = vi.fn()
		mocks.uploadFile.mockResolvedValue({ taskId: "task-1", status: "accepted" } as any)
		render(<UploadCard {...baseProps({ onUploaded })} />)
		await userEvent.click(screen.getByText("Upload File"))
		await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1))
	})

	it("does not call onUploaded when upload has no task id", async () => {
		const onUploaded = vi.fn()
		mocks.uploadFile.mockResolvedValue({ taskId: "", status: "error" } as any)
		render(<UploadCard {...baseProps({ onUploaded })} />)
		await userEvent.click(screen.getByText("Upload File"))
		await waitFor(() => expect(onUploaded).not.toHaveBeenCalled())
	})
})
