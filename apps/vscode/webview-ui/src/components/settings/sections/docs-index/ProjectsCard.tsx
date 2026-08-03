import { useCallback, useEffect, useState } from "react"
import {
	CreateProjectRequest,
	DeleteProjectRequest,
	ListProjectsRequest,
	type ProjectInfo,
	RenameProjectRequest,
	UpdateDocsIndexSettingsRequest,
} from "@shared/proto/cline/docs_index"
import { DocsIndexServiceClient } from "@/services/grpc-client"
import { selectProject } from "./selectProject"

interface ProjectsCardProps {
	serverUrl: string
	connected: boolean
	projects: ProjectInfo[]
	setProjects: (projects: ProjectInfo[]) => void
	selectedProject: string
	setSelectedProject: (project: string) => void
	workspacePath: string
	workspaceBasename: string
}

export default function ProjectsCard({
	serverUrl,
	connected,
	projects,
	setProjects,
	selectedProject,
	setSelectedProject,
	workspacePath,
	workspaceBasename,
}: ProjectsCardProps) {
	const [loading, setLoading] = useState(false)
	const [newProjectName, setNewProjectName] = useState("")
	const [creating, setCreating] = useState(false)
	const [renameValue, setRenameValue] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState("")
	// Native window.confirm() is unavailable in VS Code webviews (it returns false and
	// silently no-ops), so deletion is a two-step in-UI confirm: first click arms, the
	// second executes. Reset whenever the selection moves away from the armed project.
	const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

	useEffect(() => {
		setConfirmDelete(null)
	}, [selectedProject])

	// Persist the active project for this workspace under ~/.cellockai/docs_index.json.
	// Fire-and-forget: a failure must not block the UI.
	const persistSelectedProject = useCallback(
		(project: string) => {
			if (!workspacePath || !project) return
			DocsIndexServiceClient.updateDocsIndexSettings(
				UpdateDocsIndexSettingsRequest.create({ workspacePath, selectedProject: project }),
			).catch((err) => console.error("Failed to persist selected project:", err))
		},
		[workspacePath],
	)

	const refreshProjects = useCallback(async () => {
		if (!connected) return
		setLoading(true)
		try {
			const response = await DocsIndexServiceClient.listProjects(ListProjectsRequest.create({ serverUrl }))
			setProjects(response.projects ?? [])
			const names = (response.projects ?? []).map((p) => p.name)
			const choice = selectProject(names, workspaceBasename, selectedProject || undefined)
			if (choice && choice !== selectedProject) {
				setSelectedProject(choice)
				persistSelectedProject(choice)
			}
		} catch (err) {
			console.error("Failed to list projects:", err)
		} finally {
			setLoading(false)
		}
	}, [serverUrl, connected, setProjects, selectedProject, setSelectedProject, workspaceBasename, persistSelectedProject])

	const handleCreateProject = useCallback(async () => {
		if (!connected || !newProjectName.trim()) return
		setCreating(true)
		try {
			await DocsIndexServiceClient.createProject(
				CreateProjectRequest.create({ serverUrl, name: newProjectName.trim() }),
			)
			setNewProjectName("")
			await refreshProjects()
			setSelectedProject(newProjectName.trim())
			persistSelectedProject(newProjectName.trim())
		} catch (err) {
			console.error("Failed to create project:", err)
		} finally {
			setCreating(false)
		}
	}, [connected, newProjectName, serverUrl, refreshProjects, setSelectedProject, persistSelectedProject])

	useEffect(() => {
		if (connected) {
			refreshProjects()
		}
	}, [connected, refreshProjects])

	const handleRename = useCallback(async () => {
		const newName = (renameValue ?? "").trim()
		if (!connected || !selectedProject || !newName || newName === selectedProject) return
		setBusy(true)
		setError("")
		try {
			// The facade converts HTTP failures into status:"error" rather than
			// throwing, so a rejected promise is not the only failure path.
			const res = await DocsIndexServiceClient.renameProject(
				RenameProjectRequest.create({ serverUrl, project: selectedProject, newName }),
			)
			if (res.status !== "ok") {
				setError(res.error || `Rename failed for "${selectedProject}"`)
				return
			}
			setRenameValue(null)
			await refreshProjects()
			setSelectedProject(newName)
			persistSelectedProject(newName)
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err))
			console.error("Failed to rename project:", err)
		} finally {
			setBusy(false)
		}
	}, [connected, renameValue, selectedProject, serverUrl, refreshProjects, setSelectedProject, persistSelectedProject])

	const handleDelete = useCallback(async () => {
		if (!connected || !selectedProject) return
		// First click arms; the second (while armed) executes the deletion.
		if (confirmDelete !== selectedProject) {
			setConfirmDelete(selectedProject)
			return
		}
		setBusy(true)
		setError("")
		try {
			const res = await DocsIndexServiceClient.deleteProject(
				DeleteProjectRequest.create({ serverUrl, project: selectedProject }),
			)
			if (res.status !== "ok") {
				setError(res.error || `Delete failed for "${selectedProject}"`)
				return
			}
			setRenameValue(null)
			setConfirmDelete(null)
			// Clear first: if this was the last project, refreshProjects() has no
			// replacement to select and would leave a dangling selection.
			setSelectedProject("")
			await refreshProjects()
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err))
			console.error("Failed to delete project:", err)
		} finally {
			setBusy(false)
		}
	}, [connected, selectedProject, serverUrl, refreshProjects, setSelectedProject, confirmDelete])

	return (
		<div
			style={{
				border: "1px solid var(--vscode-panel-border)",
				borderRadius: "4px",
				padding: "12px 16px",
				opacity: connected ? 1 : 0.5,
			}}>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
				<div style={{ fontSize: "13px", fontWeight: 600 }}>Projects</div>
				<button
					onClick={refreshProjects}
					disabled={!connected || loading}
					style={{
						padding: "2px 8px",
						fontSize: "11px",
						cursor: !connected || loading ? "not-allowed" : "pointer",
						background: "var(--vscode-button-secondaryBackground)",
						color: "var(--vscode-button-secondaryForeground)",
						border: "none",
						borderRadius: "3px",
					}}>
					{loading ? "Loading..." : "Refresh"}
				</button>
			</div>
			<select
				value={selectedProject}
				onChange={(e) => {
					setSelectedProject(e.target.value)
					persistSelectedProject(e.target.value)
				}}
				disabled={!connected || projects.length === 0}
				style={{
					width: "100%",
					padding: "4px 8px",
					fontSize: "12px",
					background: "var(--vscode-dropdown-background)",
					color: "var(--vscode-dropdown-foreground)",
					border: "1px solid var(--vscode-dropdown-border)",
					borderRadius: "3px",
					marginBottom: "8px",
				}}>
				{projects.length === 0 && <option value="">No projects available</option>}
				{projects.map((p) => (
					<option key={p.name} value={p.name}>
						{p.name}
					</option>
				))}
			</select>
			<div style={{ display: "flex", gap: "4px", marginBottom: "8px" }}>
				<input
					type="text"
					value={newProjectName}
					onChange={(e) => setNewProjectName(e.target.value)}
					placeholder="New project name..."
					disabled={!connected}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							handleCreateProject()
						}
					}}
					style={{
						flex: 1,
						padding: "4px 8px",
						fontSize: "12px",
						background: "var(--vscode-input-background)",
						color: "var(--vscode-input-foreground)",
						border: "1px solid var(--vscode-input-border)",
						borderRadius: "3px",
					}}
				/>
				<button
					onClick={handleCreateProject}
					disabled={!connected || !newProjectName.trim() || creating}
					style={{
						padding: "4px 12px",
						fontSize: "12px",
						cursor: !connected || !newProjectName.trim() || creating ? "not-allowed" : "pointer",
						background: "var(--vscode-button-background)",
						color: "var(--vscode-button-foreground)",
						border: "none",
						borderRadius: "3px",
						opacity: !connected || !newProjectName.trim() || creating ? 0.5 : 1,
					}}>
					{creating ? "Creating..." : "Create"}
				</button>
			</div>
			{error && (
				<div style={{ fontSize: "11px", color: "var(--vscode-errorForeground)", marginBottom: "8px" }}>{error}</div>
			)}
			{connected && selectedProject && (
				<div
					style={{
						borderTop: "1px solid var(--vscode-panel-border)",
						paddingTop: "8px",
						marginTop: "4px",
					}}>
					<div
						style={{
							marginBottom: "6px",
							fontSize: "11px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						Selected: <code>{selectedProject}</code>
					</div>
					<div style={{ display: "flex", gap: "4px", marginBottom: "4px" }}>
						<button
							onClick={() => setRenameValue((v) => (v === null ? selectedProject : null))}
							disabled={busy}
							style={{
								flex: 1,
								padding: "3px 8px",
								fontSize: "11px",
								cursor: busy ? "not-allowed" : "pointer",
								background: "var(--vscode-button-secondaryBackground)",
								color: "var(--vscode-button-secondaryForeground)",
								border: "none",
								borderRadius: "3px",
							}}>
							{renameValue === null ? "Rename" : "Cancel"}
						</button>
						<button
							onClick={handleDelete}
							disabled={busy}
							style={{
								flex: 1,
								padding: "3px 8px",
								fontSize: "11px",
								cursor: busy ? "not-allowed" : "pointer",
								background: "var(--vscode-inputValidation-errorBackground)",
								color: "var(--vscode-errorForeground)",
								border: confirmDelete === selectedProject
									? "1px solid var(--vscode-errorForeground)"
									: "1px solid var(--vscode-inputValidation-errorBorder)",
								borderRadius: "3px",
							}}>
							{busy ? "Working..." : confirmDelete === selectedProject ? "Confirm delete" : "Delete"}
						</button>
					</div>
					{confirmDelete === selectedProject && (
						<div style={{ fontSize: "11px", color: "var(--vscode-errorForeground)", marginBottom: "6px" }}>
							Click “Confirm delete” to permanently remove “{selectedProject}” and all its documents. This cannot be undone.
						</div>
					)}
					{renameValue !== null && (
						<div style={{ display: "flex", gap: "4px" }}>
							<input
								type="text"
								value={renameValue}
								onChange={(e) => setRenameValue(e.target.value)}
								placeholder="New name..."
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										handleRename()
									}
									if (e.key === "Escape") {
										setRenameValue(null)
									}
								}}
								style={{
									flex: 1,
									padding: "4px 8px",
									fontSize: "12px",
									background: "var(--vscode-input-background)",
									color: "var(--vscode-input-foreground)",
									border: "1px solid var(--vscode-input-border)",
									borderRadius: "3px",
								}}
							/>
							<button
								onClick={handleRename}
								disabled={busy || !renameValue.trim() || renameValue.trim() === selectedProject}
								style={{
									padding: "4px 12px",
									fontSize: "12px",
									cursor:
										busy || !renameValue.trim() || renameValue.trim() === selectedProject
											? "not-allowed"
											: "pointer",
									background: "var(--vscode-button-background)",
									color: "var(--vscode-button-foreground)",
									border: "none",
									borderRadius: "3px",
									opacity:
										busy || !renameValue.trim() || renameValue.trim() === selectedProject ? 0.5 : 1,
								}}>
								{busy ? "Saving..." : "Save"}
							</button>
						</div>
					)}
				</div>
			)}
		</div>
	)
}
