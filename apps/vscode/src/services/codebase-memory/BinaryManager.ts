import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { extract } from "tar"
import { Logger } from "@/shared/services/Logger"
import {
	BINARY_NAME,
	BINARY_SUBDIR,
	CBM_PINNED_VERSION,
	GITHUB_API_RELEASES_URL,
	UI_BINARY_NAME,
	UI_BINARY_SUBDIR,
} from "./constants"
import type { Arch, DownloadProgress, Platform } from "./types"

/** Hard wall-clock bound for --version probes. See getVersionOf() for why this can't just be execFile's `timeout` option. */
const VERSION_PROBE_TIMEOUT_MS = 5000

interface GitHubRelease {
	tag_name: string
	assets: Array<{
		name: string
		browser_download_url: string
	}>
}

export class BinaryManager {
	// Single-flight guards: a version-mismatch reinstall now runs a `--version` probe (up to
	// VERSION_PROBE_TIMEOUT_MS) before deciding to download, which widens the window for two
	// overlapping callers (e.g. a status refresh + an index click, or GraphCard's
	// ensureUiBinary racing indexProject's ensureBinary) to both decide "reinstall needed" and
	// extract the release tarball over the SAME destination path concurrently — corrupting the
	// binary at the byte level (observed: codesign page-hash mismatch -> the binary gets
	// SIGKILLed by the kernel on every subsequent launch, with zero stdout/stderr). Concurrent
	// callers now share one in-flight install promise instead of racing.
	private ensureBinaryPromise: Promise<string> | null = null
	private ensureUiBinaryPromise: Promise<string> | null = null

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
				Logger.log(
					`[CBM-DIAG] isBinaryPresent: cannot readdir ${path.dirname(binPath)}: ${(de as NodeJS.ErrnoException).code}`,
				)
			}
			return false
		}
	}

	async ensureBinary(onProgress?: (p: DownloadProgress) => void): Promise<string> {
		if (this.ensureBinaryPromise) {
			return this.ensureBinaryPromise
		}
		this.ensureBinaryPromise = this.doEnsureBinary(onProgress).finally(() => {
			this.ensureBinaryPromise = null
		})
		return this.ensureBinaryPromise
	}

	private async doEnsureBinary(onProgress?: (p: DownloadProgress) => void): Promise<string> {
		if (await this.isBinaryPresent()) {
			if (await this.isPinnedVersionInstalled(this.getBinaryPath()!)) {
				return this.getBinaryPath()!
			}
			Logger.log(`[CBM-DIAG] ensureBinary: installed binary does not match pinned ${CBM_PINNED_VERSION} — reinstalling`)
		}
		const release = await this.fetchPinnedRelease()
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

		// The archive's checksum being valid doesn't guarantee the extracted file on disk is
		// intact (e.g. extraction interrupted by a window reload, or — before the single-flight
		// guard above — a concurrent extract racing the same destination path). Confirm the
		// installed binary actually runs before declaring success, so a corrupt install fails
		// loudly here instead of silently hanging the first real invocation later.
		const version = await this.getVersionOf(binPath)
		if (!version) {
			await fs.unlink(binPath).catch(() => {})
			throw new Error(
				`Installed binary at ${binPath} did not respond to --version within ${VERSION_PROBE_TIMEOUT_MS}ms after extraction — install appears corrupt, removed it. Try again.`,
			)
		}
		return binPath
	}

	/**
	 * Raw `--version` stdout of the binary at `binPath`, or undefined if it can't be run.
	 * Uses spawn + our own kill/timeout instead of execFile's `timeout` option: a binary whose
	 * code signature doesn't match its on-disk pages gets SIGKILLed by the kernel at exec with
	 * zero output, which is fine — but a still-installing/half-written binary can also wedge in
	 * an uninterruptible kernel wait during exec validation that plain SIGTERM (execFile's
	 * default killSignal) does not reliably clear, leaving the awaited promise hung past the
	 * configured timeout. Race the process against our own timer unconditionally so this
	 * function is guaranteed to settle within VERSION_PROBE_TIMEOUT_MS regardless of whether the
	 * child actually dies.
	 */
	async getVersionOf(binPath: string): Promise<string | undefined> {
		return new Promise((resolve) => {
			let settled = false
			const settle = (value: string | undefined) => {
				if (settled) return
				settled = true
				resolve(value)
			}

			let child: ReturnType<typeof spawn>
			try {
				child = spawn(binPath, ["--version"], { stdio: ["ignore", "pipe", "pipe"] })
			} catch {
				settle(undefined)
				return
			}

			const timer = setTimeout(() => {
				try {
					child.kill("SIGKILL")
				} catch {
					// process may already be gone
				}
				settle(undefined)
			}, VERSION_PROBE_TIMEOUT_MS)

			let stdout = ""
			child.stdout?.on("data", (d) => (stdout += d.toString()))
			child.on("exit", (code) => {
				clearTimeout(timer)
				settle(code === 0 ? stdout.trim() || undefined : undefined)
			})
			child.on("error", () => {
				clearTimeout(timer)
				settle(undefined)
			})
		})
	}

	async getInstalledVersion(): Promise<string | undefined> {
		if (!(await this.isBinaryPresent())) return undefined
		return this.getVersionOf(this.getBinaryPath()!)
	}

	/** Bare semver extracted from `--version` output ("codebase-memory-mcp 0.9.0" -> "0.9.0"), or undefined if unparseable. */
	private extractSemver(versionOutput: string | undefined): string | undefined {
		return versionOutput?.match(/\d+\.\d+\.\d+/)?.[0]
	}

	private async isPinnedVersionInstalled(binPath: string): Promise<boolean> {
		const installed = this.extractSemver(await this.getVersionOf(binPath))
		const pinned = this.extractSemver(CBM_PINNED_VERSION)
		return !!installed && installed === pinned
	}

	async isUpdateAvailable(): Promise<boolean> {
		if (!(await this.isBinaryPresent())) return false
		return !(await this.isPinnedVersionInstalled(this.getBinaryPath()!))
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
		if (this.ensureUiBinaryPromise) {
			return this.ensureUiBinaryPromise
		}
		this.ensureUiBinaryPromise = this.doEnsureUiBinary(onProgress).finally(() => {
			this.ensureUiBinaryPromise = null
		})
		return this.ensureUiBinaryPromise
	}

	private async doEnsureUiBinary(onProgress?: (p: DownloadProgress) => void): Promise<string> {
		if (await this.isUiBinaryPresent()) {
			if (await this.isPinnedVersionInstalled(this.getUiBinaryPath()!)) {
				return this.getUiBinaryPath()!
			}
			Logger.log(
				`[CBM-DIAG] ensureUiBinary: installed UI binary does not match pinned ${CBM_PINNED_VERSION} — reinstalling`,
			)
		}
		const release = await this.fetchPinnedRelease()
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
		const binPath = await this.atomicExtract(archivePath, uiBinDir, UI_BINARY_NAME, "extractUiArchive")
		await fs.unlink(archivePath).catch(() => {})

		const version = await this.getVersionOf(binPath)
		if (!version) {
			await fs.unlink(binPath).catch(() => {})
			throw new Error(
				`Installed UI binary at ${binPath} did not respond to --version within ${VERSION_PROBE_TIMEOUT_MS}ms after extraction — install appears corrupt, removed it. Try again.`,
			)
		}
		return binPath
	}

	/** Fetches the pinned release (CBM_PINNED_VERSION), not "latest" — see constants.ts. */
	private async fetchPinnedRelease(): Promise<GitHubRelease> {
		const resp = await fetch(GITHUB_API_RELEASES_URL, {
			headers: { Accept: "application/vnd.github+json" },
		})
		if (!resp.ok) {
			throw new Error(
				`GitHub API returned ${resp.status}: ${resp.statusText} (release ${CBM_PINNED_VERSION} at ${GITHUB_API_RELEASES_URL})`,
			)
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
		return this.atomicExtract(archivePath, binDir, BINARY_NAME, "extractArchive")
	}

	/**
	 * Extracts `archivePath` into a temp sibling directory, then moves its contents into
	 * `destDir` via fs.rename (atomic on the same filesystem) instead of extracting directly
	 * into destDir. `tar.extract()` writes each entry in place (open+truncate+write), and if a
	 * previous install of this exact binary is still running (e.g. a live MCP server process —
	 * confirmed present: the process keeps its own reference to the old inode's pages and is
	 * unaffected, but a *new* `execve` of the path mid-write, or immediately after a partial
	 * write, gets a truncated Mach-O whose code-signature no longer matches its pages — the
	 * kernel SIGKILLs it on launch with zero output). Renaming a fully-written temp file into
	 * place is a single filesystem operation: a concurrent exec either sees the complete old
	 * file or the complete new one, never a partial write.
	 */
	private async atomicExtract(
		archivePath: string,
		destDir: string,
		expectedBinaryName: string,
		logTag: string,
	): Promise<string> {
		await fs.mkdir(destDir, { recursive: true })
		const tmpDir = `${destDir}.tmp-${process.pid}-${Date.now()}`
		await fs.mkdir(tmpDir, { recursive: true })
		try {
			Logger.log(`[CBM-DIAG] ${logTag}: extracting ${archivePath} into staging dir ${tmpDir}`)
			await extract({ file: archivePath, cwd: tmpDir })
			const tmpContents = await fs.readdir(tmpDir)
			Logger.log(`[CBM-DIAG] ${logTag}: staged contents=${JSON.stringify(tmpContents)}`)
			if (!tmpContents.includes(expectedBinaryName)) {
				throw new Error(
					`Expected binary "${expectedBinaryName}" not found after extraction. Archive contents: ${JSON.stringify(tmpContents)}`,
				)
			}
			await fs.chmod(path.join(tmpDir, expectedBinaryName), 0o755)

			// Move every extracted file into place with a single rename() each (atomic replace
			// of any existing file at that name) rather than extracting straight into destDir.
			for (const name of tmpContents) {
				await fs.rename(path.join(tmpDir, name), path.join(destDir, name))
			}
			const binPath = path.join(destDir, expectedBinaryName)
			Logger.log(`[CBM-DIAG] ${logTag}: moved into place, binPath=${binPath}`)
			return binPath
		} finally {
			await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
		}
	}
}
