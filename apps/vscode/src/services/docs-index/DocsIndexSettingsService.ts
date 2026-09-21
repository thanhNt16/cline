import {
	getGlobalDocsIndexSettingsFilePath,
	getProjectDocsIndexSettingsFilePath,
	writeJsonConfigFileAtomic,
} from "@core/storage/disk"
import { readJsonConfigFile } from "@core/storage/readJsonConfig"
import { DEFAULT_SERVER_URL } from "./constants"

export interface DocsIndexSettings {
	serverUrl: string
	lastProjects: Record<string, string>
	crawlMaxDepth: number
	crawlMaxPages: number
}

const DEFAULTS: DocsIndexSettings = {
	serverUrl: DEFAULT_SERVER_URL,
	lastProjects: {},
	crawlMaxDepth: 3,
	crawlMaxPages: 50,
}

const numOrDefault = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d)

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
	/**
	 * CellockAI: project-scoped docindex config. Reads MERGE the global
	 * ~/.cellockai/docs_index.json (base) with <workspace>/.cellockai/docs_index.json
	 * (override — workspace wins per key). Writes go to the workspace file so each
	 * project carries its own serverUrl + selected project. When no workspace is
	 * open, getProjectDocsIndexSettingsFilePath() falls back to the global path,
	 * preserving the original single-file behavior.
	 */
	async get(): Promise<DocsIndexSettings> {
		const globalRaw = await readJsonConfigFile<Partial<DocsIndexSettings>>(getGlobalDocsIndexSettingsFilePath())
		const serverUrl = typeof globalRaw?.serverUrl === "string" ? globalRaw.serverUrl : DEFAULTS.serverUrl
		const lastProjects =
			globalRaw?.lastProjects && typeof globalRaw.lastProjects === "object" ? { ...globalRaw.lastProjects } : {}

		const wsPath = await getProjectDocsIndexSettingsFilePath()
		if (wsPath !== getGlobalDocsIndexSettingsFilePath()) {
			const wsRaw = await readJsonConfigFile<Partial<DocsIndexSettings>>(wsPath)
			if (wsRaw) {
				if (wsRaw.lastProjects && typeof wsRaw.lastProjects === "object") {
					Object.assign(lastProjects, wsRaw.lastProjects)
				}
				return {
					serverUrl: typeof wsRaw.serverUrl === "string" ? wsRaw.serverUrl : serverUrl,
					lastProjects,
					crawlMaxDepth: numOrDefault(wsRaw.crawlMaxDepth, DEFAULTS.crawlMaxDepth),
					crawlMaxPages: numOrDefault(wsRaw.crawlMaxPages, DEFAULTS.crawlMaxPages),
				}
			}
		}
		return {
			serverUrl,
			lastProjects,
			crawlMaxDepth: DEFAULTS.crawlMaxDepth,
			crawlMaxPages: DEFAULTS.crawlMaxPages,
		}
	}

	async update(patch: Partial<DocsIndexSettings>): Promise<DocsIndexSettings> {
		if (patch.serverUrl !== undefined && !isValidServerUrl(patch.serverUrl)) {
			throw new Error(`Invalid server URL: ${patch.serverUrl}`)
		}
		const globalPath = getGlobalDocsIndexSettingsFilePath()
		const wsPath = await getProjectDocsIndexSettingsFilePath()
		if (wsPath !== globalPath) {
			// Project-scoped write: merge the patch onto the WORKSPACE file only,
			// so the workspace file holds just this project's keys and never shadows
			// the global file's other-workspace entries with stale copies.
			const wsRaw = await readJsonConfigFile<Partial<DocsIndexSettings>>(wsPath)
			const next: DocsIndexSettings = {
				serverUrl:
					patch.serverUrl != null
						? patch.serverUrl
						: typeof wsRaw?.serverUrl === "string"
							? wsRaw.serverUrl
							: DEFAULTS.serverUrl,
				lastProjects: { ...(wsRaw?.lastProjects ?? {}), ...(patch.lastProjects ?? {}) },
				crawlMaxDepth:
					patch.crawlMaxDepth != null
						? patch.crawlMaxDepth
						: numOrDefault(wsRaw?.crawlMaxDepth, DEFAULTS.crawlMaxDepth),
				crawlMaxPages:
					patch.crawlMaxPages != null
						? patch.crawlMaxPages
						: numOrDefault(wsRaw?.crawlMaxPages, DEFAULTS.crawlMaxPages),
			}
			await writeJsonConfigFileAtomic(wsPath, next)
		} else {
			// No workspace open → write the global file (original behavior).
			const current = await this.get()
			const next: DocsIndexSettings = {
				serverUrl: patch.serverUrl != null ? patch.serverUrl : current.serverUrl,
				lastProjects:
					patch.lastProjects != null ? { ...current.lastProjects, ...patch.lastProjects } : current.lastProjects,
				crawlMaxDepth: patch.crawlMaxDepth != null ? patch.crawlMaxDepth : current.crawlMaxDepth,
				crawlMaxPages: patch.crawlMaxPages != null ? patch.crawlMaxPages : current.crawlMaxPages,
			}
			await writeJsonConfigFileAtomic(globalPath, next)
		}
		return this.get()
	}

	async setServerUrl(url: string): Promise<DocsIndexSettings> {
		return this.update({ serverUrl: url })
	}

	async setSelectedProject(workspacePath: string, project: string): Promise<DocsIndexSettings> {
		return this.update({ lastProjects: { [workspacePath]: project } })
	}
}
