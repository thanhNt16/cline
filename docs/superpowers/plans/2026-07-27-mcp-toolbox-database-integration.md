# mcp-toolbox Database Integration (PostgreSQL) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Connect Database" wizard tab to the existing MCP settings panel that registers a PostgreSQL mcp-toolbox prebuilt server via the existing `addStdioMcpServer` RPC.

**Architecture:** Pure frontend addition over the existing stdio MCP path — no backend, proto, or storage changes. A pure builder maps connection fields → `{ serverName, command, args, env }`; a new form component calls the existing `McpServiceClient.addStdioMcpServer` RPC; `McpConfigurationView` gains a "Database" tab that renders the form.

**Tech Stack:** React + TypeScript (webview-ui), Tailwind + VS Code CSS variables, Vitest + @testing-library/react, protobuf-es (`AddStdioMcpServerRequest`), grpc-client (`McpServiceClient`).

## Global Constraints

- v1 is PostgreSQL only, mcp-toolbox **prebuilt** mode. No `tools.yaml`, no custom tools, no binary bundling.
- The registered server is an ordinary stdio entry written to `cline_mcp_settings.json`; credentials are stored as plaintext env (identical to every other MCP server today).
- The exact server config produced is: `command: "npx"`, `args: ["-y", "@toolbox-sdk/server", "--prebuilt=postgres", "--stdio"]`, env keys `POSTGRES_HOST | POSTGRES_PORT | POSTGRES_DATABASE | POSTGRES_USER | POSTGRES_PASSWORD` (and optional `POSTGRES_QUERY_PARAMS`).
- `autoApprove` must remain empty — do **not** auto-enable `execute_sql`.
- Follow existing webview patterns: `useState` form state, `useExtensionState().setMcpServers`, `McpServiceClient` from `@/services/grpc-client`, Tailwind `*-vscode-*` classes, styled-components `TabButton` for tabs.
- New `<label>` elements must associate via `htmlFor`/`id` (accessibility + testability via `getByLabelText`).
- One preset now; the builder file is the single place to add MySQL/SQLite later (upgrade to Approach B only when a second DB type or in-form edit arrives).

---

## File Structure

- **Create** `webview-ui/src/components/mcp/configuration/tabs/add-server/databasePresets.ts` — pure, side-effect-free builder: connection fields → stdio server config. Single source of truth for the toolbox command/args + env-key map + defaults.
- **Create** `webview-ui/src/components/mcp/configuration/tabs/add-server/databasePresets.test.ts` — unit tests for the builder (the only non-trivial logic).
- **Create** `webview-ui/src/components/mcp/configuration/tabs/add-server/AddDatabaseServerForm.tsx` — the wizard form (React). Collects fields, validates, calls the existing `addStdioMcpServer` RPC via the builder output.
- **Create** `webview-ui/src/components/mcp/configuration/tabs/add-server/AddDatabaseServerForm.test.tsx` — render + submit test asserting the RPC payload.
- **Modify** `src/shared/mcp.ts` — extend the `McpViewTab` union with `"addDatabase"`.
- **Modify** `webview-ui/src/components/mcp/configuration/McpConfigurationView.tsx` — add the "Database" tab button + content branch rendering `AddDatabaseServerForm`.
- **Modify** `webview-ui/src/components/mcp/configuration/McpConfigurationView.test.tsx` — assert the "Database" tab is present and renders the form.

---

### Task 1: Pure config builder `databasePresets.ts`

**Files:**
- Create: `webview-ui/src/components/mcp/configuration/tabs/add-server/databasePresets.ts`
- Test: `webview-ui/src/components/mcp/configuration/tabs/add-server/databasePresets.test.ts`

**Interfaces:**
- Produces: `PostgresConnectionFields`, `StdioServerConfig`, and `buildPostgresConfig(fields: PostgresConnectionFields): StdioServerConfig`. Task 2 imports `buildPostgresConfig` and `PostgresConnectionFields` from this module.

- [ ] **Step 1: Write the failing test**

