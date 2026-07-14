import { createHash } from "node:crypto"
import * as fs from "node:fs/promises"
import { createReadStream } from "node:fs"
import * as path from "node:path"
import { extract } from "tar"
import { Logger } from "@/shared/services/Logger"
import { BINARY_NAME, BINARY_SUBDIR, GITHUB_API_RELEASES_URL, UI_BINARY_NAME, UI_BINARY_SUBDIR } from "./constants"
import type { Arch, DownloadProgress, Platform } from "./types"

interface GitHubRelease {
	tag_name: string
	assets: Array<{
		name: string
		browser_download_url: string
	}>
}

export class BinaryManager {
	constructor(
		private readonly storageDir: string,
		private readonly platform: Platform,
		private readonly arch: Arch,
	) {}

	getBinaryPath(): string | undefined {
		return path.join(this.storageDir, BINARY_SUBDIR, BINARY_NAME)
	}

	async isBinaryPresent(): Promise<boolean> {
		const binPath = this.getBinaryPath()
		Logger.log(`[CBM-DIAG] isBinaryPresent: storageDir=${this.storageDir} binPath=${binPath}`)
		if (!binPath) return false
		try {
			await fs.access(binPath, fs.constants.X_OK)
			Logger.log(`[CBM-DIAG] isBinaryPresent: ${binPath} EXISTS and EXECUTABLE`)
			return true
		} catch (e) {
			Logger.log(`[CBM-DIAG] isBinaryPresent: ${binPath} NOT accessible: ${(e as NodeJS.ErrnoException).code}`)
			try {
				const dirContents = await fs.readdir(path.dirname(binPath))
				Logger.log(`[CBM-DIAG] isBinaryPresent: dir ${path.dirname(binPath)} contents=${JSON.stringify(dirContents)}`)
			} catch (de) {
				Logger.log(`[CBM-DIAG] isBinaryPresent: cannot readdir ${path.dirname(binPath)}: ${(de as NodeJS.ErrnoException).code}`)
			}
			return false
		}
	}

	async ensureBinary(onProgress?: (p: DownloadProgress) => void): Promise<string> {
		if (await this.isBinaryPresent()) {
			return this.getBinaryPath()!
		}
		const release = await this.fetchLatestRelease()
		const assetName = this.getArchiveAssetName()
		const asset = release.assets.find((a) => a.name === assetName)
		if (!asset) {
			throw new Error(`No binary asset found for ${assetName} in release ${release.tag_name}`)
		}
		const checksums = await this.fetchChecksums(release)
		const expectedHash = checksums.get(assetName)
		if (!expectedHash) {
			throw new Error(`No checksum found for ${assetName} in checksums.txt`)
		}
		const archivePath = await this.downloadArchive(asset.browser_download_url, asset.name, onProgress)
		await this.verifyChecksum(archivePath, expectedHash)
		const binPath = await this.extractArchive(archivePath)
		await fs.unlink(archivePath).catch(() => {})
		return binPath
	}

	async getInstalledVersion(): Promise<string | undefined> {
		if (!(await this.isBinaryPresent())) return undefined
		const binPath = this.getBinaryPath()!
		try {
			const { execFile } = await import("node:child_process")
			const { promisify } = await import("node:util")
			const execFileAsync = promisify(execFile)
			const { stdout } = await execFileAsync(binPath, ["--version"], { timeout: 5000 })
			return stdout.trim() || undefined
		} catch {
			return undefined
		}
	}

	async isUpdateAvailable(): Promise<boolean> {
		const installed = await this.getInstalledVersion()
		if (!installed) return false
		try {
			const release = await this.fetchLatestRelease()
			return release.tag_name !== installed
		} catch {
			return false
		}
	}

	getArchiveAssetName(): string {
		if (this.platform === "windows") {
			return `codebase-memory-mcp-${this.platform}-${this.arch}.zip`
		}
		return `codebase-memory-mcp-${this.platform}-${this.arch}.tar.gz`
	}

	getUiArchiveAssetName(): string {
		if (this.platform === "windows") {
			return `codebase-memory-mcp-ui-${this.platform}-${this.arch}.zip`
		}
		return `codebase-memory-mcp-ui-${this.platform}-${this.arch}.tar.gz`
	}

	getUiBinaryPath(): string | undefined {
		return path.join(this.storageDir, UI_BINARY_SUBDIR, UI_BINARY_NAME)
	}

	async isUiBinaryPresent(): Promise<boolean> {
		const binPath = this.getUiBinaryPath()
		if (!binPath) return false
		try {
			await fs.access(binPath, fs.constants.X_OK)
			return true
		} catch {
			return false
		}
	}

