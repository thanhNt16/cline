import { afterEach, beforeEach, describe, it } from "bun:test"
import "should"
import sinon from "sinon"
import { CodebaseMemoryFacade } from "../CodebaseMemoryFacade"
import { BinaryManager } from "../BinaryManager"
import { IndexingService } from "../IndexingService"
import { GraphServerService } from "../GraphServerService"
import { McpRegistrationService } from "../McpRegistrationService"

describe("CodebaseMemoryFacade", () => {
	let sandbox: sinon.SinonSandbox
	let facade: CodebaseMemoryFacade
	let mockContext: any
	let mockMcpHub: any

	beforeEach(() => {
		sandbox = sinon.createSandbox()
		mockContext = {
			globalStorageUri: { fsPath: "/fake/storage" },
		}
		mockMcpHub = {}

		// Stub all service class prototype methods
		sandbox.stub(BinaryManager.prototype, "isBinaryPresent").resolves(true)
		sandbox.stub(BinaryManager.prototype, "getBinaryPath").returns("/fake/cbm")
		sandbox.stub(BinaryManager.prototype, "getInstalledVersion").resolves("v0.7.0")
		sandbox.stub(BinaryManager.prototype, "isUpdateAvailable").resolves(false)
		sandbox.stub(BinaryManager.prototype, "ensureBinary").resolves("/fake/cbm")

		sandbox.stub(GraphServerService.prototype, "isRunning").returns(false)
		sandbox.stub(GraphServerService.prototype, "getUrl").returns(undefined)
		sandbox.stub(GraphServerService.prototype, "start").resolves({ port: 9749, url: "http://localhost:9749" })
		sandbox.stub(GraphServerService.prototype, "stop").returns(undefined)

		sandbox.stub(McpRegistrationService.prototype, "isRegistered").resolves(true)
		sandbox.stub(McpRegistrationService.prototype, "register").resolves()
		sandbox.stub(McpRegistrationService.prototype, "unregister").resolves()

		// Stub execFile for getStatusIndexInfo (it calls `cbm cli list_projects`)
		// We'll stub it to return empty projects so getStatusIndexInfo returns null
		sandbox.stub(CodebaseMemoryFacade.prototype, "getStatusIndexInfo" as any).resolves(null)

		facade = new CodebaseMemoryFacade(mockContext, mockMcpHub)
	})

	afterEach(() => {
		sandbox.restore()
	})

	it("listTools returns 14 tools", () => {
		const tools = facade.listTools()
		should(tools.length).equal(14)
		should(tools[0].name).equal("index_repository")
	})

	it("getStatus aggregates state from all services", async () => {
		const status = await facade.getStatus()
		should(status.binaryInstalled).be.true()
		should(status.binaryVersion).equal("v0.7.0")
		should(status.isIndexed).be.false()
		should(status.mcpServerRegistered).be.true()
		should(status.graphServerRunning).be.false()
	})

	it("indexProject calls ensureBinary then indexProject then register", async () => {
		const indexStub = sandbox.stub(IndexingService.prototype, "indexProject").resolves()
		await facade.indexProject("/repo", () => {})
		sinon.assert.calledOnce(indexStub)
		sinon.assert.calledOnce(McpRegistrationService.prototype.register as any)
	})

	it("indexProject emits ERROR for empty repoPath", async () => {
		const events: any[] = []
		await facade.indexProject("", (e) => events.push(e))
		should(events.length).equal(1)
		should(events[0].message).match(/No workspace folder/)
	})

	it("viewGraph starts the graph server and returns the URL", async () => {
		const url = await facade.viewGraph()
		sinon.assert.calledOnce(GraphServerService.prototype.start as any)
		should(url).equal("http://localhost:9749")
	})

	it("stopGraphServer calls stop on graph server", () => {
		facade.stopGraphServer()
		sinon.assert.calledOnce(GraphServerService.prototype.stop as any)
	})

	it("dispose stops graph server", () => {
		facade.dispose()
		sinon.assert.calledOnce(GraphServerService.prototype.stop as any)
	})
})
