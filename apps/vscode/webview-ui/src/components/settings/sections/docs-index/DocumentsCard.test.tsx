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

const doc = (source: string) => ({
	source,
	bytes: 100,
	pageCount: 3,
	chunkCount: 12,
	contentHash: "abc",
	url: "",
})

const resp = {
	documents: [doc("manual.pdf"), doc("guide.md")],
}

const manyResp = {
	documents: Array.from({ length: 7 }, (_, i) => doc(`document-${i + 1}.pdf`)),
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

	it("shows only the first 5 documents and loads more on demand", async () => {
		mocks.listDocuments.mockResolvedValue(manyResp as any)
		render(<DocumentsCard {...baseProps()} />)
		await waitFor(() => expect(screen.getByText("document-1.pdf")).toBeInTheDocument())
		for (const name of ["document-1.pdf", "document-5.pdf"]) {
			expect(screen.getByText(name)).toBeInTheDocument()
		}
		expect(screen.queryByText("document-6.pdf")).not.toBeInTheDocument()
		await userEvent.click(screen.getByText("Load more"))
		expect(screen.getByText("document-6.pdf")).toBeInTheDocument()
		expect(screen.getByText("document-7.pdf")).toBeInTheDocument()
		expect(screen.queryByText("Load more")).not.toBeInTheDocument()
	})

	it("filters documents by name via the search box", async () => {
		mocks.listDocuments.mockResolvedValue(resp as any)
		render(<DocumentsCard {...baseProps()} />)
		await waitFor(() => expect(screen.getByText("manual.pdf")).toBeInTheDocument())
		await userEvent.type(screen.getByPlaceholderText("Search by document name…"), "guide")
		expect(screen.getByText("guide.md")).toBeInTheDocument()
		expect(screen.queryByText("manual.pdf")).not.toBeInTheDocument()
	})

	it("shows a no-match message when search finds nothing", async () => {
		mocks.listDocuments.mockResolvedValue(resp as any)
		render(<DocumentsCard {...baseProps()} />)
		await waitFor(() => expect(screen.getByText("manual.pdf")).toBeInTheDocument())
		await userEvent.type(screen.getByPlaceholderText("Search by document name…"), "zzz")
		expect(screen.getByText(/no documents match/i)).toBeInTheDocument()
	})

	it("refetches the document list on refresh", async () => {
		mocks.listDocuments.mockResolvedValueOnce(resp as any).mockResolvedValueOnce(manyResp as any)
		render(<DocumentsCard {...baseProps()} />)
		await waitFor(() => expect(screen.getByText("manual.pdf")).toBeInTheDocument())
		expect(mocks.listDocuments).toHaveBeenCalledTimes(1)
		await userEvent.click(screen.getByText("Refresh"))
		await waitFor(() => expect(mocks.listDocuments).toHaveBeenCalledTimes(2))
		await waitFor(() => expect(screen.getByText("document-1.pdf")).toBeInTheDocument())
	})
})
