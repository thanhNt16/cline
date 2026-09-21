import { afterEach, beforeEach, describe, it } from "bun:test"
import "should"
import archiver from "archiver"
import { createWriteStream } from "fs"
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
			const expected = path.join(tmpDir, "codebase-memory-mcp", "codebase-memory-mcp")
			should(bm.getBinaryPath()).equal(expected)
		})

		it("appends .exe on windows", () => {
			const bm = new BinaryManager(tmpDir, "windows", "amd64")
			const expected = path.join(tmpDir, "codebase-memory-mcp", "codebase-memory-mcp.exe")
			should(bm.getBinaryPath()).equal(expected)
		})

		it("appends .exe to the UI binary path on windows", () => {
			const bm = new BinaryManager(tmpDir, "windows", "amd64")
			const expected = path.join(tmpDir, "codebase-memory-mcp-ui", "codebase-memory-mcp.exe")
			should(bm.getUiBinaryPath()).equal(expected)
		})
	})

	describe("isBinaryPresent", () => {
		it("returns false when binary does not exist", async () => {
			const bm = new BinaryManager(tmpDir, "darwin", "arm64")
			should(await bm.isBinaryPresent()).be.false()
		})

		it("returns true when binary exists and is executable", async () => {
			const bm = new BinaryManager(tmpDir, "darwin", "arm64")
			const binPath = path.join(tmpDir, "codebase-memory-mcp", "codebase-memory-mcp")
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

		it("maps linux/amd64 to the portable tar.gz (static — no glibc floor)", () => {
			const bm = new BinaryManager(tmpDir, "linux", "amd64")
			should(bm.getArchiveAssetName()).equal("codebase-memory-mcp-linux-amd64-portable.tar.gz")
			should(bm.getUiArchiveAssetName()).equal("codebase-memory-mcp-ui-linux-amd64-portable.tar.gz")
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

	describe("atomicExtract", () => {
		async function makeZip(filePath: string, entries: Record<string, string>): Promise<void> {
			const output = createWriteStream(filePath)
			const archive = archiver("zip")
			const done = new Promise<void>((resolve, reject) => {
				output.on("close", () => resolve())
				archive.on("error", reject)
			})
			archive.pipe(output)
			for (const [name, content] of Object.entries(entries)) {
				archive.append(content, { name })
			}
			await archive.finalize()
			await done
		}

		it("extracts a .zip archive (windows release format)", async () => {
			const bm = new BinaryManager(tmpDir, "windows", "amd64")
			const zipPath = path.join(tmpDir, "codebase-memory-mcp-windows-amd64.zip")
			await makeZip(zipPath, { "codebase-memory-mcp.exe": "MZ fake exe", LICENSE: "license text" })

			const destDir = path.join(tmpDir, "codebase-memory-mcp")
			const binPath = await bm["atomicExtract"](zipPath, destDir, "codebase-memory-mcp.exe", "test")

			should(binPath).equal(path.join(destDir, "codebase-memory-mcp.exe"))
			should(await fs.readFile(binPath, "utf8")).equal("MZ fake exe")
			should(await fs.readFile(path.join(destDir, "LICENSE"), "utf8")).equal("license text")
		})

		it("rejects when the expected binary is missing from the archive", async () => {
			const bm = new BinaryManager(tmpDir, "windows", "amd64")
			const zipPath = path.join(tmpDir, "bad.zip")
			await makeZip(zipPath, { "something-else.exe": "nope" })

			await bm["atomicExtract"](
				zipPath,
				path.join(tmpDir, "dest"),
				"codebase-memory-mcp.exe",
				"test",
			).should.be.rejectedWith(/Expected binary "codebase-memory-mcp\.exe" not found/)
		})
	})
})
