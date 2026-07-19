import type { ProjectInfo } from "@shared/proto/cline/docs_index"
import ConnectionCard from "./docs-index/ConnectionCard"
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
				serverUrl={serverUrl}
				setServerUrl={setServerUrl}
				connected={connected}
				setConnected={setConnected}
				onConnected={() => {}}
			/>
			<ProjectsCard
				serverUrl={serverUrl}
				connected={connected}
				projects={projects}
				setProjects={setProjects}
				selectedProject={selectedProject}
				setSelectedProject={setSelectedProject}
			/>
			<UploadCard serverUrl={serverUrl} connected={connected} selectedProject={selectedProject} />
			<IndexCard serverUrl={serverUrl} connected={connected} selectedProject={selectedProject} />
			<SearchCard serverUrl={serverUrl} connected={connected} selectedProject={selectedProject} />
			<ToolsCard />
		</div>
	)
}

export default DocsIndexSection
