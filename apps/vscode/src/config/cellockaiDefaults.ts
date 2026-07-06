export const CELLOCKAI_DEFAULT_BASE_URL = "https://api.z.ai/api/coding/paas/v4"
export const CELLOCKAI_DEFAULT_MODEL_ID = "glm-5.2"
export const CELLOCKAI_DEFAULT_PROFILE_NAME = "GLM (z.ai)"

/**
 * Resolves the default API key without hard-failing the build when the
 * gitignored local file is absent (e.g. fresh clone / CI). Order:
 * 1. CELLOCKAI_DEFAULT_API_KEY env var
 * 2. gitignored local file
 * 3. empty string (user must enter a key in the Profiles UI)
 */
export function getDefaultApiKey(): string {
	if (process.env.CELLOCKAI_DEFAULT_API_KEY) {
		return process.env.CELLOCKAI_DEFAULT_API_KEY
	}
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const local = require("./cellockai-default-key.local") as { CELLOCKAI_DEFAULT_API_KEY?: string }
		return local.CELLOCKAI_DEFAULT_API_KEY ?? ""
	} catch {
		return ""
	}
}
