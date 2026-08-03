import { describe, expect, it } from "bun:test"
import * as path from "path"
import { getSkillsDirectoriesForScan } from "./skill-directories"

describe("getSkillsDirectoriesForScan", () => {
	it("returns only project and global CellockAI skill directories", () => {
		const workspacePath = "/repo/demo"

		expect(getSkillsDirectoriesForScan(workspacePath)).toEqual([
			{ path: path.join(workspacePath, ".cellockai", "skills"), source: "project" },
			{ path: path.join(process.env.HOME ?? "", ".cellockai", "skills"), source: "global" },
		])
	})
})
