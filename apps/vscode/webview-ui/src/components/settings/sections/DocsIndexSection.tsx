import { useCallback, useState } from "react"
import type { ProjectInfo } from "@shared/proto/cline/docs_index"
import ConnectionCard from "./docs-index/ConnectionCard"
import IndexCard from "./docs-index/IndexCard"
import ProjectsCard from "./docs-index/ProjectsCard"
import SearchCard from "./docs-index/SearchCard"
import ToolsCard from "./docs-index/ToolsCard"
import UploadCard from "./docs-index/UploadCard"

export const DocsIndexSection = () => {
	const [serverUrl, setServerUrl] = useState("http://localhost:20130")
	const [connected, setConnected] = useState(false)
	const [projects, setProjects] = useState<ProjectInfo[]>([])
	const [selectedProject, setSelectedProject] = useState("")

	const handleConnected = useCallback(() => {
		// ProjectsCard will auto-fetch when connected becomes true
	}, [])

	return (
		<div className="flex flex-col gap-6 px-4 py-3">
			<ConnectionCard
				serverUrl={serverUrl}
				setServerUrl={setServerUrl}
				connected={connected}
				setConnected={setConnected}
				onConnected={handleConnected}
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
