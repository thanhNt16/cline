import { strict as assert } from "node:assert"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, it } from "vitest"
import { ModelProfileService } from "@/core/profiles/ModelProfileService"
import { overlayActiveProfile } from "../active-profile-overlay"

describe("overlayActiveProfile (layered)", () => {
	let home: string
	let cwd: string
	let realHome: string
	beforeEach(async () => {
		realHome = process.env.HOME as string
		home = await fs.promises.mkdtemp(path.join(os.tmpdir(), "cellockai-home-"))
		cwd = await fs.promises.mkdtemp(path.join(os.tmpdir(), "cellockai-ws-"))
		process.env.HOME = home
	})
	afterEach(async () => {
		process.env.HOME = realHome
		await fs.promises.rm(home, { recursive: true, force: true })
		await fs.promises.rm(cwd, { recursive: true, force: true })
	})
	const write = (file: string, data: any) => {
		fs.mkdirSync(path.dirname(file), { recursive: true })
		fs.writeFileSync(file, JSON.stringify(data))
	}
	const gFile = () => path.join(home, ".cellockai", "profiles.json")
	const wFile = () => path.join(cwd, ".cellockai", "profiles.json")

	it("no profiles: returns config unchanged", () => {
		const out = overlayActiveProfile({ actModeOpenAiModelId: "keep" } as any, cwd)
		assert.equal(out.actModeOpenAiModelId, "keep")
	})

	it("overlays the global active profile", () => {
		write(gFile(), { activeProfileId: "g", profiles: [{ id: "g", baseUrl: "u", modelId: "gm", apiKey: "k" }] })
		const out = overlayActiveProfile({} as any, cwd)
		assert.equal(out.actModeOpenAiModelId, "gm")
		assert.equal(out.actModeApiProvider, "openai")
	})

	it("workspace override wins on id collision", () => {
		write(gFile(), { activeProfileId: "g", profiles: [{ id: "g", baseUrl: "u", modelId: "gm", apiKey: "k" }] })
		write(wFile(), { activeProfileId: "", profiles: [{ id: "g", baseUrl: "u", modelId: "wm", apiKey: "k" }] })
		assert.equal(overlayActiveProfile({} as any, cwd).actModeOpenAiModelId, "wm")
	})

	it("workspace active id selects a global-only profile", () => {
		write(gFile(), {
			activeProfileId: "",
			profiles: [
				{ id: "g", baseUrl: "u", modelId: "gm", apiKey: "k" },
				{ id: "g2", baseUrl: "u", modelId: "gm2", apiKey: "k" },
			],
		})
		write(wFile(), { activeProfileId: "g2", profiles: [] })
		assert.equal(overlayActiveProfile({} as any, cwd).actModeOpenAiModelId, "gm2")
	})

	it("stale workspace active id falls through to a valid global active id", () => {
		write(gFile(), {
			activeProfileId: "g",
			profiles: [
				{ id: "g", baseUrl: "u", modelId: "gm", apiKey: "k" },
				{ id: "g2", baseUrl: "u", modelId: "gm2", apiKey: "k" },
			],
		})
		write(wFile(), { activeProfileId: "stale-id", profiles: [] })
		assert.equal(overlayActiveProfile({} as any, cwd).actModeOpenAiModelId, "gm")
	})

	it("overlay active id matches ModelProfileService.getActiveProfile", async () => {
		write(gFile(), { activeProfileId: "", profiles: [{ id: "g", name: "g", baseUrl: "u", modelId: "gm", apiKey: "k" }] })
		write(wFile(), { activeProfileId: "g", profiles: [{ id: "g", name: "g", baseUrl: "u", modelId: "wm", apiKey: "k" }] })
		const svc = new ModelProfileService(cwd)
		const svcActive = await svc.getActiveProfile()
		const overlayModelId = overlayActiveProfile({} as any, cwd).actModeOpenAiModelId
		assert.equal(overlayModelId, svcActive?.modelId)
	})
})
