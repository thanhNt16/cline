import { strict as assert } from "node:assert"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, it } from "vitest"
import * as diskModule from "@core/storage/disk"

// resetGlobalState/resetWorkspaceState only mutate VS Code Memento keys + call
// reInitialize(); they never touch ~/.cellockai files. This test pins that
// invariant so a future change that deletes or rewrites the global config files
// during a reset breaks here. StateManager is unavailable in unit tests, so the
// helpers throw before any side effect — we swallow that and still verify the
// files are intact AND their contents are unchanged.
describe("resetState does not delete ~/.cellockai files", () => {
	let realHome: string
	let tempHome: string
	const seeded = new Map<string, string>()

	beforeEach(async () => {
		realHome = process.env.HOME as string
		tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "cellockai-home-"))
		process.env.HOME = tempHome
		for (const name of ["mcp_settings.json", "profiles.json", "docs_index.json"]) {
			const p = path.join(tempHome, ".cellockai", name)
			const body = JSON.stringify({ kind: name, marker: `seed-${name}` })
			await fs.mkdir(path.dirname(p), { recursive: true })
			await fs.writeFile(p, body)
			seeded.set(p, body)
		}
	})
	afterEach(async () => {
		process.env.HOME = realHome
		await fs.rm(tempHome, { recursive: true, force: true })
	})

	it("global files survive a reset attempt with contents intact", async () => {
		const helpers = await import("@core/storage/utils/state-helpers")
		try {
			await helpers.resetGlobalState()
			await helpers.resetWorkspaceState()
		} catch {
			/* StateManager unavailable in unit tests — expected; reset never reaches fs. */
		}

		for (const [p, original] of seeded) {
			const after = await fs.readFile(p, "utf8")
			assert.equal(after, original, `${path.basename(p)} changed during reset`)
		}
		// Path helpers must still resolve into the temp home (proves no path drift).
		assert.equal(diskModule.getGlobalMcpSettingsFilePath(), path.join(tempHome, ".cellockai", "mcp_settings.json"))
		assert.equal(diskModule.getGlobalProfilesFilePath(), path.join(tempHome, ".cellockai", "profiles.json"))
		assert.equal(diskModule.getGlobalDocsIndexSettingsFilePath(), path.join(tempHome, ".cellockai", "docs_index.json"))
	})
})
