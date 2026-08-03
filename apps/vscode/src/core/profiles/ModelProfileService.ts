import { randomUUID } from "node:crypto"
import * as path from "node:path"
import { getGlobalProfilesFilePath, writeJsonConfigFileAtomic } from "@core/storage/disk"
import { readJsonConfigFile } from "@core/storage/readJsonConfig"
import type { ModelProfile, ProfilesFile } from "./types"

type Layer = "global" | "workspace"

function emptyProfilesFile(): ProfilesFile {
	return { activeProfileId: "", profiles: [] }
}

function isModelProfile(value: unknown): value is ModelProfile {
	if (!value || typeof value !== "object") {
		return false
	}
	const profile = value as Record<string, unknown>
	return ["id", "name", "baseUrl", "modelId", "apiKey"].every((key) => typeof profile[key] === "string")
}

function isProfilesFile(value: unknown): value is ProfilesFile {
	if (!value || typeof value !== "object") {
		return false
	}
	const file = value as Record<string, unknown>
	return typeof file.activeProfileId === "string" && Array.isArray(file.profiles) && file.profiles.every(isModelProfile)
}

export class ModelProfileService {
	private readonly workspaceFile?: string

	constructor(workspacePath?: string) {
		this.workspaceFile = workspacePath ? path.join(workspacePath, ".cellockai", "profiles.json") : undefined
	}

	private globalFile(): string {
		return getGlobalProfilesFilePath()
	}

	private async readLayer(file: string): Promise<ProfilesFile | undefined> {
		const data = await readJsonConfigFile<unknown>(file)
		return isProfilesFile(data) ? data : undefined
	}

	/** Merge global + workspace profiles, with workspace collisions fully replacing global profiles. */
	async loadMerged(): Promise<{
		merged: ProfilesFile
		owners: Map<string, Layer>
		global: ProfilesFile
		workspace?: ProfilesFile
	}> {
		const global = (await this.readLayer(this.globalFile())) ?? emptyProfilesFile()
		const workspace = this.workspaceFile ? await this.readLayer(this.workspaceFile) : undefined
		const owners = new Map<string, Layer>()
		const byId = new Map<string, ModelProfile>()

		for (const profile of global.profiles) {
			owners.set(profile.id, "global")
			byId.set(profile.id, profile)
		}
		for (const profile of workspace?.profiles ?? []) {
			owners.set(profile.id, "workspace")
			byId.set(profile.id, profile)
		}

		const profiles = [...byId.values()]
		const valid = (id: string | undefined): id is string => id != null && byId.has(id)
		const activeProfileId = valid(workspace?.activeProfileId)
			? workspace.activeProfileId
			: valid(global.activeProfileId)
				? global.activeProfileId
				: (profiles[0]?.id ?? "")

		return { merged: { activeProfileId, profiles }, owners, global, workspace }
	}

	async getProfiles(): Promise<ModelProfile[]> {
		return (await this.loadMerged()).merged.profiles
	}

	async getActiveProfile(): Promise<ModelProfile | undefined> {
		const { merged } = await this.loadMerged()
		return merged.profiles.find((profile) => profile.id === merged.activeProfileId)
	}

	async addProfile(input: Omit<ModelProfile, "id">): Promise<ModelProfile> {
		const profile: ModelProfile = { id: randomUUID(), ...input }
		const file = this.globalFile()
		const data = (await this.readLayer(file)) ?? emptyProfilesFile()
		data.profiles.push(profile)
		await writeJsonConfigFileAtomic(file, data)
		return profile
	}

	async updateProfile(id: string, patch: Partial<Omit<ModelProfile, "id">>): Promise<void> {
		const { owners } = await this.loadMerged()
		const layer = owners.get(id)
		if (!layer) {
			throw new Error(`Profile ${id} not found`)
		}
		const file = layer === "workspace" ? this.workspaceFile! : this.globalFile()
		const data = await this.readLayer(file)
		const index = data?.profiles.findIndex((profile) => profile.id === id) ?? -1
		if (!data || index < 0) {
			throw new Error(`Profile ${id} not found`)
		}
		data.profiles[index] = { ...data.profiles[index], ...patch }
		await writeJsonConfigFileAtomic(file, data)
	}

	async deleteProfile(id: string): Promise<void> {
		const { owners } = await this.loadMerged()
		const layer = owners.get(id)
		if (!layer) {
			throw new Error(`Profile ${id} not found`)
		}
		const file = layer === "workspace" ? this.workspaceFile! : this.globalFile()
		const data = await this.readLayer(file)
		if (!data || !data.profiles.some((profile) => profile.id === id)) {
			throw new Error(`Profile ${id} not found`)
		}
		data.profiles = data.profiles.filter((profile) => profile.id !== id)
		if (data.activeProfileId === id) {
			data.activeProfileId = data.profiles[0]?.id ?? ""
		}
		await writeJsonConfigFileAtomic(file, data)
	}

	async setActiveProfile(id: string): Promise<void> {
		const { owners } = await this.loadMerged()
		const layer = owners.get(id)
		if (!layer) {
			throw new Error(`Profile ${id} not found`)
		}
		const file = layer === "workspace" ? this.workspaceFile! : this.globalFile()
		const data = await this.readLayer(file)
		if (!data || !data.profiles.some((profile) => profile.id === id)) {
			throw new Error(`Profile ${id} not found`)
		}
		data.activeProfileId = id
		await writeJsonConfigFileAtomic(file, data)
	}

	/** Map the active profile onto OpenAI-compatible apiConfiguration fields. */
	async toApiConfiguration(): Promise<Record<string, unknown>> {
		const profile = await this.getActiveProfile()
		if (!profile) {
			return {}
		}
		return {
			apiProvider: "openai",
			openAiBaseUrl: profile.baseUrl,
			openAiApiKey: profile.apiKey,
			planModeApiProvider: "openai",
			actModeApiProvider: "openai",
			planModeOpenAiModelId: profile.modelId,
			actModeOpenAiModelId: profile.modelId,
		}
	}
}
