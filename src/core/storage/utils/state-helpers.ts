import { ApiProvider } from "@shared/api"
import type { ClineFileStorage } from "@shared/storage/ClineFileStorage"
import {
	applyTransform,
	GlobalStateAndSettingKeys,
	GlobalStateAndSettings,
	getDefaultValue,
	isAsyncProperty,
	isComputedProperty,
	LocalState,
	LocalStateKeys,
	SecretKeys,
	Secrets,
} from "@shared/storage/state-keys"
import { Logger } from "@/shared/services/Logger"
import { ClineMemento } from "@/shared/storage"
import { readSessions, readTaskHistoryFromState } from "../disk"
import { StateManager } from "../StateManager"

// ─── File-backed storage readers (used by StateManager) ────────────────────

/**
 * Read secrets from a ClineFileStorage instance.
 */
export function readSecretsFromStorage(store: ClineFileStorage<string>): Secrets {
	return SecretKeys.reduce((acc, key) => {
		acc[key] = store.get(key)
		return acc
	}, {} as Secrets)
}

/**
 * Read workspace state from a ClineFileStorage instance.
 */
export function readWorkspaceStateFromStorage(store: ClineFileStorage): LocalState {
	return LocalStateKeys.reduce((acc, key) => {
		acc[key] = store.get(key) || {}
		return acc
	}, {} as LocalState)
}

/**
 * Read global state from a ClineFileStorage instance.
 * @param workspacePath When provided, task history is loaded from {workspace}/.cellockai/
 */
export async function readGlobalStateFromStorage(store: ClineMemento, workspacePath?: string): Promise<GlobalStateAndSettings> {
	try {
		// Batch read all state values in a single optimized pass
		const stateValues = new Map<string, any>()
		for (const key of GlobalStateAndSettingKeys) {
			const value = store.get(key as string)
			stateValues.set(key, value)
		}

		const result = {} as any

		for (const key of GlobalStateAndSettingKeys) {
			const stateKey = key as keyof GlobalStateAndSettings
			let value = stateValues.get(stateKey)

			if (isAsyncProperty(stateKey)) {
				continue
			}
			if (isComputedProperty(stateKey)) {
				continue
			}
			if (value === undefined) {
				const defaultValue = getDefaultValue(stateKey)
				if (defaultValue !== undefined) {
					value = defaultValue
				}
			}
			if (value !== undefined) {
				value = applyTransform(stateKey, value)
			}
			result[stateKey] = value
		}

		await handleComputedProperties(result, stateValues)
		await handleAsyncProperties(result, workspacePath)

		return result as GlobalStateAndSettings
	} catch (error) {
		Logger.error("[StateHelpers] Failed to read global state from storage:", error)
		throw error
	}
}

// ─── Legacy readers (for VSCode migration — reads from ExtensionContext) ────

/**
 * Handle properties that require computed logic
 */
async function handleComputedProperties(result: any, stateValues: Map<string, any>): Promise<void> {
	// 1. API Provider logic - set defaults based on existing values
	const defaultApiProvider: ApiProvider = "openrouter"
	result.planModeApiProvider = result.planModeApiProvider || defaultApiProvider
	result.actModeApiProvider = result.actModeApiProvider || defaultApiProvider

	// 2. Plan/Act separate models setting with special logic
	const planActSeparateModelsSettingRaw = stateValues.get("planActSeparateModelsSetting")
	if (planActSeparateModelsSettingRaw === true || planActSeparateModelsSettingRaw === false) {
		result.planActSeparateModelsSetting = planActSeparateModelsSettingRaw
	} else {
		// Default to false when not explicitly set
		result.planActSeparateModelsSetting = false
	}
}

/**
 * Handle properties that require async operations.
 * When workspacePath is provided, history is read from {workspace}/.cellockai/.
 * On first use of a workspace (no history file yet), any existing global history
 * items matching the workspace are migrated to the workspace-scoped file.
 */
async function handleAsyncProperties(result: any, workspacePath?: string): Promise<void> {
	if (!workspacePath) {
		result.taskHistory = await readTaskHistoryFromState()
		result.sessions = await readSessions()
		return
	}

	const workspaceHistory = await readTaskHistoryFromState(workspacePath)

	if (workspaceHistory.length === 0 && !(await import("../disk").then((d) => d.taskHistoryStateFileExists(workspacePath)))) {
		// First time opening this workspace — migrate matching items from global history
		try {
			const globalHistory = await readTaskHistoryFromState()
			const { arePathsEqual } = await import("../../../utils/path")
			const migrated = globalHistory.filter(
				(item) =>
					(item.cwdOnTaskInitialization && arePathsEqual(item.cwdOnTaskInitialization, workspacePath)) ||
					(item.shadowGitConfigWorkTree && arePathsEqual(item.shadowGitConfigWorkTree, workspacePath)),
			)
			if (migrated.length > 0) {
				await (await import("../disk")).writeTaskHistoryToState(migrated, workspacePath)
				result.taskHistory = migrated
				// Also create sessions from migrated history
				const sessionItems = migrated.slice(0, 3).map((item: any) => ({
					id: item.id,
					task: item.task,
					ts: item.ts,
					isFavorited: item.isFavorited,
				}))
				await (await import("../disk")).writeSessions(sessionItems, workspacePath)
				result.sessions = sessionItems
				return
			}
		} catch (err) {
			Logger.warn("[StateHelpers] Failed to migrate global history to workspace:", err)
		}
	}

	result.taskHistory = workspaceHistory

	// Also load sessions for this workspace
	const workspaceSessions = await readSessions(workspacePath)
	result.sessions = workspaceSessions
}

export async function resetWorkspaceState() {
	const stateManager = StateManager.get()
	LocalStateKeys.map((key) => stateManager.setWorkspaceState(key, {}))
	await stateManager.reInitialize()
}

export async function resetGlobalState() {
	// TODO: Reset all workspace states?
	const stateManager = StateManager.get()
	GlobalStateAndSettingKeys.map((key) => stateManager.setGlobalState(key, undefined))
	SecretKeys.map((key) => stateManager.setSecret(key, undefined))
	await stateManager.reInitialize()
}
