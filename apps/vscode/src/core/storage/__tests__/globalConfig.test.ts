import { strict as assert } from "node:assert"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, it } from "vitest"
import {
	getCellockaiGlobalDirectoryPath,
	getGlobalDocsIndexSettingsFilePath,
	getGlobalProfilesFilePath,
	writeJsonConfigFileAtomic,
} from "@core/storage/disk"

describe("global config path helpers + atomic writer", () => {
	let home: string
	let realHome: string

	beforeEach(async () => {
		realHome = process.env.HOME as string
		home = await fs.mkdtemp(path.join(os.tmpdir(), "cellockai-home-"))
		process.env.HOME = home
	})
	afterEach(async () => {
		process.env.HOME = realHome
		await fs.rm(home, { recursive: true, force: true })
	})

	it("global dir is <home>/.cellockai", () => {
		assert.equal(getCellockaiGlobalDirectoryPath(), path.join(home, ".cellockai"))
		assert.equal(getGlobalProfilesFilePath(), path.join(home, ".cellockai", "profiles.json"))
		assert.equal(getGlobalDocsIndexSettingsFilePath(), path.join(home, ".cellockai", "docs_index.json"))
	})

	it("creates parent dirs and writes JSON atomically", async () => {
		const file = path.join(home, ".cellockai", "deep", "docs_index.json")
		await writeJsonConfigFileAtomic(file, { serverUrl: "http://x:9", lastProjects: {} })
		const raw = await fs.readFile(file, "utf8")
		assert.deepEqual(JSON.parse(raw), { serverUrl: "http://x:9", lastProjects: {} })
	})

	it("overwrites an existing file", async () => {
		const file = path.join(home, ".cellockai", "profiles.json")
		await writeJsonConfigFileAtomic(file, { activeProfileId: "", profiles: [] })
		await writeJsonConfigFileAtomic(file, { activeProfileId: "a", profiles: [{ id: "a" }] })
		const raw = await fs.readFile(file, "utf8")
		assert.equal(JSON.parse(raw).activeProfileId, "a")
	})
})