Create `webview-ui/src/components/mcp/configuration/tabs/add-server/databasePresets.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { buildPostgresConfig } from "./databasePresets"

describe("buildPostgresConfig", () => {
	it("uses npx with the prebuilt postgres args", () => {
		const cfg = buildPostgresConfig({
			name: "toolbox-postgres",
			database: "appdb",
			user: "appuser",
			password: "secret",
		})
		expect(cfg.command).toBe("npx")
		expect(cfg.args).toEqual(["-y", "@toolbox-sdk/server", "--prebuilt=postgres", "--stdio"])
	})

	it("applies host/port defaults when blank", () => {
		const cfg = buildPostgresConfig({
			name: "pg",
			host: "   ",
			port: "",
			database: "appdb",
			user: "u",
			password: "p",
		})
		expect(cfg.env.POSTGRES_HOST).toBe("127.0.0.1")
		expect(cfg.env.POSTGRES_PORT).toBe("5432")
	})

	it("uses provided host/port", () => {
		const cfg = buildPostgresConfig({
			name: "pg",
			host: "db.example.com",
			port: "6543",
			database: "appdb",
			user: "u",
			password: "p",
		})
		expect(cfg.env.POSTGRES_HOST).toBe("db.example.com")
		expect(cfg.env.POSTGRES_PORT).toBe("6543")
	})

	it("maps database/user/password", () => {
		const cfg = buildPostgresConfig({
			name: "pg",
			database: "appdb",
			user: "u",
			password: "p",
		})
		expect(cfg.env.POSTGRES_DATABASE).toBe("appdb")
		expect(cfg.env.POSTGRES_USER).toBe("u")
		expect(cfg.env.POSTGRES_PASSWORD).toBe("p")
	})

	it("omits POSTGRES_QUERY_PARAMS when blank", () => {
		const cfg = buildPostgresConfig({
			name: "pg",
			database: "appdb",
			user: "u",
			password: "p",
			queryParams: "  ",
		})
		expect(cfg.env).not.toHaveProperty("POSTGRES_QUERY_PARAMS")
	})

	it("includes POSTGRES_QUERY_PARAMS when provided", () => {
		const cfg = buildPostgresConfig({
			name: "pg",
			database: "appdb",
			user: "u",
			password: "p",
			queryParams: "sslmode=require",
		})
		expect(cfg.env.POSTGRES_QUERY_PARAMS).toBe("sslmode=require")
	})

	it("carries the server name through", () => {
		const cfg = buildPostgresConfig({
			name: "my-pg",
			database: "appdb",
			user: "u",
			password: "p",
		})
		expect(cfg.serverName).toBe("my-pg")
	})
})
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/vscode`):
```bash
cd webview-ui && npx vitest run src/components/mcp/configuration/tabs/add-server/databasePresets.test.ts
```
Expected: FAIL — `Failed to resolve import "./databasePresets"` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `webview-ui/src/components/mcp/configuration/tabs/add-server/databasePresets.ts`:

```ts
/**
 * Pure builder for mcp-toolbox prebuilt MCP server configs.
 * ponytail: ceiling — single preset (postgres) today. Add MySQL/SQLite/Cloud
 * presets here later; upgrade to Approach B (a `_kind` marker + dedicated
 * addDatabaseServer/editDatabaseServer RPCs) only when a second preset or
 * in-form editing is needed.
 */

export interface PostgresConnectionFields {
	/** MCP server name (also the key in cline_mcp_settings.json). */
	name: string
	/** Optional — defaults to 127.0.0.1. */
	host?: string
	/** Optional — defaults to 5432. */
	port?: string
	/** Required. */
	database: string
	/** Required. */
	user: string
	/** Required. */
	password: string
	/** Optional — appended to the connection string as raw query params. */
	queryParams?: string
}

export interface StdioServerConfig {
	serverName: string
	command: string
	args: string[]
	env: Record<string, string>
}

const POSTGRES_PREBUILT_ARGS = ["-y", "@toolbox-sdk/server", "--prebuilt=postgres", "--stdio"]

export function buildPostgresConfig(fields: PostgresConnectionFields): StdioServerConfig {
	const env: Record<string, string> = {
		POSTGRES_HOST: (fields.host ?? "").trim() || "127.0.0.1",
		POSTGRES_PORT: (fields.port ?? "").trim() || "5432",
		POSTGRES_DATABASE: fields.database,
		POSTGRES_USER: fields.user,
		POSTGRES_PASSWORD: fields.password,
	}
	const queryParams = (fields.queryParams ?? "").trim()
	if (queryParams) {
		env.POSTGRES_QUERY_PARAMS = queryParams
	}
	return {
		serverName: fields.name,
		command: "npx",
		args: POSTGRES_PREBUILT_ARGS,
		env,
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd webview-ui && npx vitest run src/components/mcp/configuration/tabs/add-server/databasePresets.test.ts
```
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add webview-ui/src/components/mcp/configuration/tabs/add-server/databasePresets.ts \
        webview-ui/src/components/mcp/configuration/tabs/add-server/databasePresets.test.ts
