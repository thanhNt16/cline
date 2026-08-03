import { strict as assert } from "node:assert"
import { describe, it, vi } from "vitest"
import { getStateToPostToWebview } from "../getStateToPostToWebview"

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
})
