import type { SearchGithubSkillsRequest, SearchGithubSkillsResponse } from "@shared/proto/cline/marketplace"
import type { Controller } from "../index"
import { fetchGithubSkills } from "./marketplace-helpers"

/**
 * CellockAI: search the public skill ecosystem (skills.sh) by name. Used by the
 * Marketplace Skills tab search box. Failures throw and are surfaced by the webview.
 */
export async function searchGithubSkills(
	_controller: Controller,
	request: SearchGithubSkillsRequest,
): Promise<SearchGithubSkillsResponse> {
	return fetchGithubSkills(request.query, request.owner)
}
