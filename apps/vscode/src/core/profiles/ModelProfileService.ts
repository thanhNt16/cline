import { randomUUID } from "node:crypto"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import {
	CELLOCKAI_DEFAULT_BASE_URL,
	CELLOCKAI_DEFAULT_MODEL_ID,
	CELLOCKAI_DEFAULT_PROFILE_NAME,
	getDefaultApiKey,
} from "@/config/cellockaiDefaults"
import type { ModelProfile, ProfilesFile } from "./types"

export class ModelProfileService {
	private readonly dir: string
	private readonly file: string

	constructor(private readonly cwd: string) {
		this.dir = path.join(cwd, ".cellockai")
		this.file = path.join(this.dir, "profiles.json")
	}

	private buildDefault(): ProfilesFile {
		const profile: ModelProfile = {
			id: randomUUID(),
			name: CELLOCKAI_DEFAULT_PROFILE_NAME,
			baseUrl: CELLOCKAI_DEFAULT_BASE_URL,
			modelId: CELLOCKAI_DEFAULT_MODEL_ID,
			apiKey: getDefaultApiKey(),
		}
		return { activeProfileId: profile.id, profiles: [profile] }
	}

	private async load(): Promise<ProfilesFile> {
		try {
			const raw = await fs.readFile(this.file, "utf8")
			const parsed = JSON.parse(raw) as ProfilesFile
			if (parsed?.profiles?.length) {
				return parsed
			}
		} catch {
			// fall through to seeding
		}
		const seeded = this.buildDefault()
		await this.save(seeded)
		return seeded
	}

	private async save(data: ProfilesFile): Promise<void> {
		await fs.mkdir(this.dir, { recursive: true })
		await fs.writeFile(this.file, JSON.stringify(data, null, 2), "utf8")
	}

	async getProfiles(): Promise<ModelProfile[]> {
		return (await this.load()).profiles
	}

	async getActiveProfile(): Promise<ModelProfile> {
		const data = await this.load()
		return data.profiles.find((p) => p.id === data.activeProfileId) ?? data.profiles[0]
	}

	async addProfile(input: Omit<ModelProfile, "id">): Promise<ModelProfile> {
		const data = await this.load()
		const profile: ModelProfile = { id: randomUUID(), ...input }
		data.profiles.push(profile)
		await this.save(data)
		return profile
	}

	async updateProfile(id: string, patch: Partial<Omit<ModelProfile, "id">>): Promise<void> {
		const data = await this.load()
		const idx = data.profiles.findIndex((p) => p.id === id)
		if (idx >= 0) {
			data.profiles[idx] = { ...data.profiles[idx], ...patch }
			await this.save(data)
		}
	}

	async deleteProfile(id: string): Promise<void> {
		const data = await this.load()
		data.profiles = data.profiles.filter((p) => p.id !== id)
		if (data.activeProfileId === id && data.profiles[0]) {
			data.activeProfileId = data.profiles[0].id
		}
		await this.save(data)
	}

	async setActiveProfile(id: string): Promise<void> {
		const data = await this.load()
		if (data.profiles.some((p) => p.id === id)) {
			data.activeProfileId = id
			await this.save(data)
		}
	}

	/** Map the active profile onto OpenAI-compatible apiConfiguration fields. */
	async toApiConfiguration(): Promise<Record<string, unknown>> {
		const p = await this.getActiveProfile()
		return {
			apiProvider: "openai",
			openAiBaseUrl: p.baseUrl,
			openAiApiKey: p.apiKey,
			planModeApiProvider: "openai",
			actModeApiProvider: "openai",
			planModeOpenAiModelId: p.modelId,
			actModeOpenAiModelId: p.modelId,
		}
	}
}
