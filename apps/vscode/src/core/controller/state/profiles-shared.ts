import { ModelProfileService } from "@/core/profiles/ModelProfileService";
import { ProfilesResponse } from "@shared/proto/cline/state";
import { getWorkspacePath } from "@utils/path";
import type { Controller } from "..";

/**
 * Build a fresh ProfilesResponse from the on-disk profile store.
 * Used by every profile RPC so the webview re-renders from one source of truth.
 */
export async function buildProfilesResponse(
	_controller: Controller,
): Promise<ProfilesResponse> {
	const cwd = await getWorkspacePath();
	const service = new ModelProfileService(cwd);
	const [profiles, active] = await Promise.all([
		service.getProfiles(),
		service.getActiveProfile(),
	]);
	return ProfilesResponse.create({
		activeProfileId: active.id,
		profiles: profiles.map((p) => ({
			id: p.id,
			name: p.name,
			baseUrl: p.baseUrl,
			modelId: p.modelId,
			apiKey: p.apiKey,
		})),
	});
}
