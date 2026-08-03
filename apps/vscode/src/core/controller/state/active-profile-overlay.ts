import * as fsSync from "node:fs"
import * as path from "node:path"
import { getGlobalProfilesFilePath } from "@core/storage/disk"
import type { ApiConfiguration } from "@shared/api"

type ProfileLike = { id?: string; baseUrl?: string; modelId?: string; apiKey?: string }
type FileLike = { activeProfileId?: string; profiles?: ProfileLike[] }

function readLayerSync(file: string): FileLike | undefined {
	try {
		const content = fsSync.readFileSync(file, "utf8").trim()
		if (!content) return undefined
		return JSON.parse(content) as FileLike
	} catch {
		return undefined
	}
}

/**
 * Synchronously overlays the active model profile onto an API configuration.
 * Used at Task construction time (a sync context). Reads
 * ~/.cellockai/profiles.json as the global base and merges the active
 * workspace's <cwd>/.cellockai/profiles.json over it by id (workspace wins),
 * mirroring ModelProfileService.loadMerged() so the UI and task-time model
 * cannot diverge.
 */
export function overlayActiveProfile(apiConfiguration: ApiConfiguration, cwd: string | undefined): ApiConfiguration {
	const global = readLayerSync(getGlobalProfilesFilePath())
	const workspace = cwd ? readLayerSync(path.join(cwd, ".cellockai", "profiles.json")) : undefined

	const byId = new Map<string, ProfileLike>()
	if (global?.profiles) {
		for (const p of global.profiles) {
			if (p?.id) byId.set(p.id, p)
		}
	}
	if (workspace?.profiles) {
		for (const p of workspace.profiles) {
			if (p?.id) byId.set(p.id, p)
		}
	}
	if (byId.size === 0) {
		return apiConfiguration
	}

	const valid = (id: string | undefined): id is string => !!id && byId.has(id)
	const activeId = valid(workspace?.activeProfileId)
		? workspace!.activeProfileId!
		: valid(global?.activeProfileId)
			? global!.activeProfileId!
			: [...byId.keys()][0]
	const active = byId.get(activeId)!
	return {
		...apiConfiguration,
		openAiBaseUrl: active.baseUrl ?? apiConfiguration.openAiBaseUrl,
		openAiApiKey: active.apiKey ?? apiConfiguration.openAiApiKey,
		planModeApiProvider: "openai",
		actModeApiProvider: "openai",
		planModeOpenAiModelId: active.modelId ?? apiConfiguration.planModeOpenAiModelId,
		actModeOpenAiModelId: active.modelId ?? apiConfiguration.actModeOpenAiModelId,
	}
}
