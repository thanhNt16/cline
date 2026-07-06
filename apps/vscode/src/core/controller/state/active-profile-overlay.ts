import * as fsSync from "node:fs";
import * as path from "node:path";
import type { ApiConfiguration } from "@shared/api";

/**
 * Synchronously overlays the active workspace model profile onto an API
 * configuration. Used at Task construction time (a sync context) so the
 * profile's OpenAI-compatible fields win over the saved config.
 *
 * Non-fatal: if the workspace cwd is empty or the profiles file is missing or
 * unreadable, the original configuration is returned unchanged.
 */
export function overlayActiveProfile(
	apiConfiguration: ApiConfiguration,
	cwd: string | undefined,
): ApiConfiguration {
	if (!cwd) {
		return apiConfiguration;
	}
	const file = path.join(cwd, ".cellockai", "profiles.json");
	let parsed: {
		activeProfileId?: string;
		profiles?: Array<{
			id?: string;
			baseUrl?: string;
			modelId?: string;
			apiKey?: string;
		}>;
	};
	try {
		parsed = JSON.parse(fsSync.readFileSync(file, "utf8"));
	} catch {
		return apiConfiguration;
	}
	const profiles = parsed.profiles;
	if (!profiles || profiles.length === 0) {
		return apiConfiguration;
	}
	const active =
		profiles.find((p) => p.id === parsed.activeProfileId) ?? profiles[0];
	return {
		...apiConfiguration,
		openAiBaseUrl: active.baseUrl ?? apiConfiguration.openAiBaseUrl,
		openAiApiKey: active.apiKey ?? apiConfiguration.openAiApiKey,
		planModeApiProvider: "openai",
		actModeApiProvider: "openai",
		planModeOpenAiModelId:
			active.modelId ?? apiConfiguration.planModeOpenAiModelId,
		actModeOpenAiModelId:
			active.modelId ?? apiConfiguration.actModeOpenAiModelId,
	};
}
