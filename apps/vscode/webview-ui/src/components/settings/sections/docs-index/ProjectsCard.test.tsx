import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import ProjectsCard from "./ProjectsCard"

const mocks = vi.hoisted(() => ({
	listProjects: vi.fn(),
	updateDocsIndexSettings: vi.fn(),
	createProject: vi.fn(),
	renameProject: vi.fn(),
	deleteProject: vi.fn(),
}))
vi.mock("@/services/grpc-client", () => ({
	DocsIndexServiceClient: {
		listProjects: mocks.listProjects,
		updateDocsIndexSettings: mocks.updateDocsIndexSettings,
		createProject: mocks.createProject,
		renameProject: mocks.renameProject,
		deleteProject: mocks.deleteProject,
	},
}))

const baseProps = (over: Record<string, unknown> = {}) => ({
	serverUrl: "http://x",
	connected: true,
	projects: [],
	setProjects: vi.fn(),
	selectedProject: "",
	setSelectedProject: vi.fn(),
	workspacePath: "/dev/myrepo",
	workspaceBasename: "myrepo",
	...over,
})

describe("ProjectsCard auto-select + persist", () => {
	beforeEach(() => {
		mocks.listProjects.mockReset()
		mocks.updateDocsIndexSettings.mockReset()
		mocks.updateDocsIndexSettings.mockResolvedValue({})
		mocks.createProject.mockReset()
		mocks.renameProject.mockReset()
		mocks.deleteProject.mockReset()
	})

	it("selects the project matching the workspace basename", async () => {
		mocks.listProjects.mockResolvedValue({ projects: [{ name: "acme" }, { name: "myrepo" }] })
		const setSelectedProject = vi.fn()
		render(<ProjectsCard {...baseProps({ setSelectedProject })} />)
		await waitFor(() => expect(setSelectedProject).toHaveBeenCalledWith("myrepo"))
		expect(mocks.updateDocsIndexSettings).toHaveBeenCalledWith(
			expect.objectContaining({ workspacePath: "/dev/myrepo", selectedProject: "myrepo" }),
		)
	})

	it("keeps the already-selected last project when basename is absent (no overwrite call)", async () => {
		mocks.listProjects.mockResolvedValue({ projects: [{ name: "acme" }] })
		const setSelectedProject = vi.fn()
		render(<ProjectsCard {...baseProps({ selectedProject: "acme", setSelectedProject })} />)
		await waitFor(() => expect(mocks.listProjects).toHaveBeenCalled())
		// basename 'myrepo' absent; last 'acme' already selected -> selectProject
		// returns 'acme' which equals selectedProject, so no selection/persist call.
		expect(setSelectedProject).not.toHaveBeenCalled()
		expect(mocks.updateDocsIndexSettings).not.toHaveBeenCalled()
	})

	it("does not call listProjects while disconnected", async () => {
		render(<ProjectsCard {...baseProps({ connected: false })} />)
		// Give the mount effect a chance to run.
		await waitFor(() => expect(mocks.listProjects).not.toHaveBeenCalled())
	})
})

describe("ProjectsCard rename/delete", () => {
	beforeEach(() => {
		mocks.listProjects.mockReset()
		mocks.listProjects.mockResolvedValue({ projects: [{ name: "myrepo" }] })
		mocks.updateDocsIndexSettings.mockReset()
		mocks.updateDocsIndexSettings.mockResolvedValue({})
		mocks.createProject.mockReset()
		mocks.renameProject.mockReset()
		mocks.deleteProject.mockReset()
	})

	const selected = (over: Record<string, unknown> = {}) =>
		baseProps({ selectedProject: "myrepo", projects: [{ name: "myrepo" }], ...over })

	it("renames the selected project and reselects the new name", async () => {
		mocks.renameProject.mockResolvedValue({ status: "ok", project: "renamed" })
		const setSelectedProject = vi.fn()
		render(<ProjectsCard {...selected({ setSelectedProject })} />)

		fireEvent.click(screen.getByText("Rename"))
		fireEvent.change(screen.getByPlaceholderText("New name..."), { target: { value: "renamed" } })
		fireEvent.click(screen.getByText("Save"))

		await waitFor(() =>
			expect(mocks.renameProject).toHaveBeenCalledWith(
				expect.objectContaining({ project: "myrepo", newName: "renamed" }),
			),
		)
		await waitFor(() => expect(setSelectedProject).toHaveBeenCalledWith("renamed"))
		expect(mocks.updateDocsIndexSettings).toHaveBeenCalledWith(
			expect.objectContaining({ workspacePath: "/dev/myrepo", selectedProject: "renamed" }),
		)
	})

	it("shows the server error and keeps the old name when rename fails", async () => {
		mocks.renameProject.mockResolvedValue({ status: "error", project: "myrepo", error: "Target already exists" })
		const setSelectedProject = vi.fn()
		render(<ProjectsCard {...selected({ setSelectedProject })} />)

		fireEvent.click(screen.getByText("Rename"))
		fireEvent.change(screen.getByPlaceholderText("New name..."), { target: { value: "taken" } })
		fireEvent.click(screen.getByText("Save"))

		await waitFor(() => expect(screen.getByText("Target already exists")).toBeTruthy())
		expect(setSelectedProject).not.toHaveBeenCalledWith("taken")
	})

	it("deletes after a two-step confirm and clears the selection", async () => {
		mocks.deleteProject.mockResolvedValue({ status: "ok", project: "myrepo" })
		const setSelectedProject = vi.fn()
		render(<ProjectsCard {...selected({ setSelectedProject })} />)

		// First click arms (native confirm is unavailable in webviews, so there is no
		// window.confirm call to make).
		fireEvent.click(screen.getByText("Delete"))
		expect(mocks.deleteProject).not.toHaveBeenCalled()

		await waitFor(() => expect(screen.getByText("Confirm delete")).toBeTruthy())
		fireEvent.click(screen.getByText("Confirm delete"))

		await waitFor(() => expect(mocks.deleteProject).toHaveBeenCalledWith(expect.objectContaining({ project: "myrepo" })))
		await waitFor(() => expect(setSelectedProject).toHaveBeenCalledWith(""))
	})

	it("does not delete when only the arming click happens", async () => {
		render(<ProjectsCard {...selected()} />)

		fireEvent.click(screen.getByText("Delete"))

		await waitFor(() => expect(screen.getByText("Confirm delete")).toBeTruthy())
		expect(mocks.deleteProject).not.toHaveBeenCalled()
	})
})
