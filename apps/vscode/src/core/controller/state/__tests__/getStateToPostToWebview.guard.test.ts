import { strict as assert } from "node:assert"
import { describe, it, vi } from "vitest"
import { getStateToPostToWebview } from "../getStateToPostToWebview"

// buildState reads process-wide singletons that throw until the extension host boots.
// Stub them so the happy-path assertions below exercise the real state build instead of
// silently landing in the catch-all fallback.
vi.mock("@/config", async (importOriginal) => ({
	...(await importOriginal<object>()),
	ClineEnv: { config: () => ({ environment: "production" }) },
}))
vi.mock("@/services/banner/BannerService", () => ({
	BannerService: { get: () => ({ getActiveBanners: () => [], getWelcomeBanners: () => [] }) },
}))

const makeController = (overrides = {}) => ({
	stateManager: {
		getApiConfiguration: vi.fn().mockReturnValue({}),
		getGlobalStateKey: vi.fn().mockReturnValue(undefined),
		getGlobalSettingsKey: vi.fn().mockReturnValue(undefined),
		getWorkspaceStateKey: vi.fn().mockReturnValue(undefined),
		getRemoteConfigSettings: vi.fn().mockReturnValue(undefined),
	},
	workspaceManager: { getPrimaryRoot: vi.fn().mockReturnValue(undefined), getRoots: vi.fn().mockReturnValue([]) },
	workspaceHistoryIndex: { getTaskIds: vi.fn().mockResolvedValue(new Set()) },
	...overrides,
})

describe("getStateToPostToWebview crash guard", () => {
	it("returns a state with welcomeViewCompleted true when the build throws", async () => {
		const badStateManager = {
			getApiConfiguration: vi.fn().mockImplementation(() => {
				throw new Error("boom")
			}),
			getGlobalStateKey: vi.fn().mockReturnValue(undefined),
			getGlobalSettingsKey: vi.fn().mockReturnValue(undefined),
			getWorkspaceStateKey: vi.fn().mockReturnValue(undefined),
			getRemoteConfigSettings: vi.fn().mockReturnValue(undefined),
		}
		const state = await getStateToPostToWebview(makeController({ stateManager: badStateManager }) as any)
		assert.equal(state.welcomeViewCompleted, true)
	})

	it("caps clineMessages at exactly 1000 and preserves the tail", async () => {
		const messages = Array.from({ length: 1200 }, (_, i) => ({ ts: i, type: "say" as const, say: "text" as const }))
		const controller = makeController({
			task: { messageStateHandler: { getClineMessages: () => messages } },
		}) as any
		const state = await getStateToPostToWebview(controller)
		assert.equal(state.clineMessages.length, 1000)
		assert.equal(state.clineMessages[0].ts, 200)
		assert.equal(state.clineMessages.at(-1)?.ts, 1199)
	})
})
