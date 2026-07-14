import { EmptyRequest } from "@shared/proto/cline/common"
import type { ProfilesResponse } from "@shared/proto/cline/state"
import { Logger } from "@/shared/services/Logger"
import type { Controller } from ".."
import { buildProfilesResponse } from "./profiles-shared"

/**
 * Returns all model profiles plus the active profile id.
 * @param controller The controller instance
 * @param _request Empty request
 * @returns ProfilesResponse with the full current profile state
 */
export async function getProfiles(controller: Controller, _request: EmptyRequest): Promise<ProfilesResponse> {
	try {
		return await buildProfilesResponse(controller)
	} catch (error) {
		Logger.error("Failed to load model profiles:", error)
		throw error
	}
}
