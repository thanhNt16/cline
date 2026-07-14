import { afterEach, beforeEach, describe, it } from "bun:test"
import "should"
import * as fs from "fs/promises"
import * as path from "path"
import { BinaryManager } from "../BinaryManager"

describe("BinaryManager", () => {
	let tmpDir: string

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(import.meta.dir, ".tmp-bm-"))
	})

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
	})

	describe("getBinaryPath", () => {
		it("returns the expected path regardless of existence", () => {
			const bm = new BinaryManager(tmpDir, "darwin", "arm64")
			const expected = path.join(tmpDir, "codebase-memory-mcp", "cbm")
			should(bm.getBinaryPath()).equal(expected)
		})
	})

	describe("isBinaryPresent", () => {
		it("returns false when binary does not exist", async () => {
			const bm = new BinaryManager(tmpDir, "darwin", "arm64")
			should(await bm.isBinaryPresent()).be.false()
		})

		it("returns true when binary exists and is executable", async () => {
			const bm = new BinaryManager(tmpDir, "darwin", "arm64")
			const binPath = path.join(tmpDir, "codebase-memory-mcp", "cbm")
			await fs.mkdir(path.dirname(binPath), { recursive: true })
			await fs.writeFile(binPath, "fake binary", { mode: 0o755 })
			should(await bm.isBinaryPresent()).be.true()
		})
	})

	describe("getArchiveAssetName", () => {
		it("maps darwin/arm64 to tar.gz", () => {
			const bm = new BinaryManager(tmpDir, "darwin", "arm64")
			should(bm.getArchiveAssetName()).equal("codebase-memory-mcp-darwin-arm64.tar.gz")
		})

		it("maps linux/amd64 to tar.gz", () => {
			const bm = new BinaryManager(tmpDir, "linux", "amd64")
			should(bm.getArchiveAssetName()).equal("codebase-memory-mcp-linux-amd64.tar.gz")
		})

		it("maps windows/amd64 to zip", () => {
			const bm = new BinaryManager(tmpDir, "windows", "amd64")
			should(bm.getArchiveAssetName()).equal("codebase-memory-mcp-windows-amd64.zip")
		})
	})

	describe("parseChecksums", () => {
		it("parses checksums.txt content into a map", () => {
			const bm = new BinaryManager(tmpDir, "darwin", "arm64")
			const content = "abc123  codebase-memory-mcp-darwin-arm64.tar.gz\ndef456  codebase-memory-mcp-linux-amd64.tar.gz\n"
			const map = bm.parseChecksums(content)
			should(map.get("codebase-memory-mcp-darwin-arm64.tar.gz")).equal("abc123")
			should(map.get("codebase-memory-mcp-linux-amd64.tar.gz")).equal("def456")
		})

		it("skips empty lines", () => {
			const bm = new BinaryManager(tmpDir, "darwin", "arm64")
			const map = bm.parseChecksums("\n\nabc123  file.tar.gz\n\n")
			should(map.size).equal(1)
		})
	})
})
