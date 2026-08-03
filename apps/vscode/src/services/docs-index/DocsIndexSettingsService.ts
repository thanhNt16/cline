import { getGlobalDocsIndexSettingsFilePath, writeJsonConfigFileAtomic } from "@core/storage/disk"
import { readJsonConfigFile } from "@core/storage/readJsonConfig"
import { DEFAULT_SERVER_URL } from "./constants"

export interface DocsIndexSettings {
	serverUrl: string
	lastProjects: Record<string, string>
}

const DEFAULTS: DocsIndexSettings = { serverUrl: DEFAULT_SERVER_URL, lastProjects: {} }

export function isValidServerUrl(url: string): boolean {
	try {
		const parsed = new URL(url)
		return parsed.protocol === "http:" || parsed.protocol === "https:"
	} catch {
		return false
	}
}

export function selectProject(projectNames: string[], workspaceBasename: string, lastProject: string | undefined): string {
	if (projectNames.length === 0) return ""
	const matchingProject = projectNames.find((name) => name === workspaceBasename)
	if (matchingProject) return matchingProject
	if (lastProject && projectNames.includes(lastProject)) return lastProject
	return projectNames[0]
}

export class DocsIndexSettingsService {
	private file(): string {
		return getGlobalDocsIndexSettingsFilePath()
	}

	async get(): Promise<DocsIndexSettings> {
		const raw = await readJsonConfigFile<Partial<DocsIndexSettings>>(this.file())
		return {
			serverUrl: typeof raw?.serverUrl === "string" ? raw.serverUrl : DEFAULTS.serverUrl,
			lastProjects: raw?.lastProjects && typeof raw.lastProjects === "object" ? raw.lastProjects : {},
		}
	}

	async update(patch: Partial<DocsIndexSettings>): Promise<DocsIndexSettings> {
		if (patch.serverUrl !== undefined && !isValidServerUrl(patch.serverUrl)) {
			throw new Error(`Invalid server URL: ${patch.serverUrl}`)
		}
		const current = await this.get()
		const next = {
			serverUrl: patch.serverUrl != null ? patch.serverUrl : current.serverUrl,
			lastProjects: patch.lastProjects != null ? patch.lastProjects : current.lastProjects,
		}
		await writeJsonConfigFileAtomic(this.file(), next)
		return next
	}

	async setServerUrl(url: string): Promise<DocsIndexSettings> {
		return this.update({ serverUrl: url })
	}

	async setSelectedProject(workspacePath: string, project: string): Promise<DocsIndexSettings> {
		const current = await this.get()
		return this.update({ lastProjects: { ...current.lastProjects, [workspacePath]: project } })
	}
}