git commit -m "feat(mcp): add pure postgres config builder for mcp-toolbox wizard"
```

---

### Task 2: Wizard form `AddDatabaseServerForm.tsx`

**Files:**
- Create: `webview-ui/src/components/mcp/configuration/tabs/add-server/AddDatabaseServerForm.tsx`
- Test: `webview-ui/src/components/mcp/configuration/tabs/add-server/AddDatabaseServerForm.test.tsx`

**Interfaces:**
- Consumes: `buildPostgresConfig`, `PostgresConnectionFields` from `./databasePresets` (Task 1); `McpServiceClient.addStdioMcpServer` and `AddStdioMcpServerRequest` from the existing RPC layer; `useExtensionState().setMcpServers`.
- Produces: default-exported React component `AddDatabaseServerForm({ onDone }: { onDone: () => void })`. Task 3 renders it as `<AddDatabaseServerForm onDone={...} />`.

**RPC contract (verified):** `McpServiceClient.addStdioMcpServer(AddStdioMcpServerRequest.create({ serverName, command, args, env, cwd? }))` returns `Promise<McpServers>`. `args: string[]`, `env: { [key: string]: string }`. Mirrors the existing `AddStdioServerForm.tsx` exactly.

- [ ] **Step 1: Write the failing test**

Create `webview-ui/src/components/mcp/configuration/tabs/add-server/AddDatabaseServerForm.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import AddDatabaseServerForm from "./AddDatabaseServerForm"

const mocks = vi.hoisted(() => ({
	addStdioMcpServer: vi.fn(),
	setMcpServers: vi.fn(),
}))

vi.mock("@/services/grpc-client", () => ({
	McpServiceClient: {
		addStdioMcpServer: mocks.addStdioMcpServer,
	},
}))

vi.mock("@/context/ExtensionStateContext", () => ({
	useExtensionState: () => ({
		setMcpServers: mocks.setMcpServers,
	}),
}))

vi.mock("@shared/proto-conversions/mcp/mcp-server-conversion", () => ({
	convertProtoMcpServersToMcpServers: () => [],
}))

