import { afterEach, beforeEach, describe, it, mock } from "bun:test"
import "should"
import { EventEmitter } from "node:events"
import * as sinon from "sinon"
import { IndexProgressEvent, IndexProgressEvent_Level } from "@shared/proto/cline/codebase_memory"

// bun loads real ESM, so sinon cannot stub the `node:child_process` namespace
// exports ("ES Modules cannot be stubbed"). Inject a module-level sinon stub
// via bun's mock.module so the full sinon stub API (.returns/.callsFake/etc.)
// keeps working through the exact specifier the SUT imports. (Same pattern as
// skills.test.ts.)
import * as actualCp from "node:child_process"
const spawnStub: sinon.SinonStub = sinon.stub()
const cpMock = () => ({ ...actualCp, spawn: spawnStub })
mock.module("node:child_process", cpMock)
mock.module("child_process", cpMock)

import { IndexingService } from "../IndexingService"

class MockChildProcess extends EventEmitter {
	stdout = new EventEmitter()
	stderr = new EventEmitter()
	pid = 12345
	killed = false
	kill() {
		this.killed = true
		this.emit("exit", null, "SIGTERM")
	}
}

describe("IndexingService", () => {
	let mockChild: MockChildProcess
	let events: IndexProgressEvent[]

	beforeEach(() => {
		mockChild = new MockChildProcess()
		events = []
		spawnStub.reset()
		spawnStub.returns(mockChild)
	})

	afterEach(() => {
		spawnStub.reset()
	})

	it("streams stdout lines as INFO events", async () => {
		const service = new IndexingService(
			() => "/fake/cbm",
			(e) => events.push(e),
			() => undefined,
		)
		const promise = service.indexProject("/repo")
		mockChild.stdout.emit("data", Buffer.from("Parsing src/foo.ts...\n"))
		mockChild.stdout.emit("data", Buffer.from("Parsing src/bar.ts...\n"))
		mockChild.stdout.emit("data", Buffer.from('{"status":"indexed","nodes":100,"edges":200}\n'))
		mockChild.emit("exit", 0, null)
		await promise
		should(events.length).be.greaterThan(2)
		should(events[0].level).equal(IndexProgressEvent_Level.INFO)
		should(events[0].message).equal("Parsing src/foo.ts...")
	})

	it("emits ERROR on non-zero exit", async () => {
		const service = new IndexingService(
			() => "/fake/cbm",
			(e) => events.push(e),
			() => undefined,
		)
		const promise = service.indexProject("/repo")
		mockChild.stderr.emit("data", Buffer.from("fatal: repo not found\n"))
		mockChild.emit("exit", 1, null)
		await promise
		const errorEvent = events.find((e) => e.level === IndexProgressEvent_Level.ERROR)
		should(errorEvent).not.be.undefined()
	})

	it("emits DONE with node/edge counts on clean exit with JSON", async () => {
		const service = new IndexingService(
			() => "/fake/cbm",
			(e) => events.push(e),
			() => undefined,
		)
		const promise = service.indexProject("/repo")
		mockChild.stdout.emit("data", Buffer.from('{"status":"indexed","nodes":500,"edges":1200}\n'))
		mockChild.emit("exit", 0, null)
		await promise
		const doneEvent = events.find((e) => e.level === IndexProgressEvent_Level.DONE)
		should(doneEvent).not.be.undefined()
		should(Number(doneEvent?.nodeCount)).equal(500)
		should(Number(doneEvent?.edgeCount)).equal(1200)
	})

	it("cancel kills the child process", async () => {
		const service = new IndexingService(
			() => "/fake/cbm",
			(e) => events.push(e),
			() => undefined,
		)
		const promise = service.indexProject("/repo")
		service.cancel()
		await promise.catch(() => {})
		should(mockChild.killed).be.true()
	})

	it("reindexProject uses the last indexed repo", async () => {
		const lastRepo = () => "/previous/repo"
		const service = new IndexingService(
			() => "/fake/cbm",
			(e) => events.push(e),
			lastRepo,
		)
		const promise = service.reindexProject()
		mockChild.emit("exit", 0, null)
		await promise
		sinon.assert.calledWith(spawnStub, "/fake/cbm", ["cli", "index_repository", sinon.match.string], sinon.match.any)
		const jsonArg = spawnStub.firstCall.args[1][2] as string
		should(JSON.parse(jsonArg).repo_path).equal("/previous/repo")
	})

	it("reindexProject emits ERROR when no repo was previously indexed", async () => {
		const service = new IndexingService(
			() => "/fake/cbm",
			(e) => events.push(e),
			() => undefined,
		)
		await service.reindexProject()
		const errorEvent = events.find((e) => e.level === IndexProgressEvent_Level.ERROR)
		should(errorEvent).not.be.undefined()
		should(errorEvent?.message).match(/No project has been indexed/)
	})
})
