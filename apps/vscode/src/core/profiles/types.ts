export interface ModelProfile {
	id: string
	name: string
	baseUrl: string
	modelId: string
	apiKey: string
}

export interface ProfilesFile {
	activeProfileId: string
	profiles: ModelProfile[]
}