describe("AddDatabaseServerForm", () => {
	beforeEach(() => {
		mocks.addStdioMcpServer.mockReset()
		mocks.setMcpServers.mockReset()
		mocks.addStdioMcpServer.mockResolvedValue({ mcpServers: undefined })
	})

	it("submits the prebuilt postgres stdio config with required fields", async () => {
		const user = userEvent.setup()
		const onDone = vi.fn()
		render(<AddDatabaseServerForm onDone={onDone} />)

		await user.type(screen.getByLabelText("Server Name"), "toolbox-postgres")
		await user.type(screen.getByLabelText("Database"), "appdb")
		await user.type(screen.getByLabelText("User"), "appuser")
		await user.type(screen.getByLabelText("Password"), "secret")
		await user.click(screen.getByRole("button", { name: "Add Server" }))

		await waitFor(() => expect(mocks.addStdioMcpServer).toHaveBeenCalledTimes(1))
		expect(mocks.addStdioMcpServer).toHaveBeenCalledWith(
			expect.objectContaining({
				serverName: "toolbox-postgres",
				command: "npx",
				args: ["-y", "@toolbox-sdk/server", "--prebuilt=postgres", "--stdio"],
				env: expect.objectContaining({
					POSTGRES_HOST: "127.0.0.1",
					POSTGRES_PORT: "5432",
					POSTGRES_DATABASE: "appdb",
					POSTGRES_USER: "appuser",
					POSTGRES_PASSWORD: "secret",
				}),
			}),
		)
		expect(onDone).toHaveBeenCalled()
	})

	it("blocks submit when a required field is empty", async () => {
		const user = userEvent.setup()
		render(<AddDatabaseServerForm onDone={vi.fn()} />)

		await user.type(screen.getByLabelText("Database"), "appdb")
		await user.click(screen.getByRole("button", { name: "Add Server" }))

		expect(mocks.addStdioMcpServer).not.toHaveBeenCalled()
		expect(screen.getByText(/required/i)).toBeInTheDocument()
	})
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd webview-ui && npx vitest run src/components/mcp/configuration/tabs/add-server/AddDatabaseServerForm.test.tsx
```
Expected: FAIL — cannot resolve `./AddDatabaseServerForm`.

- [ ] **Step 3: Write minimal implementation**

Create `webview-ui/src/components/mcp/configuration/tabs/add-server/AddDatabaseServerForm.tsx`:

```tsx
import { useState } from "react"
import { AddStdioMcpServerRequest, McpServers } from "@shared/proto/cline/mcp"
import { McpServiceClient } from "@/services/grpc-client"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { convertProtoMcpServersToMcpServers } from "@shared/proto-conversions/mcp/mcp-server-conversion"
import { buildPostgresConfig } from "./databasePresets"

const inputClass =
	"px-2 py-1 rounded bg-vscode-input-background text-vscode-input-foreground border border-vscode-input-border"

export const AddDatabaseServerForm = ({ onDone }: { onDone: () => void }) => {
	const { setMcpServers } = useExtensionState()
	const [name, setName] = useState("toolbox-postgres")
	const [host, setHost] = useState("")
	const [port, setPort] = useState("")
	const [database, setDatabase] = useState("")
	const [user, setUser] = useState("")
	const [password, setPassword] = useState("")
	const [queryParams, setQueryParams] = useState("")
	const [error, setError] = useState("")
	const [loading, setLoading] = useState(false)

	const handleSubmit = async () => {
		setError("")
		if (!name.trim() || !database.trim() || !user.trim() || !password.trim()) {
			setError("Server name, database, user, and password are required")
			return
		}

		const cfg = buildPostgresConfig({
			name: name.trim(),
			host,
			port,
			database: database.trim(),
			user: user.trim(),
			password,
			queryParams,
		})

		setLoading(true)
		try {
			const response: McpServers = await McpServiceClient.addStdioMcpServer(
				AddStdioMcpServerRequest.create({
					serverName: cfg.serverName,
					command: cfg.command,
					args: cfg.args,
					env: cfg.env,
				}),
			)
			if (response.mcpServers) {
				setMcpServers(convertProtoMcpServersToMcpServers(response.mcpServers))
			}
			onDone()
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err))
		} finally {
			setLoading(false)
		}
	}

	return (
		<div className="flex flex-col gap-3 p-4">
			<h3 className="text-vscode-fontSize font-bold">Connect Database (PostgreSQL)</h3>
			<p className="text-vscode-descriptionForeground text-sm">
				Connects the agent to a PostgreSQL database via{" "}
				<a
					href="https://github.com/googleapis/mcp-toolbox"
					target="_blank"
					rel="noreferrer"
					className="text-vscode-textLink hover:underline">
					mcp-toolbox
				</a>{" "}
				prebuilt tools (<code>list_tables</code>, <code>execute_sql</code>, …). Requires{" "}
				<code>Node.js</code>/<code>npx</code>. Saved to{" "}
				<code className="mx-1 px-1 py-0.5 rounded bg-vscode-editor-background">
					.cellockai/mcp_settings.json
				</code>
				.
			</p>

			<div className="flex flex-col gap-2">
				<label htmlFor="db-name" className="text-sm font-medium">
					Server Name
				</label>
				<input
					id="db-name"
					type="text"
					value={name}
					onChange={(e) => setName(e.target.value)}
					className={inputClass}
				/>
			</div>

			<div className="flex flex-col gap-2">
				<label htmlFor="db-host" className="text-sm font-medium">
					Host <span className="text-vscode-descriptionForeground">(optional, default 127.0.0.1)</span>
				</label>
				<input
					id="db-host"
					type="text"
					value={host}
					onChange={(e) => setHost(e.target.value)}
					placeholder="127.0.0.1"
					className={inputClass}
				/>
			</div>

			<div className="flex flex-col gap-2">
				<label htmlFor="db-port" className="text-sm font-medium">
					Port <span className="text-vscode-descriptionForeground">(optional, default 5432)</span>
				</label>
				<input
					id="db-port"
					type="text"
					value={port}
					onChange={(e) => setPort(e.target.value)}
					placeholder="5432"
					className={inputClass}
				/>
			</div>

			<div className="flex flex-col gap-2">
				<label htmlFor="db-database" className="text-sm font-medium">
					Database
				</label>
				<input
					id="db-database"
					type="text"
					value={database}
					onChange={(e) => setDatabase(e.target.value)}
					className={inputClass}
				/>
			</div>

			<div className="flex flex-col gap-2">
				<label htmlFor="db-user" className="text-sm font-medium">
					User
				</label>
				<input
					id="db-user"
					type="text"
					value={user}
					onChange={(e) => setUser(e.target.value)}
					className={inputClass}
				/>
			</div>

			<div className="flex flex-col gap-2">
				<label htmlFor="db-password" className="text-sm font-medium">
					Password
				</label>
				<input
					id="db-password"
					type="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					className={inputClass}
				/>
			</div>

			<details className="text-sm">
				<summary className="cursor-pointer text-vscode-textLink">Advanced</summary>
				<div className="flex flex-col gap-2 mt-2">
					<label htmlFor="db-query-params" className="text-sm font-medium">
						Postgres query params <span className="text-vscode-descriptionForeground">(optional)</span>
					</label>
					<input
						id="db-query-params"
						type="text"
						value={queryParams}
						onChange={(e) => setQueryParams(e.target.value)}
						placeholder="sslmode=require"
						className={inputClass}
					/>
				</div>
			</details>

			<div className="text-vscode-descriptionForeground text-xs p-2 rounded bg-vscode-input-background">
				Credentials are stored in plaintext in <code>mcp_settings.json</code>, like every other MCP
				server&apos;s env. Because prebuilt tools expose{" "}
				<code>execute_sql</code>, use a{" "}
				<a
					href="https://mcp-toolbox.dev/documentation/configuration/prebuilt-configs/"
					target="_blank"
					rel="noreferrer"
					className="text-vscode-textLink hover:underline">
					read-only database role
				</a>
				.
			</div>

			{error && (
				<div className="text-vscode-errorForeground text-sm p-2 rounded bg-vscode-input-background">
					{error}
				</div>
			)}

			<div className="flex gap-2">
				<button
					type="button"
					onClick={handleSubmit}
					disabled={loading}
					className="px-4 py-1.5 rounded bg-vscode-button-background text-vscode-button-foreground hover:bg-vscode-button-hoverBackground disabled:opacity-50">
					{loading ? "Adding..." : "Add Server"}
				</button>
				<button
					type="button"
					onClick={onDone}
					className="px-4 py-1.5 rounded bg-vscode-button-secondaryBackground text-vscode-button-secondaryForeground hover:bg-vscode-button-secondaryHoverBackground">
					Cancel
				</button>
			</div>
		</div>
	)
}

