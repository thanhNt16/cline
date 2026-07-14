// Extracted from classic src/core/controller/index.ts (see origin/main)
//
// Standalone function to build ExtensionState from a Controller instance.
// This allows the SdkController to reuse the classic state-building logic
// without inheriting the entire classic Controller implementation.

import { readCompactionStrategyGlobally } from "@cline/core"
import { getHooksEnabledSafe } from "@core/hooks/hooks-utils"
import type { ExtensionState, Platform } from "@shared/ExtensionMessage"
import { ClineEnv } from "@/config"
import { overlayActiveProfile } from "@/core/controller/state/active-profile-overlay"
import { ExtensionRegistryInfo } from "@/registry"
import { BannerService } from "@/services/banner/BannerService"
import { featureFlagsService } from "@/services/feature-flags"
import { getDistinctId } from "@/services/logging/distinctId"
import { getLatestAnnouncementId } from "@/utils/announcements"
import { getClineOnboardingModels } from "../models/getClineOnboardingModels"

/**
 * Builds the ExtensionState object to push to the webview.
 * Extracted from the classic Controller.getStateToPostToWebview().
 */
export async function getStateToPostToWebview(controller: {
	task?: any
	stateManager: any
	mcpHub?: any
	backgroundCommandRunning?: boolean
	backgroundCommandTaskId?: string
	workspaceManager?: any
	workspaceHistoryIndex?: { getTaskIds: () => Promise<Set<string>> }
	checkpointRestoreInput?: ExtensionState["checkpointRestoreInput"]
}): Promise<ExtensionState> {
	const stateManager = controller.stateManager

	// Get API configuration from cache for immediate access
	const onboardingModels = getClineOnboardingModels()
	const apiConfiguration = stateManager.getApiConfiguration()
	// CellockAI: surface the active workspace model profile's model id so the
	// chat bar displays the model a task will actually use (the active profile
	// overrides the saved config at task time). Sync read of
	// <cwd>/.cellockai/profiles.json; undefined when no profile / no workspace.
	const primaryRootPath = controller.workspaceManager?.getPrimaryRoot?.()?.path
	const activeProfileModelId = overlayActiveProfile({}, primaryRootPath).actModeOpenAiModelId
	const lastShownAnnouncementId = stateManager.getGlobalStateKey("lastShownAnnouncementId")
	const taskHistory = stateManager.getGlobalStateKey("taskHistory")
	const autoApprovalSettings = stateManager.getGlobalSettingsKey("autoApprovalSettings")
	const browserSettings = stateManager.getGlobalSettingsKey("browserSettings")
	const preferredLanguage = stateManager.getGlobalSettingsKey("preferredLanguage")
	const mode = stateManager.getGlobalSettingsKey("mode")
	const yoloModeToggled = stateManager.getGlobalSettingsKey("yoloModeToggled")
	const useAutoCondense = stateManager.getGlobalSettingsKey("useAutoCondense")
	const compactionStrategy = readCompactionStrategyGlobally()
	const subagentsEnabled = stateManager.getGlobalSettingsKey("subagentsEnabled")
	const userInfo = stateManager.getGlobalStateKey("userInfo")
	const mcpMarketplaceEnabled = stateManager.getGlobalStateKey("mcpMarketplaceEnabled")
	const mcpDisplayMode = stateManager.getGlobalStateKey("mcpDisplayMode")
	const telemetrySetting = stateManager.getGlobalSettingsKey("telemetrySetting")
	const planActSeparateModelsSetting = stateManager.getGlobalSettingsKey("planActSeparateModelsSetting")
	const enableCheckpointsSetting = stateManager.getGlobalSettingsKey("enableCheckpointsSetting")
	const globalClineRulesToggles = stateManager.getGlobalStateKey("globalClineRulesToggles")
	const globalWorkflowToggles = stateManager.getGlobalStateKey("globalWorkflowToggles")
	const globalSkillsToggles = stateManager.getGlobalStateKey("globalSkillsToggles")
	const localSkillsToggles = stateManager.getWorkspaceStateKey("localSkillsToggles")
	const remoteRulesToggles = stateManager.getGlobalStateKey("remoteRulesToggles")
	const remoteWorkflowToggles = stateManager.getGlobalStateKey("remoteWorkflowToggles")
	const shellIntegrationTimeout = stateManager.getGlobalSettingsKey("shellIntegrationTimeout")
	const terminalReuseEnabled = stateManager.getGlobalStateKey("terminalReuseEnabled")
	const vscodeTerminalExecutionMode = stateManager.getGlobalStateKey("vscodeTerminalExecutionMode")
	const defaultTerminalProfile = stateManager.getGlobalSettingsKey("defaultTerminalProfile")
	const isNewUser = stateManager.getGlobalStateKey("isNewUser")
	// CellockAI: always skip the onboarding/welcome flow and land directly on the
	// chat view (the "What can I do for you?" screen with the auto-approve bar).
	// API providers are configured via Settings → API Configuration instead.
	const welcomeViewCompleted = true

	const customPrompt = stateManager.getGlobalSettingsKey("customPrompt")
	const mcpResponsesCollapsed = stateManager.getGlobalStateKey("mcpResponsesCollapsed")
	const maxConsecutiveMistakes = stateManager.getGlobalSettingsKey("maxConsecutiveMistakes")
	const favoritedModelIds = stateManager.getGlobalStateKey("favoritedModelIds")
	const lastDismissedInfoBannerVersion = stateManager.getGlobalStateKey("lastDismissedInfoBannerVersion") || 0
	const lastDismissedModelBannerVersion = stateManager.getGlobalStateKey("lastDismissedModelBannerVersion") || 0
	const lastDismissedCliBannerVersion = stateManager.getGlobalStateKey("lastDismissedCliBannerVersion") || 0
	const dismissedBanners = stateManager.getGlobalStateKey("dismissedBanners")
	const showFeatureTips = stateManager.getGlobalSettingsKey("showFeatureTips")

	const localClineRulesToggles = stateManager.getWorkspaceStateKey("localClineRulesToggles")
	const localWindsurfRulesToggles = stateManager.getWorkspaceStateKey("localWindsurfRulesToggles")
	const localCursorRulesToggles = stateManager.getWorkspaceStateKey("localCursorRulesToggles")
	const localAgentsRulesToggles = stateManager.getWorkspaceStateKey("localAgentsRulesToggles")
	const workflowToggles = stateManager.getWorkspaceStateKey("workflowToggles")

	const currentTaskItem = controller.task?.taskId
		? (taskHistory || []).find((item: any) => item.id === controller.task?.taskId)
		: undefined
	const clineMessages = [...(controller.task?.messageStateHandler?.getClineMessages?.() || [])]
	const checkpointRestoreInput = controller.checkpointRestoreInput

	const workspaceTaskIds = controller.workspaceHistoryIndex
		? await controller.workspaceHistoryIndex.getTaskIds()
		: null

	const processedTaskHistory = (taskHistory || [])
		.filter((item: any) => item.ts && item.task)
		.filter((item: any) => {
			if (!workspaceTaskIds || workspaceTaskIds.size === 0) return true
			return workspaceTaskIds.has(item.id)
		})
		.sort((a: any, b: any) => b.ts - a.ts)
		.slice(0, 100)

	const latestAnnouncementId = getLatestAnnouncementId()
	const shouldShowAnnouncement = lastShownAnnouncementId !== latestAnnouncementId
	const platform = process.platform as Platform
	const distinctId = getDistinctId()
	const version = ExtensionRegistryInfo.version
	const clineConfig = ClineEnv.config()
	const environment = clineConfig.environment
	const banners = BannerService.get().getActiveBanners() ?? []
	const welcomeBanners = BannerService.get().getWelcomeBanners() ?? []

	// Check OpenAI Codex authentication status
	let openAiCodexIsAuthenticated = false
	try {
		const { openAiCodexOAuthManager } = await import("@/integrations/openai-codex/oauth")
		openAiCodexIsAuthenticated = await openAiCodexOAuthManager.isAuthenticated()
	} catch {
		// Codex OAuth not available
	}

	const resolvedWorkspaceRoots = controller.workspaceManager?.getRoots?.() ?? []

	return {
		version,
		apiConfiguration,
		activeProfileModelId,
		currentTaskItem,
		clineMessages,
		checkpointRestoreInput,
		autoApprovalSettings,
		browserSettings,
		preferredLanguage,
		mode,
		yoloModeToggled,
		useAutoCondense,
		compactionStrategy,
		subagentsEnabled,
		userInfo,
		mcpMarketplaceEnabled,
		mcpDisplayMode,
		telemetrySetting,
		planActSeparateModelsSetting,
		enableCheckpointsSetting: enableCheckpointsSetting ?? true,
		platform,
		environment,
		distinctId,
		globalClineRulesToggles: globalClineRulesToggles || {},
		localClineRulesToggles: localClineRulesToggles || {},
		localWindsurfRulesToggles: localWindsurfRulesToggles || {},
		localCursorRulesToggles: localCursorRulesToggles || {},
		localAgentsRulesToggles: localAgentsRulesToggles || {},
		localWorkflowToggles: workflowToggles || {},
		globalWorkflowToggles: globalWorkflowToggles || {},
		globalSkillsToggles: globalSkillsToggles || {},
		localSkillsToggles: localSkillsToggles || {},
		remoteRulesToggles,
		remoteWorkflowToggles,
		shellIntegrationTimeout,
		terminalReuseEnabled,
		vscodeTerminalExecutionMode,
		defaultTerminalProfile,
		isNewUser,
		welcomeViewCompleted,
		onboardingModels,
		mcpResponsesCollapsed,
		maxConsecutiveMistakes,
		customPrompt,
		taskHistory: processedTaskHistory,
		shouldShowAnnouncement,
		favoritedModelIds,
		backgroundCommandRunning: controller.backgroundCommandRunning ?? false,
		backgroundCommandTaskId: controller.backgroundCommandTaskId,
		workspaceRoots: resolvedWorkspaceRoots,
		primaryRootIndex: controller.workspaceManager?.getPrimaryIndex?.() ?? 0,
		isMultiRootWorkspace: resolvedWorkspaceRoots.length > 1,
		multiRootSetting: {
			user: stateManager.getGlobalStateKey("multiRootEnabled"),
			featureFlag: true,
		},
		worktreesEnabled: {
			user: stateManager.getGlobalSettingsKey("worktreesEnabled"),
			featureFlag: featureFlagsService.getWorktreesEnabled(),
		},
		hooksEnabled: getHooksEnabledSafe(stateManager.getGlobalSettingsKey("hooksEnabled")),
		lastDismissedInfoBannerVersion,
		lastDismissedModelBannerVersion,
		remoteConfigSettings: stateManager.getRemoteConfigSettings?.(),
		lastDismissedCliBannerVersion,
		dismissedBanners,
		backgroundEditEnabled: stateManager.getGlobalSettingsKey("backgroundEditEnabled"),
		optOutOfRemoteConfig: stateManager.getGlobalSettingsKey("optOutOfRemoteConfig"),
		showFeatureTips,
		banners,
		welcomeBanners,
		openAiCodexIsAuthenticated,
	} as ExtensionState
}
