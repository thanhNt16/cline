import type { ProjectInfo } from "@shared/proto/cline/docs_index"
import ConnectionCard from "./docs-index/ConnectionCard"
import DocumentsCard from "./docs-index/DocumentsCard"
import IndexCard from "./docs-index/IndexCard"
import ProjectsCard from "./docs-index/ProjectsCard"
import SearchCard from "./docs-index/SearchCard"
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
}: DocsIndexSectionProps) => {
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
			/>
			<DocumentsCard connected={connected} selectedProject={selectedProject} serverUrl={serverUrl} />
			<UploadCard connected={connected} selectedProject={selectedProject} serverUrl={serverUrl} />
			<IndexCard connected={connected} selectedProject={selectedProject} serverUrl={serverUrl} />
			<SearchCard connected={connected} selectedProject={selectedProject} serverUrl={serverUrl} />
			<ToolsCard />
		</div>
	)
}

export default DocsIndexSection