export default AddDatabaseServerForm
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd webview-ui && npx vitest run src/components/mcp/configuration/tabs/add-server/AddDatabaseServerForm.test.tsx
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add webview-ui/src/components/mcp/configuration/tabs/add-server/AddDatabaseServerForm.tsx \
        webview-ui/src/components/mcp/configuration/tabs/add-server/AddDatabaseServerForm.test.tsx
git commit -m "feat(mcp): add PostgreSQL database wizard form (mcp-toolbox prebuilt)"
```

---

### Task 3: Wire the "Database" tab into `McpConfigurationView`

**Files:**
- Modify: `src/shared/mcp.ts:143`
- Modify: `webview-ui/src/components/mcp/configuration/McpConfigurationView.tsx`
- Test: `webview-ui/src/components/mcp/configuration/McpConfigurationView.test.tsx`

**Interfaces:**
- Consumes: `AddDatabaseServerForm` (Task 2, default export); `McpViewTab` union (this task extends it).

- [ ] **Step 1: Write the failing test**

In `webview-ui/src/components/mcp/configuration/McpConfigurationView.test.tsx`, add a mock for the new form and a new test case. Add this mock alongside the other `vi.mock` calls (after the `AddRemoteServerForm` mock):

```tsx
vi.mock("./tabs/add-server/AddStdioServerForm", () => ({
	AddStdioServerForm: () => <div>Add Stdio Server Form</div>,
}))

vi.mock("./tabs/add-server/AddDatabaseServerForm", () => ({
	default: () => <div>Add Database Server Form</div>,
}))
```

Then append this test inside the existing `describe("McpConfigurationView", ...)` block:

```tsx
it("shows a Database tab that renders the database wizard", async () => {
	mocks.remoteConfigSettings = { blockPersonalRemoteMCPServers: false }
	const user = userEvent.setup()

	render(<McpConfigurationView onDone={vi.fn()} />)

	const dbTab = screen.getByRole("button", { name: "Database" })
	expect(dbTab).toBeInTheDocument()

	await user.click(dbTab)
	expect(screen.getByText("Add Database Server Form")).toBeInTheDocument()

	await waitFor(() => expect(mocks.getLatestMcpServers).toHaveBeenCalledTimes(1))
})
```

Also add `import userEvent from "@testing-library/user-event"` to the test file's imports if not present.

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd webview-ui && npx vitest run src/components/mcp/configuration/McpConfigurationView.test.tsx
```
Expected: FAIL — `Unable to find a role="button" with name "Database"` (tab does not exist yet).

