import { ModelProfileService } from "@/core/profiles/ModelProfileService"
import type { ProfilesResponse, SetActiveProfileRequest } from "@shared/proto/cline/state"
import { Logger } from "@/shared/services/Logger"
import { getWorkspacePath } from "@utils/path"
import type { Controller } from ".."
import { buildProfilesResponse } from "./profiles-shared"

/**
 * Sets the active model profile.
 * @param controller The controller instance
 * @param request The id of the profile to activate
 * @returns ProfilesResponse with the full current profile state after the mutation
 */
export async function setActiveProfile(controller: Controller, request: SetActiveProfileRequest): Promise<ProfilesResponse> {
	try {
		if (!request.id) {
			throw new Error("Profile id is required")
		}
		const cwd = await getWorkspacePath()
		const service = new ModelProfileService(cwd)
		await service.setActiveProfile(request.id)
		return await buildProfilesResponse(controller)
	} catch (error) {
		Logger.error("Failed to set active model profile:", error)
		throw error
	}
}
