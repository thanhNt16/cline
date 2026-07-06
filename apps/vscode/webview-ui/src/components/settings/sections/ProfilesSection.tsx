import { EmptyRequest } from "@shared/proto/cline/common"
import {
	type ModelProfile,
	type ProfilesResponse,
	UpsertProfileRequest,
} from "@shared/proto/cline/state"
import { VSCodeButton, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { Check, Pencil, Plus, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { StateServiceClient } from "@/services/grpc-client"
import Section from "../Section"
import SectionHeader from "../SectionHeader"

interface ProfilesSectionProps {
	renderSectionHeader?: (tabId: string) => JSX.Element | null
}

interface ProfileForm {
	id: string
	name: string
	baseUrl: string
	modelId: string
	apiKey: string
}

const EMPTY_FORM: ProfileForm = {
	id: "",
	name: "",
	baseUrl: "",
	modelId: "",
	apiKey: "",
}

const ProfilesSection = ({ renderSectionHeader }: ProfilesSectionProps) => {
	const [response, setResponse] = useState<ProfilesResponse | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [form, setForm] = useState<ProfileForm>(EMPTY_FORM)
	const [isEditing, setIsEditing] = useState(false)

	const loadProfiles = async () => {
		try {
			const res = await StateServiceClient.getProfiles(EmptyRequest.create())
			setResponse(res)
			setError(null)
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err))
		} finally {
			setIsLoading(false)
		}
	}

	useEffect(() => {
		loadProfiles()
	}, [])

	const upsert = async (): Promise<void> => {
		try {
			const res = await StateServiceClient.upsertProfile(
				UpsertProfileRequest.create({
					profile: {
						id: form.id,
						name: form.name,
						baseUrl: form.baseUrl,
						modelId: form.modelId,
						apiKey: form.apiKey,
					} as ModelProfile,
				}),
			)
			setResponse(res)
			setForm(EMPTY_FORM)
			setIsEditing(false)
			setError(null)
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err))
		}
	}

	const setActive = async (id: string): Promise<void> => {
		try {
			const res = await StateServiceClient.setActiveProfile({ id })
			setResponse(res)
			setError(null)
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err))
		}
	}

	const remove = async (id: string): Promise<void> => {
		try {
			const res = await StateServiceClient.deleteProfile({ id })
			setResponse(res)
			setError(null)
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err))
		}
	}

	const startEdit = (profile: ModelProfile): void => {
		setForm({
			id: profile.id,
			name: profile.name,
			baseUrl: profile.baseUrl,
			modelId: profile.modelId,
			apiKey: profile.apiKey,
		})
		setIsEditing(true)
		setError(null)
	}

	const cancelEdit = (): void => {
		setForm(EMPTY_FORM)
		setIsEditing(false)
	}

	const activeProfileId = response?.activeProfileId ?? ""
	const profiles = response?.profiles ?? []
	const canSubmit = form.name.trim() !== "" && form.baseUrl.trim() !== "" && form.modelId.trim() !== ""

	return (
		<div>
			{renderSectionHeader?.("profiles") ?? <SectionHeader>Model Profiles</SectionHeader>}
			<Section>
				<div className="mb-2">
					<p className="text-xs text-(--vscode-descriptionForeground) m-0">
						Manage OpenAI-compatible model profiles for this workspace. The active profile overrides the API
						configuration when starting a new task.
					</p>
				</div>

				{isLoading && <div className="text-xs text-(--vscode-descriptionForeground)">Loading profiles...</div>}
				{error && <div className="text-xs text-(--vscode-errorForeground) mb-2">{error}</div>}

				{profiles.length > 0 && (
					<div className="flex flex-col gap-2 mb-4">
						{profiles.map((profile) => {
							const isActive = profile.id === activeProfileId
							return (
								<div
									key={profile.id}
									className={`rounded border p-3 ${
										isActive
											? "border-(--vscode-focusBorder) bg-(--vscode-list-activeSelectionBackground)"
											: "border-(--vscode-panel-border)"
									}`}>
									<div className="flex items-start justify-between gap-2">
										<button
											className="flex items-start gap-2 text-left flex-1 min-w-0"
											onClick={() => setActive(profile.id)}
											type="button">
											{isActive ? (
												<Check className="w-4 h-4 mt-0.5 shrink-0" />
											) : (
												<div className="w-4 h-4 mt-0.5 shrink-0 rounded-full border border-(--vscode-panel-border)" />
											)}
											<div className="min-w-0">
												<div className="font-medium truncate">{profile.name}</div>
												<div className="text-xs text-(--vscode-descriptionForeground) truncate">
													{profile.baseUrl}
												</div>
												<div className="text-xs text-(--vscode-descriptionForeground) truncate">
													{profile.modelId}
												</div>
											</div>
										</button>
										<div className="flex items-center gap-1 shrink-0">
											<VSCodeButton
												appearance="icon"
												onClick={() => startEdit(profile)}
												title="Edit">
												<Pencil className="w-4 h-4" />
											</VSCodeButton>
											<VSCodeButton
												appearance="icon"
												onClick={() => remove(profile.id)}
												title="Delete">
												<Trash2 className="w-4 h-4" />
											</VSCodeButton>
										</div>
									</div>
								</div>
							)
						})}
					</div>
				)}

				<div className="rounded border border-(--vscode-panel-border) p-3 flex flex-col gap-2">
					<div className="font-medium">{isEditing ? "Edit profile" : "Add profile"}</div>
					<VSCodeTextField
						onInput={(e: any) => setForm({ ...form, name: e.target.value })}
						placeholder="Profile name"
						value={form.name}>
						<span className="text-xs">Name</span>
					</VSCodeTextField>
					<VSCodeTextField
						onInput={(e: any) => setForm({ ...form, baseUrl: e.target.value })}
						placeholder="https://api.example.com/v1"
						value={form.baseUrl}>
						<span className="text-xs">Base URL</span>
					</VSCodeTextField>
					<VSCodeTextField
						onInput={(e: any) => setForm({ ...form, modelId: e.target.value })}
						placeholder="model-id"
						value={form.modelId}>
						<span className="text-xs">Model ID</span>
					</VSCodeTextField>
					<VSCodeTextField
						onInput={(e: any) => setForm({ ...form, apiKey: e.target.value })}
						placeholder="API key"
						type="password"
						value={form.apiKey}>
						<span className="text-xs">API Key</span>
					</VSCodeTextField>
					<div className="flex items-center gap-2">
						<VSCodeButton disabled={!canSubmit} onClick={() => upsert()}>
							<Plus className="w-4 h-4 mr-1" />
							{isEditing ? "Save" : "Add profile"}
						</VSCodeButton>
						{isEditing && (
							<VSCodeButton appearance="secondary" onClick={() => cancelEdit()}>
								Cancel
							</VSCodeButton>
						)}
					</div>
				</div>
			</Section>
		</div>
	)
}

export default ProfilesSection
