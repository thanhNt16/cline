import { afterEach, describe, it } from "bun:test"
import "should"
import os from "os"
import path from "path"
import { AgentConfigLoader } from "../AgentConfigLoader"

describe("AgentConfigLoader", () => {
	afterEach(async () => {
		await AgentConfigLoader.resetInstanceForTests()
	})

	it("should resolve the default agents config directory under Documents/CellockAI/Agents", async () => {
		const homeDir = os.homedir()
		const loader = AgentConfigLoader.getInstance(homeDir)
		await loader.ready()

		loader.getConfigPath().should.equal(path.join(homeDir, "Documents", "CellockAI", "Agents"))
	})
})
