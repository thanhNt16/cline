import { afterEach, beforeEach, describe, it } from "mocha"
import "should"
import * as sinon from "sinon"
import { Controller } from "../core/controller"
import { getAvailableSlashCommands } from "../core/controller/slash/getAvailableSlashCommands"
import { EmptyRequest } from "../shared/proto/cline/common"
import { BASE_SLASH_COMMANDS } from "../shared/slashCommands"

/**
 * Unit tests for getAvailableSlashCommands RPC endpoint
 * Tests the slash command discovery and filtering functionality
 */
describe("getAvailableSlashCommands", () => {
	let mockController: Partial<Controller>
	let mockStateManager: {
		getWorkspaceStateKey: sinon.SinonStub
		getGlobalSettingsKey: sinon.SinonStub
		getGlobalStateKey: sinon.SinonStub
		getRemoteConfigSettings: sinon.SinonStub
	}

	beforeEach(() => {
		mockStateManager = {
			getWorkspaceStateKey: sinon.stub(),
			getGlobalSettingsKey: sinon.stub(),
			getGlobalStateKey: sinon.stub(),
			getRemoteConfigSettings: sinon.stub(),
		}

		// Default stubs return empty/null values
		mockStateManager.getWorkspaceStateKey.returns(null)
		mockStateManager.getGlobalSettingsKey.returns(null)
		mockStateManager.getGlobalStateKey.returns(null)
		mockStateManager.getRemoteConfigSettings.returns(null)

		mockController = {
			stateManager: mockStateManager as any,
			// CellockAI: listAvailableRuntimeSlashCommands surfaces discovered
			// skills from the SDK user-instruction watcher. Default to none.
			listAvailableRuntimeSlashCommands: sinon.stub().resolves([]),
		}
	})

	afterEach(() => {
		sinon.restore()
	})

	describe("Base Slash Commands", () => {
		it("should return all base slash commands", async () => {
			const response = await getAvailableSlashCommands(mockController as Controller, EmptyRequest.create())

			// Should have at least all base commands
			response.commands.length.should.be.greaterThanOrEqual(BASE_SLASH_COMMANDS.length)

			// Verify each base command is present
			for (const baseCmd of BASE_SLASH_COMMANDS) {
				const found = response.commands.find((cmd) => cmd.name === baseCmd.name)
				found!.should.not.be.undefined()
				found!.description.should.equal(baseCmd.description)
				found!.section.should.equal("default")
				found!.cliCompatible.should.equal(baseCmd.cliCompatible ?? false)
			}
		})

		it("should not include the deprecated subagent slash command", async () => {
			const response = await getAvailableSlashCommands(mockController as Controller, EmptyRequest.create())
			const deprecatedCommand = response.commands.find((cmd) => cmd.name === "subagent")
			;(deprecatedCommand === undefined).should.be.true()
		})

		it("should mark base commands with section 'default'", async () => {
			const response = await getAvailableSlashCommands(mockController as Controller, EmptyRequest.create())

			const baseCommandNames = BASE_SLASH_COMMANDS.map((cmd) => cmd.name)
			for (const cmd of response.commands) {
				if (baseCommandNames.includes(cmd.name)) {
					cmd.section.should.equal("default")
				}
			}
		})
	})

	describe("Local Workflow Toggles", () => {
		it("should include enabled local workflows", async () => {
			mockStateManager.getWorkspaceStateKey.withArgs("workflowToggles").returns({
				"/path/to/my-workflow.md": true,
				"/path/to/another-workflow.md": true,
			})

			const response = await getAvailableSlashCommands(mockController as Controller, EmptyRequest.create())

			const myWorkflow = response.commands.find((cmd) => cmd.name === "my-workflow.md")
			myWorkflow!.should.not.be.undefined()
			myWorkflow!.section.should.equal("custom")
			myWorkflow!.cliCompatible.should.equal(true)

			const anotherWorkflow = response.commands.find((cmd) => cmd.name === "another-workflow.md")
			anotherWorkflow!.should.not.be.undefined()
		})

		it("should exclude disabled local workflows", async () => {
			mockStateManager.getWorkspaceStateKey.withArgs("workflowToggles").returns({
				"/path/to/enabled-workflow.md": true,
				"/path/to/disabled-workflow.md": false,
			})

			const response = await getAvailableSlashCommands(mockController as Controller, EmptyRequest.create())

			const enabled = response.commands.find((cmd) => cmd.name === "enabled-workflow.md")
			enabled!.should.not.be.undefined()

			const disabled = response.commands.find((cmd) => cmd.name === "disabled-workflow.md")
			;(disabled === undefined).should.be.true()
		})

		it("should extract filename from full path", async () => {
			mockStateManager.getWorkspaceStateKey.withArgs("workflowToggles").returns({
				"/Users/test/project/.cellockai/rules/workflows/deep-analysis.md": true,
			})

			const response = await getAvailableSlashCommands(mockController as Controller, EmptyRequest.create())

			const workflow = response.commands.find((cmd) => cmd.name === "deep-analysis.md")
			workflow!.should.not.be.undefined()
		})

		it("should handle Windows-style paths", async () => {
			mockStateManager.getWorkspaceStateKey.withArgs("workflowToggles").returns({
				"C:\\Users\\test\\project\\.cellockai\\rules\\workflows\\windows-workflow.md": true,
			})

			const response = await getAvailableSlashCommands(mockController as Controller, EmptyRequest.create())

			const workflow = response.commands.find((cmd) => cmd.name === "windows-workflow.md")
			workflow!.should.not.be.undefined()
		})
	})

	describe("Global Workflow Toggles", () => {
		it("should include enabled global workflows", async () => {
			mockStateManager.getGlobalSettingsKey.withArgs("globalWorkflowToggles").returns({
				"/global/path/global-workflow.md": true,
			})

			const response = await getAvailableSlashCommands(mockController as Controller, EmptyRequest.create())

			const workflow = response.commands.find((cmd) => cmd.name === "global-workflow.md")
			workflow!.should.not.be.undefined()
			workflow!.section.should.equal("custom")
		})

		it("should exclude disabled global workflows", async () => {
			mockStateManager.getGlobalSettingsKey.withArgs("globalWorkflowToggles").returns({
				"/global/path/disabled-global.md": false,
			})

			const response = await getAvailableSlashCommands(mockController as Controller, EmptyRequest.create())

			const workflow = response.commands.find((cmd) => cmd.name === "disabled-global.md")
			;(workflow === undefined).should.be.true()
		})
	})

	describe("Workflow Deduplication", () => {
		it("should prefer local workflows over global workflows with same name", async () => {
			// Same filename in both local and global
			mockStateManager.getWorkspaceStateKey.withArgs("workflowToggles").returns({
				"/local/path/shared-workflow.md": true,
			})
			mockStateManager.getGlobalSettingsKey.withArgs("globalWorkflowToggles").returns({
				"/global/path/shared-workflow.md": true,
			})

			const response = await getAvailableSlashCommands(mockController as Controller, EmptyRequest.create())

			// Should only appear once
			const matches = response.commands.filter((cmd) => cmd.name === "shared-workflow.md")
			matches.length.should.equal(1)
		})

		it("should include global workflow if local with same name is disabled", async () => {
			mockStateManager.getWorkspaceStateKey.withArgs("workflowToggles").returns({
				"/local/path/shared-workflow.md": false, // disabled locally
			})
			mockStateManager.getGlobalSettingsKey.withArgs("globalWorkflowToggles").returns({
				"/global/path/shared-workflow.md": true, // enabled globally
			})

			const response = await getAvailableSlashCommands(mockController as Controller, EmptyRequest.create())

			// Global should appear since local is disabled
			const workflow = response.commands.find((cmd) => cmd.name === "shared-workflow.md")
			workflow!.should.not.be.undefined()
		})
	})

	describe("Remote Workflows", () => {
		it("should include alwaysEnabled remote workflows", async () => {
			mockStateManager.getRemoteConfigSettings.returns({
				remoteGlobalWorkflows: [{ name: "always-on-workflow", alwaysEnabled: true }],
			})

			const response = await getAvailableSlashCommands(mockController as Controller, EmptyRequest.create())

			const workflow = response.commands.find((cmd) => cmd.name === "always-on-workflow")
			workflow!.should.not.be.undefined()
			workflow!.section.should.equal("custom")
		})

		it("should include remote workflows enabled by toggle", async () => {
			mockStateManager.getRemoteConfigSettings.returns({
				remoteGlobalWorkflows: [{ name: "toggle-workflow", alwaysEnabled: false }],
			})
			mockStateManager.getGlobalStateKey.withArgs("remoteWorkflowToggles").returns({
				"toggle-workflow": true, // not explicitly disabled
			})

			const response = await getAvailableSlashCommands(mockController as Controller, EmptyRequest.create())

			const workflow = response.commands.find((cmd) => cmd.name === "toggle-workflow")
			workflow!.should.not.be.undefined()
		})

		it("should exclude remote workflows explicitly disabled by toggle", async () => {
			mockStateManager.getRemoteConfigSettings.returns({
				remoteGlobalWorkflows: [{ name: "disabled-remote", alwaysEnabled: false }],
			})
			mockStateManager.getGlobalStateKey.withArgs("remoteWorkflowToggles").returns({
				"disabled-remote": false,
			})

			const response = await getAvailableSlashCommands(mockController as Controller, EmptyRequest.create())

			const workflow = response.commands.find((cmd) => cmd.name === "disabled-remote")
			;(workflow === undefined).should.be.true()
		})

		it("should include remote workflows by default if not explicitly disabled", async () => {
			mockStateManager.getRemoteConfigSettings.returns({
				remoteGlobalWorkflows: [{ name: "default-enabled", alwaysEnabled: false }],
			})
			// No toggle entry for this workflow
			mockStateManager.getGlobalStateKey.withArgs("remoteWorkflowToggles").returns({})

			const response = await getAvailableSlashCommands(mockController as Controller, EmptyRequest.create())

			const workflow = response.commands.find((cmd) => cmd.name === "default-enabled")
			workflow!.should.not.be.undefined()
		})
	})

	describe("Edge Cases", () => {
		it("should handle null/undefined state values gracefully", async () => {
			mockStateManager.getWorkspaceStateKey.returns(null)
			mockStateManager.getGlobalSettingsKey.returns(undefined)
			mockStateManager.getGlobalStateKey.returns(null)
			mockStateManager.getRemoteConfigSettings.returns(null)

			const response = await getAvailableSlashCommands(mockController as Controller, EmptyRequest.create())

			// Should still return base commands
			response.commands.length.should.be.greaterThanOrEqual(BASE_SLASH_COMMANDS.length)
		})

		it("should handle empty workflow toggle objects", async () => {
			mockStateManager.getWorkspaceStateKey.withArgs("workflowToggles").returns({})
			mockStateManager.getGlobalSettingsKey.withArgs("globalWorkflowToggles").returns({})
			mockStateManager.getGlobalStateKey.withArgs("remoteWorkflowToggles").returns({})
			mockStateManager.getRemoteConfigSettings.returns({
				remoteGlobalWorkflows: [],
			})

			const response = await getAvailableSlashCommands(mockController as Controller, EmptyRequest.create())

			// Should only have base commands
			response.commands.length.should.equal(BASE_SLASH_COMMANDS.length)
		})

		it("should handle remote config with no remoteGlobalWorkflows property", async () => {
			mockStateManager.getRemoteConfigSettings.returns({})

			const response = await getAvailableSlashCommands(mockController as Controller, EmptyRequest.create())

			// Should not throw, just return base commands
			response.commands.length.should.be.greaterThanOrEqual(BASE_SLASH_COMMANDS.length)
		})
	})

	// CellockAI: skills discovered by the SDK user-instruction watcher are
	// surfaced as slash suggestions so typing / offers /skill-name entries.
	describe("Skills (runtime commands)", () => {
		it("should include discovered skills with a skill section", async () => {
			;(mockController.listAvailableRuntimeSlashCommands as sinon.SinonStub).resolves([
				{ kind: "skill", name: "aws-deploy", description: "Deploys to AWS", id: "aws-deploy" },
				{ kind: "skill", name: "pr-review", description: "", id: "pr-review" },
				{ kind: "workflow", name: "legacy-flow", description: "old", id: "legacy-flow" },
			])

			const response = await getAvailableSlashCommands(mockController as Controller, EmptyRequest.create())

			const aws = response.commands.find((cmd) => cmd.name === "aws-deploy")
			aws!.should.not.be.undefined()
			aws!.section.should.equal("skill")
			aws!.description.should.equal("Deploys to AWS")
			aws!.cliCompatible.should.equal(true)

			// Empty descriptions fall back to "Skill: <name>".
			const prReview = response.commands.find((cmd) => cmd.name === "pr-review")
			prReview!.description.should.equal("Skill: pr-review")

			// Workflows from the watcher are NOT injected here (the webview still
			// sources workflows from toggle state); only kind === "skill" is added.
			response.commands.should.not.containEql({ name: "legacy-flow" })
			const legacy = response.commands.find((cmd) => cmd.name === "legacy-flow")
			;(legacy === undefined).should.be.true()
		})

		it("should not duplicate a skill whose name collides with a base command", async () => {
			;(mockController.listAvailableRuntimeSlashCommands as sinon.SinonStub).resolves([
				{ kind: "skill", name: BASE_SLASH_COMMANDS[0].name, description: "collision", id: "x" },
			])

			const response = await getAvailableSlashCommands(mockController as Controller, EmptyRequest.create())

			const matches = response.commands.filter((cmd) => cmd.name === BASE_SLASH_COMMANDS[0].name)
			matches.length.should.equal(1)
			matches[0].section.should.equal("default")
		})

		it("should keep base + workflow commands when the watcher throws", async () => {
			;(mockController.listAvailableRuntimeSlashCommands as sinon.SinonStub).rejects(new Error("boom"))

			const response = await getAvailableSlashCommands(mockController as Controller, EmptyRequest.create())

			response.commands.length.should.be.greaterThanOrEqual(BASE_SLASH_COMMANDS.length)
		})
	})
})
