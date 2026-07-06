import { ModelProfileService } from "@/core/profiles/ModelProfileService";
import type {
	ProfilesResponse,
	UpsertProfileRequest,
} from "@shared/proto/cline/state";
import { Logger } from "@/shared/services/Logger";
import { getWorkspacePath } from "@utils/path";
import type { Controller } from "..";
import { buildProfilesResponse } from "./profiles-shared";

/**
 * Creates (empty id) or updates (existing id) a model profile.
 * @param controller The controller instance
 * @param request The profile to upsert
 * @returns ProfilesResponse with the full current profile state after the mutation
 */
export async function upsertProfile(
	controller: Controller,
	request: UpsertProfileRequest,
): Promise<ProfilesResponse> {
	try {
		const profile = request.profile;
		if (!profile) {
			throw new Error("Profile is required");
		}
		const cwd = await getWorkspacePath();
		const service = new ModelProfileService(cwd);
		if (profile.id) {
			await service.updateProfile(profile.id, {
				name: profile.name,
				baseUrl: profile.baseUrl,
				modelId: profile.modelId,
				apiKey: profile.apiKey,
			});
		} else {
			await service.addProfile({
				name: profile.name,
				baseUrl: profile.baseUrl,
				modelId: profile.modelId,
				apiKey: profile.apiKey,
			});
		}
		return await buildProfilesResponse(controller);
	} catch (error) {
		Logger.error("Failed to upsert model profile:", error);
		throw error;
	}
}
