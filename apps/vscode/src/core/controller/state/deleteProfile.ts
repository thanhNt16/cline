import { ModelProfileService } from "@/core/profiles/ModelProfileService"
import type { DeleteProfileRequest, ProfilesResponse } from "@shared/proto/cline/state"
import { Logger } from "@/shared/services/Logger"
import { getWorkspacePath } from "@utils/path"
import type { Controller } from ".."
import { buildProfilesResponse } from "./profiles-shared"

/**
 * Deletes a model profile.
 * @param controller The controller instance
 * @param request The id of the profile to delete
 * @returns ProfilesResponse with the full current profile state after the mutation
 */
export async function deleteProfile(controller: Controller, request: DeleteProfileRequest): Promise<ProfilesResponse> {
	try {
		if (!request.id) {
			throw new Error("Profile id is required")
		}
		const cwd = await getWorkspacePath()
		const service = new ModelProfileService(cwd)
		await service.deleteProfile(request.id)
		return await buildProfilesResponse(controller)
	} catch (error) {
		Logger.error("Failed to delete model profile:", error)
		throw error
	}
}
