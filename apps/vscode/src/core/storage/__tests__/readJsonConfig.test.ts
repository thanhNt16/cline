import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

import { readJsonConfigFile } from "../readJsonConfig"

describe("readJsonConfigFile", () => {
	let tmpDir: string

	beforeEach(async () => {
		tmpDir = path.join(os.tmpdir(), `readJsonConfig-test-${Date.now()}`)
		await fs.mkdir(tmpDir, { recursive: true })
	})

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true })
	})

	it("returns parsed JSON for a valid file", async () => {
		const filePath = path.join(tmpDir, "test.json")
		await fs.writeFile(filePath, JSON.stringify({ key: "value" }), "utf8")
		const result = await readJsonConfigFile<{ key: string }>(filePath)
		expect(result).toEqual({ key: "value" })
	})

	it("returns undefined for a missing file", async () => {
		const result = await readJsonConfigFile("/nonexistent/path/file.json")
		expect(result).toBeUndefined()
	})

	it("returns undefined for invalid JSON", async () => {
		const filePath = path.join(tmpDir, "bad.json")
		await fs.writeFile(filePath, "{invalid json}", "utf8")
		const result = await readJsonConfigFile(filePath)
		expect(result).toBeUndefined()
	})

	it("returns undefined for an empty file", async () => {
		const filePath = path.join(tmpDir, "empty.json")
		await fs.writeFile(filePath, "", "utf8")
		const result = await readJsonConfigFile(filePath)
		expect(result).toBeUndefined()
	})

	it("returns undefined for a whitespace-only file", async () => {
		const filePath = path.join(tmpDir, "whitespace.json")
		await fs.writeFile(filePath, "   \n\t  ", "utf8")
		const result = await readJsonConfigFile(filePath)
		expect(result).toBeUndefined()
	})

	it("returns parsed object for nested JSON", async () => {
		const filePath = path.join(tmpDir, "nested.json")
		const data = { a: { b: { c: 1 } }, d: [1, 2, 3] }
		await fs.writeFile(filePath, JSON.stringify(data), "utf8")
		const result = await readJsonConfigFile<typeof data>(filePath)
		expect(result).toEqual(data)
	})
})
