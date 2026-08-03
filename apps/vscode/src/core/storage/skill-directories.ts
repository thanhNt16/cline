import os from "os"
import * as path from "path"

export type SkillsScanDirectory = {
	path: string
	source: "project" | "global"
}

// Must mirror resolveGlobalSkillsConfigDirPath() in @cline/shared/storage.
// The shared SDK build does not regenerate type declarations reliably, so the
// literal is duplicated here rather than imported across the package boundary.
function getClineSkillsDirectoryPath(): string {
	return path.join(os.homedir(), ".cellockai", "skills")
}

/**
 * Returns the list of skills directories to scan without creating them.
 * Order is project directories first, then global directories.
 */
export function getSkillsDirectoriesForScan(cwd: string): SkillsScanDirectory[] {
	return [
		{ path: path.join(cwd, ".cellockai", "skills"), source: "project" },
		{ path: getClineSkillsDirectoryPath(), source: "global" },
	]
}
