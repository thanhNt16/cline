import { strict as assert } from "node:assert"
import * as fs from "node:fs/promises"
import os from "os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, it, spyOn } from "bun:test"
import { ModelProfileService } from "../ModelProfileService"

const profile = (id: string, modelId = "m") => ({ id, name: id, baseUrl: "u", modelId, apiKey: "k" })

describe("ModelProfileService (layered)", () => {
	let home: string
	let workspace: string
	let homedirSpy: ReturnType<typeof spyOn>

	beforeEach(async () => {
		home = await fs.mkdtemp(path.join(os.tmpdir(), "cellockai-home-"))
		workspace = await fs.mkdtemp(path.join(os.tmpdir(), "cellockai-workspace-"))
		homedirSpy = spyOn(os, "homedir").mockImplementation(() => home)
	})

	afterEach(async () => {
		homedirSpy.mockRestore()
		await fs.rm(home, { recursive: true, force: true })
		await fs.rm(workspace, { recursive: true, force: true })
	})

	const globalFile = () => path.join(home, ".cellockai", "profiles.json")
	const workspaceFile = () => path.join(workspace, ".cellockai", "profiles.json")
	const writeProfiles = async (file: string, data: unknown) => {
		await fs.mkdir(path.dirname(file), { recursive: true })
		await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8")
	}

	it("returns no profiles without creating either layer", async () => {
		const service = new ModelProfileService(workspace)
		assert.deepEqual(await service.getProfiles(), [])
		assert.equal(await service.getActiveProfile(), undefined)
		await assert.rejects(() => fs.access(globalFile()))
		await assert.rejects(() => fs.access(workspaceFile()))
	})

	it("loads global profiles without a workspace layer", async () => {
		await writeProfiles(globalFile(), { activeProfileId: "global", profiles: [profile("global")] })
		const service = new ModelProfileService(workspace)
		assert.deepEqual((await service.getProfiles()).map((item) => item.id), ["global"])
		assert.equal((await service.getActiveProfile())?.id, "global")
	})

	it("fully replaces a global profile with the workspace profile sharing its id", async () => {
		await writeProfiles(globalFile(), { activeProfileId: "shared", profiles: [profile("shared", "global-model")] })
		await writeProfiles(workspaceFile(), { activeProfileId: "", profiles: [profile("shared", "workspace-model")] })
		const { merged, owners } = await new ModelProfileService(workspace).loadMerged()
		assert.equal(merged.profiles.length, 1)
		assert.equal(merged.profiles[0].modelId, "workspace-model")
		assert.equal(owners.get("shared"), "workspace")
	})

	it("merges distinct global and workspace profiles", async () => {
		await writeProfiles(globalFile(), { activeProfileId: "", profiles: [profile("global")] })
		await writeProfiles(workspaceFile(), { activeProfileId: "", profiles: [profile("workspace")] })
		assert.deepEqual(
			(await new ModelProfileService(workspace).getProfiles()).map((item) => item.id).sort(),
			["global", "workspace"],
		)
	})

	it("falls back to the first merged profile when both active ids are invalid", async () => {
		await writeProfiles(globalFile(), { activeProfileId: "missing", profiles: [profile("global")] })
		await writeProfiles(workspaceFile(), { activeProfileId: "also-missing", profiles: [profile("workspace")] })
		assert.equal((await new ModelProfileService(workspace).getActiveProfile())?.id, "global")
	})

	it("falls through from a stale workspace active id to a valid global id", async () => {
		await writeProfiles(globalFile(), { activeProfileId: "global", profiles: [profile("global"), profile("other")] })
		await writeProfiles(workspaceFile(), { activeProfileId: "missing", profiles: [] })
		assert.equal((await new ModelProfileService(workspace).getActiveProfile())?.id, "global")
	})

	it("uses a valid workspace active id even for a global-owned profile", async () => {
		await writeProfiles(globalFile(), { activeProfileId: "global", profiles: [profile("global"), profile("other")] })
		await writeProfiles(workspaceFile(), { activeProfileId: "other", profiles: [] })
		assert.equal((await new ModelProfileService(workspace).getActiveProfile())?.id, "other")
	})

	it("skips malformed global JSON while a valid workspace layer loads", async () => {
		await fs.mkdir(path.dirname(globalFile()), { recursive: true })
		await fs.writeFile(globalFile(), "{", "utf8")
		await writeProfiles(workspaceFile(), { activeProfileId: "workspace", profiles: [profile("workspace")] })
		assert.equal((await new ModelProfileService(workspace).getActiveProfile())?.id, "workspace")
	})

	it("skips a malformed workspace shape while a valid global layer loads", async () => {
		await writeProfiles(globalFile(), { activeProfileId: "global", profiles: [profile("global")] })
		await writeProfiles(workspaceFile(), { activeProfileId: "workspace", profiles: "not-an-array" })
		assert.equal((await new ModelProfileService(workspace).getActiveProfile())?.id, "global")
	})

	it("maps the active profile onto OpenAI-compatible API configuration fields", async () => {
		await writeProfiles(globalFile(), {
			activeProfileId: "z",
			profiles: [{ ...profile("z", "glm-5"), baseUrl: "https://api.z.ai/api/coding/paas/v4", apiKey: "" }],
		})
		const config = await new ModelProfileService(workspace).toApiConfiguration()
		assert.equal(config.apiProvider, "openai")
		assert.equal(config.openAiBaseUrl, "https://api.z.ai/api/coding/paas/v4")
		assert.equal(config.planModeOpenAiModelId, "glm-5")
		assert.equal(config.actModeOpenAiModelId, "glm-5")
	})
})