- [ ] **Step 3: Extend the `McpViewTab` union**

In `src/shared/mcp.ts` line 143, change:

```ts
export type McpViewTab = "addRemote" | "configure" | "addLocal"
```

to:

```ts
export type McpViewTab = "addRemote" | "configure" | "addLocal" | "addDatabase"
```

- [ ] **Step 4: Add the tab button and content branch**

In `webview-ui/src/components/mcp/configuration/McpConfigurationView.tsx`:

Add the import next to the other add-server imports (after the `AddRemoteServerForm` import, line 10):

```tsx
import AddDatabaseServerForm from "./tabs/add-server/AddDatabaseServerForm"
```

In the tabs container (after the `Local Server` `TabButton`, before the `Configure` `TabButton`), add:

```tsx
<TabButton isActive={activeTab === "addDatabase"} onClick={() => handleTabChange("addDatabase")}>
	Database
</TabButton>
```

In the content container (after the `activeTab === "addLocal"` branch, before the `activeTab === "configure"` branch), add:

```tsx
{activeTab === "addDatabase" && <AddDatabaseServerForm onDone={() => handleTabChange("configure")} />}
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
cd webview-ui && npx vitest run src/components/mcp/configuration/McpConfigurationView.test.tsx
```
Expected: PASS (3 tests — the two existing tests plus the new Database tab test).

- [ ] **Step 6: Run the full webview test suite to confirm no regressions**

Run:
```bash
cd webview-ui && npm test
```
Expected: PASS (all tests).

- [ ] **Step 7: Commit**

```bash
git add src/shared/mcp.ts \
        webview-ui/src/components/mcp/configuration/McpConfigurationView.tsx \
        webview-ui/src/components/mcp/configuration/McpConfigurationView.test.tsx
git commit -m "feat(mcp): add Database tab to MCP settings panel"
```

---

## Manual smoke test (post-implementation)

1. Build/run the extension.
2. Open the MCP panel → click the **Database** tab.
3. Fill the form against a local Postgres (e.g. `docker run --rm -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=appdb -p 5432:5432 postgres:16`): name `toolbox-postgres`, database `appdb`, user `postgres`, password `secret`.
4. Click **Add Server**. Expect the tab to switch to **Configure** and `toolbox-postgres` to appear, initially connecting then showing tools.
5. Expand the server and confirm tools like `list_tables` and `execute_sql` are listed.
6. In a task, ask the agent to "list the tables in my database" and confirm it can call `list_tables` successfully.
7. Open `~/.cellockai/cline_mcp_settings.json` (or workspace `.cellockai/mcp_settings.json`) and confirm the entry matches: `command: "npx"`, `args: ["-y","@toolbox-sdk/server","--prebuilt=postgres","--stdio"]`, env `POSTGRES_*`, `autoApprove: []`.

---

## Self-review

**Spec coverage:**
- "Connect Database wizard in existing MCP settings panel" → Task 3 (tab) + Task 2 (form). ✓
- "PostgreSQL prebuilt only" → Task 1 (`buildPostgresConfig` + `--prebuilt=postgres`). ✓
- "Credentials plaintext in mcp_settings.json env" → Task 2 reuses `addStdioMcpServer`, which writes the stdio env unchanged. ✓
- "autoApprove empty" → `AddStdioMcpServerRequest.create({ ... })` omits `autoApprove`; `McpHub.addStdioServer` writes `autoApprove: []` by default (verified in existing code). ✓
- "Security notice in-wizard + read-only role" → present in form JSX. ✓
- "Edit via existing open-settings flow" → no new edit path added; out of scope. ✓
- "Unit test for the builder (only non-trivial logic)" → Task 1. ✓
- "Extend McpConfigurationView.test.tsx" → Task 3. ✓

**Placeholder scan:** None. All steps contain real, copy-pasteable code and exact run commands.

**Type consistency:** `buildPostgresConfig`/`PostgresConnectionFields`/`StdioServerConfig` defined in Task 1, imported unchanged in Task 2. `McpViewTab` extended with `"addDatabase"` in Task 3, matching the `activeTab === "addDatabase"` comparisons. `AddDatabaseServerForm` default export matches `<AddDatabaseServerForm onDone={...} />`. `AddStdioMcpServerRequest.create({ serverName, command, args, env })` matches the verified proto shape (`args: string[]`, `env: { [key: string]: string }`).
