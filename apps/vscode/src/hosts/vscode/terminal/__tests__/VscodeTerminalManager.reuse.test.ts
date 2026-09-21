import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as vscode from "vscode"

// Mock vscode before importing the class under test
vi.mock("vscode", () => {
	const disposables: vscode.Disposable[] = []
	return {
		window: {
			onDidStartTerminalShellExecution: vi.fn(() => ({ dispose: vi.fn() })),
			onDidChangeTerminalState: vi.fn(() => ({ dispose: vi.fn() })),
		},
		Disposable: { from: vi.fn() },
		ThemeIcon: vi.fn(),
		Uri: {
			file: (p: string) => ({ fsPath: p }),
		},
	}
})

import { VscodeTerminalManager } from "../VscodeTerminalManager"
import { TerminalRegistry } from "../VscodeTerminalRegistry"

// --- Helpers ---

function createMockTerminal(opts: Partial<{ cwd: string; shellPath: string }> = {}): any {
	const cwd = opts.cwd ?? "/workspace"
	return {
		name: "CellockAI",
		show: vi.fn(),
		sendText: vi.fn(),
		dispose: vi.fn(function (this: any) {
			this._disposed = true
		}),
		shellIntegration: { cwd: { fsPath: cwd } },
		exitStatus: undefined,
		processId: Promise.resolve(12345),
		creationOptions: {},
		state: {},
		hide: vi.fn(),
	}
}

function injectTerminalsIntoRegistry(terminals: Array<{ terminal: any; busy: boolean; shellPath?: string }>): void {
	;(TerminalRegistry as any).terminals = terminals.map((t, i) => ({
		terminal: t.terminal,
		busy: t.busy,
		lastCommand: "",
		id: i + 1,
		shellPath: t.shellPath,
		lastActive: Date.now(),
	}))
}

beforeEach(() => {
	;(TerminalRegistry as any).terminals = []
})

afterEach(() => {
	vi.restoreAllMocks()
	;(TerminalRegistry as any).terminals = []
})

describe("VscodeTerminalManager — createIfNone option", () => {
	it("returns undefined when createIfNone=false and no reusable terminal exists", async () => {
		injectTerminalsIntoRegistry([])
		const manager = new VscodeTerminalManager()

		const result = await manager.getOrCreateTerminal("/workspace", "default", { createIfNone: false })

		expect(result).toBeUndefined()
	})

	it("returns undefined when createIfNone=false and all terminals are busy", async () => {
		const busyTerm = createMockTerminal({ cwd: "/workspace" })
		injectTerminalsIntoRegistry([{ terminal: busyTerm, busy: true }])
		const manager = new VscodeTerminalManager()

		const result = await manager.getOrCreateTerminal("/workspace", "default", { createIfNone: false })

		expect(result).toBeUndefined()
	})

	it("returns undefined when createIfNone=false and cwd mismatches", async () => {
		const otherCwdTerm = createMockTerminal({ cwd: "/other" })
		injectTerminalsIntoRegistry([{ terminal: otherCwdTerm, busy: false }])
		const manager = new VscodeTerminalManager()

		const result = await manager.getOrCreateTerminal("/workspace", "default", { createIfNone: false })

		expect(result).toBeUndefined()
	})

	it("returns the reusable terminal when createIfNone=false and a free matching terminal exists", async () => {
		const freeTerm = createMockTerminal({ cwd: "/workspace" })
		injectTerminalsIntoRegistry([{ terminal: freeTerm, busy: false }])
		const manager = new VscodeTerminalManager()

		const result = await manager.getOrCreateTerminal("/workspace", "default", { createIfNone: false })

		expect(result).toBeDefined()
		expect((result as any).terminal).toBe(freeTerm)
		expect((result as any).busy).toBe(true)
	})

	it("defaults to creating (createIfNone=true) when option is omitted", async () => {
		injectTerminalsIntoRegistry([])
		const manager = new VscodeTerminalManager()

		let reachedCreate = false
		const origCreate = TerminalRegistry.createTerminal
		;(TerminalRegistry as any).createTerminal = (...args: unknown[]) => {
			reachedCreate = true
			throw new Error("no real vscode")
		}

		try {
			await manager.getOrCreateTerminal("/workspace")
		} catch {
			// Expected — vscode mock doesn't support createTerminal
		}

		expect(reachedCreate).toBe(true)
		;(TerminalRegistry as any).createTerminal = origCreate
	})
})

describe("VscodeTerminalManager — disposeAll", () => {
	it("disposes each pool terminal once", async () => {
		const term1 = createMockTerminal({ cwd: "/workspace" })
		const term2 = createMockTerminal({ cwd: "/workspace" })

		injectTerminalsIntoRegistry([
			{ terminal: term1, busy: false },
			{ terminal: term2, busy: false },
		])
		const manager = new VscodeTerminalManager()

		const t1 = await manager.getOrCreateTerminal("/workspace", "default")
		const t2 = await manager.getOrCreateTerminal("/workspace", "default")
		expect(t1).toBeDefined()
		expect(t2).toBeDefined()

		manager.disposeAll()

		expect(term1.dispose).toHaveBeenCalledTimes(1)
		expect(term2.dispose).toHaveBeenCalledTimes(1)
	})

	it("skips already-closed terminals", () => {
		const closedTerm = createMockTerminal({ cwd: "/workspace" })
		closedTerm.exitStatus = 0 // Simulates a closed terminal
		const manager = new VscodeTerminalManager()
		// Directly inject into the pool and registry to bypass
		// getOrCreateTerminal (which would try to create a new one).
		;(manager as any).terminalIds.add(1)
		injectTerminalsIntoRegistry([{ terminal: closedTerm, busy: false }])

		manager.disposeAll()

		expect(closedTerm.dispose).not.toHaveBeenCalled()
	})
	it("handles dispose errors gracefully", () => {
		const badTerm = createMockTerminal({ cwd: "/workspace" })
		badTerm.dispose = vi.fn(() => {
			throw new Error("already gone")
		})
		const manager = new VscodeTerminalManager()
		;(manager as any).terminalIds.add(1)
		injectTerminalsIntoRegistry([{ terminal: badTerm, busy: false }])

		manager.disposeAll()

		expect(badTerm.dispose).toHaveBeenCalledTimes(1)
	})
})
