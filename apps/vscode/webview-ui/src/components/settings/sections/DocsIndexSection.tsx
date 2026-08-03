import type { ProjectInfo } from "@shared/proto/cline/docs_index"
import { useState } from "react"
import CodebaseCard from "./docs-index/CodebaseCard"
import ConnectionCard from "./docs-index/ConnectionCard"
import DocumentsCard from "./docs-index/DocumentsCard"
import IndexBatchCard from "./docs-index/IndexBatchCard"
import IndexCard from "./docs-index/IndexCard"
import ProjectsCard from "./docs-index/ProjectsCard"
import SearchCard from "./docs-index/SearchCard"
import TaskInspectorCard from "./docs-index/TaskInspectorCard"
import ToolsCard from "./docs-index/ToolsCard"
import UploadCard from "./docs-index/UploadCard"

interface DocsIndexSectionProps {
	serverUrl: string
	setServerUrl: (url: string) => void
	connected: boolean
	setConnected: (connected: boolean) => void
	projects: ProjectInfo[]
	setProjects: (projects: ProjectInfo[]) => void
	selectedProject: string
	setSelectedProject: (project: string) => void
	workspacePath: string
	workspaceBasename: string
}

export const DocsIndexSection = ({
	serverUrl,
	setServerUrl,
	connected,
	setConnected,
	projects,
	setProjects,
	selectedProject,
	setSelectedProject,
	workspacePath,
	workspaceBasename,
}: DocsIndexSectionProps) => {
	const [refreshSignal, setRefreshSignal] = useState(0)

	return (
		<div className="flex flex-col gap-6 px-4 py-3">
			<ConnectionCard
				connected={connected}
				onConnected={() => {}}
				serverUrl={serverUrl}
				setConnected={setConnected}
				setServerUrl={setServerUrl}
			/>
			<ProjectsCard
				connected={connected}
				projects={projects}
				selectedProject={selectedProject}
				serverUrl={serverUrl}
				setProjects={setProjects}
				setSelectedProject={setSelectedProject}
				workspaceBasename={workspaceBasename}
				workspacePath={workspacePath}
			/>
			<DocumentsCard
				connected={connected}
				refreshSignal={refreshSignal}
				selectedProject={selectedProject}
				serverUrl={serverUrl}
			/>
			<UploadCard
				connected={connected}
				onUploaded={() => setRefreshSignal((n) => n + 1)}
				selectedProject={selectedProject}
				serverUrl={serverUrl}
			/>
			<IndexBatchCard connected={connected} selectedProject={selectedProject} serverUrl={serverUrl} />
			<IndexCard connected={connected} selectedProject={selectedProject} serverUrl={serverUrl} />
			<CodebaseCard connected={connected} selectedProject={selectedProject} serverUrl={serverUrl} />
			<SearchCard connected={connected} selectedProject={selectedProject} serverUrl={serverUrl} />
			<TaskInspectorCard connected={connected} serverUrl={serverUrl} />
			<ToolsCard connected={connected} serverUrl={serverUrl} />
		</div>
	)
}

export default DocsIndexSection
