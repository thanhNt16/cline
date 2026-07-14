import { afterEach, beforeEach, describe, it } from "bun:test"
import "should"
import { EventEmitter } from "node:events"
import sinon from "sinon"
import { GraphServerService } from "../GraphServerService"

class MockChildProcess extends EventEmitter {
	pid = 99999
	killed = false
	kill() {
		this.killed = true
		this.emit("exit", null, "SIGTERM")
	}
}

describe("GraphServerService", () => {
	let sandbox: sinon.SinonSandbox
	let mockSpawn: sinon.SinonStub
	let mockChild: MockChildProcess
	let mockFetch: sinon.SinonStub

	beforeEach(() => {
		sandbox = sinon.createSandbox()
		mockChild = new MockChildProcess()
		const cp = require("node:child_process")
		mockSpawn = sandbox.stub(cp, "spawn").returns(mockChild)
		mockFetch = sandbox.stub(globalThis, "fetch")
	})

	afterEach(() => {
		sandbox.restore()
	})

	it("isRunning returns false before start", () => {
		const svc = new GraphServerService(() => "/fake/cbm")
		should(svc.isRunning()).be.false()
	})

	it("getUrl returns undefined before start", () => {
		const svc = new GraphServerService(() => "/fake/cbm")
		should(svc.getUrl()).be.undefined()
	})

	it("start spawns process with --ui=true and resolves when port responds", async () => {
		// isPortFree: first fetch throws (port free), waitForPort: fetch resolves ok
		mockFetch
			.onCall(0)
			.rejects(new Error("refused"))
			.onCall(1)
			.resolves({ ok: true, status: 200 } as any)
		const svc = new GraphServerService(() => "/fake/cbm")
		const config = await svc.start()
		should(config.port).equal(9749)
		should(config.url).equal("http://localhost:9749")
		sinon.assert.calledWith(mockSpawn, "/fake/cbm", ["--ui=true", "--port=9749"], sinon.match.any)
	})

	it("isRunning returns true after successful start", async () => {
		mockFetch
			.onCall(0)
			.rejects(new Error("refused"))
			.onCall(1)
			.resolves({ ok: true, status: 200 } as any)
		const svc = new GraphServerService(() => "/fake/cbm")
		await svc.start()
		should(svc.isRunning()).be.true()
	})

	it("stop kills the process and clears state", async () => {
		mockFetch
			.onCall(0)
			.rejects(new Error("refused"))
			.onCall(1)
			.resolves({ ok: true, status: 200 } as any)
		const svc = new GraphServerService(() => "/fake/cbm")
		await svc.start()
		svc.stop()
		should(mockChild.killed).be.true()
		should(svc.isRunning()).be.false()
		should(svc.getUrl()).be.undefined()
	})

	it("start is a no-op if already running", async () => {
		mockFetch
			.onCall(0)
			.rejects(new Error("refused"))
			.onCall(1)
			.resolves({ ok: true, status: 200 } as any)
		const svc = new GraphServerService(() => "/fake/cbm")
		await svc.start()
		await svc.start()
		sinon.assert.calledOnce(mockSpawn)
	})
})
