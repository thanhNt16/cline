import { useCallback, useEffect, useState } from "react"
import {
	CreateProjectRequest,
	ListProjectsRequest,
	type ProjectInfo,
} from "@shared/proto/cline/docs_index"
import { DocsIndexServiceClient } from "@/services/grpc-client"

interface ProjectsCardProps {
	serverUrl: string
	connected: boolean
	projects: ProjectInfo[]
	setProjects: (projects: ProjectInfo[]) => void
	selectedProject: string
	setSelectedProject: (project: string) => void
}

export default function ProjectsCard({
	serverUrl,
	connected,
	projects,
	setProjects,
	selectedProject,
	setSelectedProject,
}: ProjectsCardProps) {
	const [loading, setLoading] = useState(false)
	const [newProjectName, setNewProjectName] = useState("")
	const [creating, setCreating] = useState(false)

	const refreshProjects = useCallback(async () => {
		if (!connected) return
		setLoading(true)
		try {
			const response = await DocsIndexServiceClient.listProjects(ListProjectsRequest.create({ serverUrl }))
			setProjects(response.projects ?? [])
			if (response.projects.length > 0 && !selectedProject) {
				setSelectedProject(response.projects[0].name)
			}
		} catch (err) {
			console.error("Failed to list projects:", err)
		} finally {
			setLoading(false)
		}
	}, [serverUrl, connected, setProjects, selectedProject, setSelectedProject])

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
		} catch (err) {
			console.error("Failed to create project:", err)
		} finally {
			setCreating(false)
		}
	}, [connected, newProjectName, serverUrl, refreshProjects, setSelectedProject])

	useEffect(() => {
		if (connected) {
			refreshProjects()
		}
	}, [connected, refreshProjects])

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
				onChange={(e) => setSelectedProject(e.target.value)}
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
		</div>
	)
}