	async ensureUiBinary(onProgress?: (p: DownloadProgress) => void): Promise<string> {
		if (await this.isUiBinaryPresent()) {
			return this.getUiBinaryPath()!
		}
		const release = await this.fetchLatestRelease()
		const assetName = this.getUiArchiveAssetName()
		const asset = release.assets.find((a) => a.name === assetName)
		if (!asset) {
			throw new Error(`No UI binary asset found for ${assetName} in release ${release.tag_name}`)
		}
		const checksums = await this.fetchChecksums(release)
		const expectedHash = checksums.get(assetName)
		if (!expectedHash) {
			throw new Error(`No checksum found for ${assetName} in checksums.txt`)
		}
		const archivePath = await this.downloadArchive(asset.browser_download_url, asset.name)
		await this.verifyChecksum(archivePath, expectedHash)
		const uiBinDir = path.join(this.storageDir, UI_BINARY_SUBDIR)
		await fs.mkdir(uiBinDir, { recursive: true })
		Logger.log(`[CBM-DIAG] extractUiArchive: extracting ${archivePath} into ${uiBinDir}`)
		await extract({ file: archivePath, cwd: uiBinDir })
		const dirContents = await fs.readdir(uiBinDir)
		Logger.log(`[CBM-DIAG] extractUiArchive: dir contents=${JSON.stringify(dirContents)}`)
		const binPath = path.join(uiBinDir, UI_BINARY_NAME)
		Logger.log(`[CBM-DIAG] extractUiArchive: expected binPath=${binPath} exists=${dirContents.includes(UI_BINARY_NAME)}`)
		if (!dirContents.includes(UI_BINARY_NAME)) {
			throw new Error(
				`Expected UI binary "${UI_BINARY_NAME}" not found after extraction. ` +
					`Archive contents: ${JSON.stringify(dirContents)}`,
			)
		}
		await fs.chmod(binPath, 0o755)
		await fs.unlink(archivePath).catch(() => {})
		return binPath
	}

	private async fetchLatestRelease(): Promise<GitHubRelease> {
		const resp = await fetch(GITHUB_API_RELEASES_URL, {
			headers: { Accept: "application/vnd.github+json" },
		})
		if (!resp.ok) {
			throw new Error(`GitHub API returned ${resp.status}: ${resp.statusText}`)
		}
		return (await resp.json()) as GitHubRelease
	}

	private async fetchChecksums(release: GitHubRelease): Promise<Map<string, string>> {
		const checksumsAsset = release.assets.find((a) => a.name === "checksums.txt")
		if (!checksumsAsset) {
			throw new Error("checksums.txt not found in release assets")
		}
		const resp = await fetch(checksumsAsset.browser_download_url)
		if (!resp.ok) {
			throw new Error(`Failed to download checksums.txt: ${resp.status}`)
		}
		const text = await resp.text()
		return this.parseChecksums(text)
	}

	parseChecksums(content: string): Map<string, string> {
		const map = new Map<string, string>()
		for (const line of content.split("\n")) {
			const trimmed = line.trim()
			if (!trimmed) continue
			const parts = trimmed.split(/\s+/)
			if (parts.length >= 2) {
				map.set(parts[1], parts[0])
			}
		}
		return map
	}

	private async downloadArchive(url: string, filename: string, onProgress?: (p: DownloadProgress) => void): Promise<string> {
		const resp = await fetch(url)
		if (!resp.ok) {
			throw new Error(`Failed to download ${filename}: ${resp.status}`)
		}
		const bytesTotal = Number(resp.headers.get("content-length") ?? 0)
		const archivePath = path.join(this.storageDir, filename)
		await fs.mkdir(this.storageDir, { recursive: true })
		if (!resp.body) {
			throw new Error("No response body for archive download")
		}
		const reader = resp.body.getReader()
		const chunks: Buffer[] = []
		let bytesDownloaded = 0
		for (;;) {
			const { done, value } = await reader.read()
			if (done) break
			chunks.push(Buffer.from(value))
			bytesDownloaded += value.byteLength
			if (onProgress) {
				onProgress({ bytesDownloaded, bytesTotal, pct: bytesTotal > 0 ? (bytesDownloaded / bytesTotal) * 100 : 0 })
			}
		}
		await fs.writeFile(archivePath, Buffer.concat(chunks))
		return archivePath
	}

	private async verifyChecksum(archivePath: string, expectedHash: string): Promise<void> {
		const hash = createHash("sha256")
		const stream = createReadStream(archivePath)
		for await (const chunk of stream) {
			hash.update(chunk as Buffer)
		}
		const actual = hash.digest("hex")
		if (actual !== expectedHash) {
			await fs.unlink(archivePath).catch(() => {})
			throw new Error(`Checksum mismatch for ${path.basename(archivePath)}: expected ${expectedHash}, got ${actual}`)
		}
	}

	private async extractArchive(archivePath: string): Promise<string> {
		const binDir = path.join(this.storageDir, BINARY_SUBDIR)
		await fs.mkdir(binDir, { recursive: true })
		Logger.log(`[CBM-DIAG] extractArchive: extracting ${archivePath} into ${binDir}`)
		await extract({ file: archivePath, cwd: binDir })
		const dirContents = await fs.readdir(binDir)
		Logger.log(`[CBM-DIAG] extractArchive: dir contents after extract=${JSON.stringify(dirContents)}`)
		const binPath = path.join(binDir, BINARY_NAME)
		Logger.log(`[CBM-DIAG] extractArchive: expected binPath=${binPath} exists=${dirContents.includes(BINARY_NAME)}`)
		if (!dirContents.includes(BINARY_NAME)) {
			throw new Error(
				`Expected binary "${BINARY_NAME}" not found after extraction. ` +
					`Archive contents: ${JSON.stringify(dirContents)}`,
			)
		}
		await fs.chmod(binPath, 0o755)
		return binPath
	}
}
