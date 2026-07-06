import { strict as assert } from "node:assert"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { ModelProfileService } from "../ModelProfileService"

describe("ModelProfileService", () => {
	let cwd: string
	beforeEach(async () => {
		cwd = await fs.mkdtemp(path.join(os.tmpdir(), "cellockai-"))
	})
	afterEach(async () => {
		await fs.rm(cwd, { recursive: true, force: true })
	})

	it("seeds a default profile when profiles.json is absent", async () => {
		const svc = new ModelProfileService(cwd)
		const active = await svc.getActiveProfile()
		assert.equal(active.baseUrl, "https://api.z.ai/api/coding/paas/v4")
		assert.equal(active.modelId, "glm-5.2")
		assert.ok(active.name.length > 0)
		// file should now exist on disk
		const raw = await fs.readFile(path.join(cwd, ".cellockai", "profiles.json"), "utf8")
		assert.ok(JSON.parse(raw).profiles.length === 1)
	})

	it("round-trips an added profile and switches active", async () => {
		const svc = new ModelProfileService(cwd)
		const added = await svc.addProfile({ name: "Local", baseUrl: "http://localhost:1234/v1", modelId: "qwen", apiKey: "k" })
		await svc.setActiveProfile(added.id)
		const reloaded = new ModelProfileService(cwd)
		const active = await reloaded.getActiveProfile()
		assert.equal(active.id, added.id)
		assert.equal(active.modelId, "qwen")
	})

	it("maps the active profile onto OpenAI-compatible apiConfiguration fields", async () => {
		const svc = new ModelProfileService(cwd)
		const cfg = await svc.toApiConfiguration()
		assert.equal(cfg.apiProvider, "openai")
		assert.equal(cfg.openAiBaseUrl, "https://api.z.ai/api/coding/paas/v4")
		assert.equal(cfg.planModeOpenAiModelId, "glm-5.2")
		assert.equal(cfg.actModeOpenAiModelId, "glm-5.2")
	})
})
