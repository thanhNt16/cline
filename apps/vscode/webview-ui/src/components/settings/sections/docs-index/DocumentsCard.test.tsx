import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import DocumentsCard from "./DocumentsCard"

const mocks = vi.hoisted(() => ({
	listDocuments: vi.fn(),
}))

vi.mock("@/services/grpc-client", () => ({
	DocsIndexServiceClient: {
		listDocuments: mocks.listDocuments,
	},
}))

const openSpy = vi.spyOn(window, "open").mockReturnValue(null)

const resp = {
	documents: [
		{ source: "manual.pdf", bytes: 100, pageCount: 3, chunkCount: 12, contentHash: "abc", url: "" },
		{ source: "guide.md", bytes: 200, pageCount: 1, chunkCount: 5, contentHash: "def", url: "" },
	],
}

const baseProps = (over: Record<string, unknown> = {}) => ({
	serverUrl: "http://x",
	connected: true,
	selectedProject: "p",
	...over,
})

describe("DocumentsCard", () => {
	beforeEach(() => {
		openSpy.mockClear()
		mocks.listDocuments.mockReset()
	})

	it("lists documents for the selected project", async () => {
		mocks.listDocuments.mockResolvedValue(resp as any)
		render(<DocumentsCard {...baseProps()} />)
		await waitFor(() => expect(screen.getByText("manual.pdf")).toBeInTheDocument())
		expect(screen.getByText("guide.md")).toBeInTheDocument()
	})

	it("opens the download URL in a new tab", async () => {
		mocks.listDocuments.mockResolvedValue(resp as any)
		render(<DocumentsCard {...baseProps()} />)
		await waitFor(() => expect(screen.getAllByText("Download").length).toBeGreaterThan(0))
		await userEvent.click(screen.getAllByText("Download")[0])
		expect(openSpy).toHaveBeenCalledWith("http://x/projects/p/documents/manual.pdf/file", "_blank")
	})

	it("shows empty state when no documents", async () => {
		mocks.listDocuments.mockResolvedValue({ documents: [] } as any)
		render(<DocumentsCard {...baseProps()} />)
		await waitFor(() => expect(screen.getByText(/no documents/i)).toBeInTheDocument())
	})
})
