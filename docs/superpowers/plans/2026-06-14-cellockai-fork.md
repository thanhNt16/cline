# CellockAI Fork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fork the Cline VS Code extension (`apps/vscode`) into a rebranded "CellockAI" build with user-facing branding swapped, login/signup hidden, a per-project Model Profile system (OpenAI-compatible URL + model + API key), all project config relocated from `.clinerules` to `.cellockai`, and a default profile pointing at z.ai/GLM.

**Architecture:** Work happens entirely inside `apps/vscode/` (the VS Code extension; npm-based, `src/` + `webview-ui/` + `proto/`). Five independent subsystems, each independently testable: (1) branch + branding, (2) hide account/auth UI, (3) per-project `.cellockai` config root replacing `.clinerules`, (4) Model Profiles feature mapped onto the existing OpenAI-compatible provider, (5) seeded default profile with a gitignored API key. We keep internal identifiers (`ClineProvider`, proto services, `@cline/*` imports, storage keys, package `name`) untouched — only user-visible strings change.

**Tech Stack:** TypeScript, VS Code Extension API, esbuild, React (webview-ui), Mocha (unit tests), Biome (lint), gRPC-style proto layer.

**Decisions locked in (from planning):**
- Rename scope: **user-facing branding only**.
- Default API key: **gitignored local default** (not committed). ⚠️ The key pasted during planning is now in chat history — rotate it before relying on it.
- Project storage: **`.cellockai` replaces `.clinerules`** entirely.

> ⚠️ **DO NOT COMMIT during execution.** The user wants to build and test everything first. Make all edits, run the typecheck/test steps as you go, but **stage and commit nothing**. Each task ends with a build/test checkpoint instead of a commit. The branch from Task 1.1 is the only git operation performed. Once the user has built and tested the full fork, they will stage and commit themselves (suggested commit groupings are listed in the final "Deferred commit plan" section for their convenience).

**All commands below run from `apps/vscode/` unless stated otherwise.**

Key commands:
- Typecheck (fast): `npm run check-types`
- Full compile: `npm run compile`
- Unit tests: `npm run test:unit`
- Regenerate prompt snapshots: `UPDATE_SNAPSHOTS=true npm run test:unit`
- Regenerate proto types after `.proto` edits: `npm run protos`

---

## File Structure

**New files:**
- `apps/vscode/src/config/cellockaiDefaults.ts` — committed default-profile constants (URL, model, profile name) + key resolver.
- `apps/vscode/src/config/cellockai-default-key.local.ts` — **gitignored**, exports the literal default API key.
- `apps/vscode/src/config/cellockai-default-key.local.example.ts` — committed template showing the shape.
- `apps/vscode/src/core/profiles/ModelProfileService.ts` — load/save/select profiles from `<project>/.cellockai/profiles.json`, map active profile → `apiConfiguration`.
- `apps/vscode/src/core/profiles/types.ts` — `ModelProfile`, `ProfilesFile` types.
- `apps/vscode/src/core/profiles/__tests__/ModelProfileService.test.ts` — unit tests.
- `apps/vscode/webview-ui/src/components/settings/sections/ProfilesSection.tsx` — profile manager UI.

**Modified files (high level):**
- `apps/vscode/package.json` — `displayName`, `description`, walkthrough/command/view titles (branding).
- `apps/vscode/src/core/storage/disk.ts` — `GlobalFileNames` rule/skill/workflow paths → `.cellockai/*`.
- `apps/vscode/webview-ui/src/App.tsx`, `components/menu/Navbar.tsx` — hide account button/route.
- `apps/vscode/webview-ui/src/components/settings/SettingsView.tsx` — drop `remote-config`/account-dependent UI, add Profiles tab.
- `apps/vscode/src/core/api/index.ts` (or task setup) — apply active profile before building handler.

---

## Phase 1 — Branch & Branding

### Task 1.1: Create the fork branch

**Files:** none (git only)

- [ ] **Step 1: Create and switch to the branch**

Run from repo root (`/Users/harry/Desktop/cline`):
```bash
git checkout -b cellockai-fork
```
Expected: `Switched to a new branch 'cellockai-fork'`

- [ ] **Step 2: Confirm clean baseline builds**

```bash
cd apps/vscode && npm run check-types
```
Expected: completes with no type errors (this is the baseline; if it fails, the fork itself is broken before any change and that must be fixed first).

---

### Task 1.2: Rebrand `package.json` user-facing strings

**Files:**
- Modify: `apps/vscode/package.json`

Only change **user-visible** strings. Do **NOT** change `"name": "claude-dev"`, `"publisher"`, command IDs like `cline.plusButtonClicked`, or the `cline-icon` codicon id.

- [ ] **Step 1: Change displayName and description**

In `apps/vscode/package.json` line 3:
```json
"displayName": "CellockAI",
```
Line 4 — keep wording, just swap the product noun if present (this description has none; leave as-is unless it later mentions Cline).

- [ ] **Step 2: Rebrand the view container title**

Line ~115:
```json
"title": "CellockAI",
```

- [ ] **Step 3: Rebrand walkthrough titles/descriptions**

Replace the user-facing "Cline" tokens in the `walkthroughs` block (lines ~62–100). Example for line 62–63:
```json
"title": "Meet CellockAI, your new coding partner",
"description": "CellockAI codes like a developer because it thinks like one. Here are 5 ways to put it to work:",
```
Apply the same word swap to lines 68, 75, 76, 84, 100 (each "Cline" → "CellockAI" inside `title`/`description` values only).

- [ ] **Step 4: Rebrand command titles and categories**

For each command in `contributes.commands`, replace `"Cline"` inside `"title"` and `"category"` values (lines ~157–208 and beyond). Examples:
```json
{ "command": "cline.addToChat", "title": "Add to CellockAI", "category": "CellockAI" },
{ "command": "cline.generateGitCommitMessage", "title": "Generate Commit Message with CellockAI", "category": "CellockAI", "icon": "$(cline-icon)" },
{ "command": "cline.explainCode", "title": "Explain with CellockAI", "category": "CellockAI" }
```
Leave the `"command"` IDs and `"icon"` values exactly as they are.

- [ ] **Step 5: Find any remaining user-facing "Cline" in package.json contributions**

```bash
grep -nE '"(title|description|category|label)":[^,]*Cline' package.json
```
Expected after edits: only the `cline-icon` description (line ~52, an internal codicon label — leave it) should remain, plus any you intentionally kept. Swap any other title/description/category hits.

- [ ] **Step 6: Verify JSON is still valid**

```bash
node -e "require('./package.json'); console.log('package.json OK')"
```
Expected: `package.json OK`

- [ ] **Step 7: Checkpoint (no commit)**

Leave the change in the working tree. Do not stage or commit — the user will build and test first.

---

### Task 1.3: Rebrand webview + walkthrough user-facing copy

**Files:**
- Modify: webview-ui components and `apps/vscode/walkthrough/*` containing visible "Cline" copy

- [ ] **Step 1: List user-facing copy occurrences in webview**

```bash
grep -rnE '>[^<]*Cline[^<]*<|"[^"]*Cline[^"]*"|`[^`]*Cline[^`]*`' webview-ui/src --include=*.tsx | grep -viE 'import|from "|className|Cline[A-Z]|clineicon|cline-icon|data-testid' | head -80
```
This surfaces JSX text/labels. Review each: if it is **displayed text** (button labels, headings, tooltips, placeholder strings), swap "Cline" → "CellockAI". If it is a component/type/identifier (`ClineAccountInfoCard`, `ClineProvider`, `ClineMessage`), **leave it**.

- [ ] **Step 2: Apply swaps to display strings only**

Edit each confirmed display-string hit by hand (do not bulk-sed — too many identifier collisions). Prioritise: chat empty-state/welcome text, `Navbar.tsx` tooltips, `SettingsView.tsx` headings, error banners in `webview-ui/src/components/chat/ErrorRow.tsx`.

- [ ] **Step 3: Rebrand walkthrough markdown/assets**

```bash
grep -rln 'Cline' walkthrough/ 2>/dev/null
```
Swap visible "Cline" → "CellockAI" in any `.md` walkthrough copy found.

- [ ] **Step 4: Typecheck**

```bash
npm run check-types
```
Expected: no new type errors (you only touched string literals).

- [ ] **Step 5: Regenerate system-prompt snapshots (branding strings can appear in prompts)**

```bash
UPDATE_SNAPSHOTS=true npm run test:unit
```
Expected: tests pass; snapshot diffs limited to expected text changes. Review the diff before committing.

- [ ] **Step 6: Checkpoint (no commit)**

Leave the changes in the working tree. Do not stage or commit.

---

## Phase 2 — Hide Login / Signup

The account button lives in `webview-ui/src/components/menu/Navbar.tsx`; the route renders in `App.tsx` (`showAccount && <AccountView/>`); `AccountView` shows `AccountWelcomeView` (the signup/login screen) when logged out. We remove the entry points so login/signup is never reachable, without ripping out auth plumbing (keeps the build green).

### Task 2.1: Remove the Account nav button

**Files:**
- Modify: `apps/vscode/webview-ui/src/components/menu/Navbar.tsx`

- [ ] **Step 1: Locate the account button**

```bash
grep -n 'account\|Account' webview-ui/src/components/menu/Navbar.tsx
```

- [ ] **Step 2: Remove the account button JSX**

Delete the nav item whose `onClick` triggers the account view / `accountButtonClicked`. Leave the surrounding buttons (settings, history, MCP) intact.

- [ ] **Step 3: Typecheck**

```bash
npm run check-types
```
Expected: no errors. If an unused import (`AccountIcon`, handler) now warns, remove it.

---

### Task 2.2: Disable the account route and welcome/login screen

**Files:**
- Modify: `apps/vscode/webview-ui/src/App.tsx`
- Modify: `apps/vscode/webview-ui/src/components/account/AccountView.tsx`

- [ ] **Step 1: Short-circuit the account route in App.tsx**

In `App.tsx`, the block at line ~72 renders `{showAccount && (<AccountView .../>)}`. Change the guard so it never opens:
```tsx
{false && showAccount && (
    <AccountView
        // ...existing props unchanged
    />
)}
```
(Using `false &&` keeps the JSX/types valid while guaranteeing the login UI is unreachable. Do not delete `showAccount` from the destructure — other layout code at line ~84 references it.)

- [ ] **Step 2: Make AccountWelcomeView unreachable as a safety net**

In `AccountView.tsx`, find where `AccountWelcomeView` (the signup/login prompt) renders for logged-out users and return `null` instead:
```bash
grep -n 'AccountWelcomeView' webview-ui/src/components/account/AccountView.tsx
```
Replace the `<AccountWelcomeView ... />` render with `null` (or an early `return null` when not authenticated). Keep the authenticated branch compiling.

- [ ] **Step 3: Typecheck**

```bash
npm run check-types
```
Expected: no errors.

---

### Task 2.3: Remove account-dependent settings surfaces

**Files:**
- Modify: `apps/vscode/webview-ui/src/components/settings/SettingsView.tsx`

- [ ] **Step 1: Drop the account card and remote-config tab from settings**

`SETTINGS_TABS` (line ~64) includes `remote-config` (org/account feature) and the API-config section renders `ClineAccountInfoCard`. Remove the `remote-config` tab entry from `SETTINGS_TABS`, and remove the `<ClineAccountInfoCard .../>` render from the api-config section.

- [ ] **Step 2: Remove now-unused imports**

Delete imports for `ClineAccountInfoCard`, `RemoteConfigSection`, `isAdminOrOwner`, `isClineInternalTester` if they become unused.

- [ ] **Step 3: Typecheck**

```bash
npm run check-types
```
Expected: no errors.

- [ ] **Step 4: Checkpoint (no commit)**

Leave the Phase 2 changes in the working tree. Do not stage or commit.

---

## Phase 3 — `.cellockai` Project Config Root (replaces `.clinerules`)

`GlobalFileNames` in `src/core/storage/disk.ts` (lines 48–74) defines the project-relative paths. Rules/skills/workflows resolution reads these constants (`cline-rules.ts`, `rule-helpers.ts`, `workflows.ts`). Repointing the constants relocates everything in one place.

### Task 3.1: Repoint rule/skill/workflow paths to `.cellockai`

**Files:**
- Modify: `apps/vscode/src/core/storage/disk.ts:60-64`

- [ ] **Step 1: Update GlobalFileNames**

Replace lines 60–64 in `disk.ts`:
```ts
	clineRules: ".cellockai/rules",
	workflows: ".cellockai/rules/workflows",
	hooksDir: ".cellockai/rules/hooks",
	clineruleSkillsDir: ".cellockai/skills",
	clineSkillsDir: ".cellockai/skills",
```
(Leave `claudeSkillsDir`, `agentsSkillsDir`, `cursorRulesDir`, `windsurfRules`, `agentsRulesFile` untouched — those are foreign-tool interop paths, not Cline's own.)

- [ ] **Step 2: Find any hardcoded `.clinerules` strings not going through the constant**

```bash
grep -rn '"\.clinerules\|\.clinerules"' src --include=*.ts | grep -v '__tests__'
```
Repoint each remaining literal to use `GlobalFileNames.clineRules` or the `.cellockai/...` equivalent. (Expected hits: `external-rules.ts`, `rule-helpers.ts`.)

- [ ] **Step 3: Typecheck**

```bash
npm run check-types
```
Expected: no errors.

- [ ] **Step 4: Update affected unit tests**

```bash
npm run test:unit 2>&1 | grep -iE 'clinerules|skills|rule' | head
```
Run the rule/skill suites; update any test asserting `.clinerules` paths to expect `.cellockai/...`:
```bash
grep -rln '\.clinerules' src/core/context/instructions/user-instructions/__tests__
```
Edit those snapshots/expectations to the new paths.

- [ ] **Step 5: Run the rule/skill tests**

```bash
npm run test:unit
```
Expected: pass.

- [ ] **Step 6: Checkpoint (no commit)**

Leave the changes in the working tree. Do not stage or commit.

---

### Task 3.2: Project-level MCP under `.cellockai/mcp.json`

MCP settings are global today (`cline_mcp_settings.json`). Add a project-level source so MCP config can live in `.cellockai/mcp.json` and merge over the global one.

**Files:**
- Modify: the MCP settings loader (find it below)
- Modify: `apps/vscode/src/core/storage/disk.ts` (add a `GlobalFileNames` entry)

- [ ] **Step 1: Locate the MCP settings loader**

```bash
grep -rln 'cline_mcp_settings\|mcpSettings\|getMcpSettingsFilePath' src/services/mcp src/core 2>/dev/null
```

- [ ] **Step 2: Add the project MCP path constant**

In `disk.ts` `GlobalFileNames`, add:
```ts
	projectMcpSettings: ".cellockai/mcp.json",
```

- [ ] **Step 3: Read and merge project MCP**

In the MCP loader, after reading the global settings file, also read `<cwd>/.cellockai/mcp.json` if it exists and shallow-merge its `mcpServers` over the global map (project wins on name collision). Guard with `fileExistsAtPath`. Use the project cwd from the workspace resolver already used elsewhere in that module.

- [ ] **Step 4: Typecheck + test**

```bash
npm run check-types && npm run test:unit
```
Expected: pass.

- [ ] **Step 5: Checkpoint (no commit)**

Leave the changes in the working tree. Do not stage or commit.

---

## Phase 4 — Model Profiles

A **Model Profile** is a named `{ baseUrl, modelId, apiKey }` bundle stored per-project in `<cwd>/.cellockai/profiles.json`. The active profile maps onto the existing OpenAI-compatible provider fields, so no new provider wiring is needed: `apiProvider="openai"`, `openAiBaseUrl`, `openAiApiKey`, `planModeOpenAiModelId`/`actModeOpenAiModelId`.

### Task 4.1: Profile types

**Files:**
- Create: `apps/vscode/src/core/profiles/types.ts`

- [ ] **Step 1: Write the types**

```ts
export interface ModelProfile {
	id: string
	name: string
	baseUrl: string
	modelId: string
	apiKey: string
}

export interface ProfilesFile {
	activeProfileId: string
	profiles: ModelProfile[]
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run check-types
```
Expected: no errors.

---

### Task 4.2: Default-profile constants + gitignored key

**Files:**
- Create: `apps/vscode/src/config/cellockaiDefaults.ts`
- Create: `apps/vscode/src/config/cellockai-default-key.local.example.ts`
- Create (gitignored): `apps/vscode/src/config/cellockai-default-key.local.ts`
- Modify: `apps/vscode/.gitignore` (or repo-root `.gitignore`)

- [ ] **Step 1: Gitignore the local key file**

Append to `apps/vscode/.gitignore` (create if absent):
```
src/config/cellockai-default-key.local.ts
```

- [ ] **Step 2: Create the example template**

`apps/vscode/src/config/cellockai-default-key.local.example.ts`:
```ts
// Copy this file to cellockai-default-key.local.ts and fill in the key.
// cellockai-default-key.local.ts is gitignored and never committed.
export const CELLOCKAI_DEFAULT_API_KEY = ""
```

- [ ] **Step 3: Create the real local key file (NOT committed)**

`apps/vscode/src/config/cellockai-default-key.local.ts`:
```ts
export const CELLOCKAI_DEFAULT_API_KEY = "<paste-your-rotated-z.ai-key-here>"
```
⚠️ Rotate the key first — the original is in chat history.

- [ ] **Step 4: Defaults module with safe key resolution**

`apps/vscode/src/config/cellockaiDefaults.ts`:
```ts
export const CELLOCKAI_DEFAULT_BASE_URL = "https://api.z.ai/api/coding/paas/v4"
export const CELLOCKAI_DEFAULT_MODEL_ID = "glm-5.2"
export const CELLOCKAI_DEFAULT_PROFILE_NAME = "GLM (z.ai)"

/**
 * Resolves the default API key without hard-failing the build when the
 * gitignored local file is absent (e.g. fresh clone / CI). Order:
 * 1. CELLOCKAI_DEFAULT_API_KEY env var
 * 2. gitignored local file
 * 3. empty string (user must enter a key in the Profiles UI)
 */
export function getDefaultApiKey(): string {
	if (process.env.CELLOCKAI_DEFAULT_API_KEY) {
		return process.env.CELLOCKAI_DEFAULT_API_KEY
	}
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const local = require("./cellockai-default-key.local") as { CELLOCKAI_DEFAULT_API_KEY?: string }
		return local.CELLOCKAI_DEFAULT_API_KEY ?? ""
	} catch {
		return ""
	}
}
```
(`require` in a try/catch is intentional: a missing gitignored file must not break compilation or runtime.)

- [ ] **Step 5: Typecheck**

```bash
npm run check-types
```
Expected: no errors.

- [ ] **Step 6: Checkpoint (no commit) — verify the key file is ignored**

Do not commit. Confirm git treats the local key file as ignored so it can never be accidentally staged later:
```bash
git check-ignore apps/vscode/src/config/cellockai-default-key.local.ts
```
Expected: prints the path (meaning it is ignored). If it prints nothing, fix `.gitignore` before continuing.

---

### Task 4.3: ModelProfileService — failing test first

**Files:**
- Create: `apps/vscode/src/core/profiles/__tests__/ModelProfileService.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { strict as assert } from "node:assert"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { ModelProfileService } from "../ModelProfileService"

describe("ModelProfileService", () => {
	let cwd: string
	beforeEach(async () => {
		cwd = await fs.mkdtemp(path.join(os.tmpdir(), "cellockai-"))
	})
	afterEach(async () => {
		await fs.rm(cwd, { recursive: true, force: true })
	})

	it("seeds a default profile when profiles.json is absent", async () => {
		const svc = new ModelProfileService(cwd)
		const active = await svc.getActiveProfile()
		assert.equal(active.baseUrl, "https://api.z.ai/api/coding/paas/v4")
		assert.equal(active.modelId, "glm-5.2")
		assert.ok(active.name.length > 0)
		// file should now exist on disk
		const raw = await fs.readFile(path.join(cwd, ".cellockai", "profiles.json"), "utf8")
		assert.ok(JSON.parse(raw).profiles.length === 1)
	})

	it("round-trips an added profile and switches active", async () => {
		const svc = new ModelProfileService(cwd)
		const added = await svc.addProfile({ name: "Local", baseUrl: "http://localhost:1234/v1", modelId: "qwen", apiKey: "k" })
		await svc.setActiveProfile(added.id)
		const reloaded = new ModelProfileService(cwd)
		const active = await reloaded.getActiveProfile()
		assert.equal(active.id, added.id)
		assert.equal(active.modelId, "qwen")
	})

	it("maps the active profile onto OpenAI-compatible apiConfiguration fields", async () => {
		const svc = new ModelProfileService(cwd)
		const cfg = await svc.toApiConfiguration()
		assert.equal(cfg.apiProvider, "openai")
		assert.equal(cfg.openAiBaseUrl, "https://api.z.ai/api/coding/paas/v4")
		assert.equal(cfg.planModeOpenAiModelId, "glm-5.2")
		assert.equal(cfg.actModeOpenAiModelId, "glm-5.2")
	})
})
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
npm run test:unit 2>&1 | grep -i 'ModelProfileService\|Cannot find module'
```
Expected: FAIL — module `../ModelProfileService` not found.

---

### Task 4.4: ModelProfileService implementation

**Files:**
- Create: `apps/vscode/src/core/profiles/ModelProfileService.ts`

- [ ] **Step 1: Implement the service**

```ts
import { randomUUID } from "node:crypto"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import {
	CELLOCKAI_DEFAULT_BASE_URL,
	CELLOCKAI_DEFAULT_MODEL_ID,
	CELLOCKAI_DEFAULT_PROFILE_NAME,
	getDefaultApiKey,
} from "@/config/cellockaiDefaults"
import type { ModelProfile, ProfilesFile } from "./types"

export class ModelProfileService {
	private readonly dir: string
	private readonly file: string

	constructor(private readonly cwd: string) {
		this.dir = path.join(cwd, ".cellockai")
		this.file = path.join(this.dir, "profiles.json")
	}

	private buildDefault(): ProfilesFile {
		const profile: ModelProfile = {
			id: randomUUID(),
			name: CELLOCKAI_DEFAULT_PROFILE_NAME,
			baseUrl: CELLOCKAI_DEFAULT_BASE_URL,
			modelId: CELLOCKAI_DEFAULT_MODEL_ID,
			apiKey: getDefaultApiKey(),
		}
		return { activeProfileId: profile.id, profiles: [profile] }
	}

	private async load(): Promise<ProfilesFile> {
		try {
			const raw = await fs.readFile(this.file, "utf8")
			const parsed = JSON.parse(raw) as ProfilesFile
			if (parsed?.profiles?.length) {
				return parsed
			}
		} catch {
			// fall through to seeding
		}
		const seeded = this.buildDefault()
		await this.save(seeded)
		return seeded
	}

	private async save(data: ProfilesFile): Promise<void> {
		await fs.mkdir(this.dir, { recursive: true })
		await fs.writeFile(this.file, JSON.stringify(data, null, 2), "utf8")
	}

	async getProfiles(): Promise<ModelProfile[]> {
		return (await this.load()).profiles
	}

	async getActiveProfile(): Promise<ModelProfile> {
		const data = await this.load()
		return data.profiles.find((p) => p.id === data.activeProfileId) ?? data.profiles[0]
	}

	async addProfile(input: Omit<ModelProfile, "id">): Promise<ModelProfile> {
		const data = await this.load()
		const profile: ModelProfile = { id: randomUUID(), ...input }
		data.profiles.push(profile)
		await this.save(data)
		return profile
	}

	async updateProfile(id: string, patch: Partial<Omit<ModelProfile, "id">>): Promise<void> {
		const data = await this.load()
		const idx = data.profiles.findIndex((p) => p.id === id)
		if (idx >= 0) {
			data.profiles[idx] = { ...data.profiles[idx], ...patch }
			await this.save(data)
		}
	}

	async deleteProfile(id: string): Promise<void> {
		const data = await this.load()
		data.profiles = data.profiles.filter((p) => p.id !== id)
		if (data.activeProfileId === id && data.profiles[0]) {
			data.activeProfileId = data.profiles[0].id
		}
		await this.save(data)
	}

	async setActiveProfile(id: string): Promise<void> {
		const data = await this.load()
		if (data.profiles.some((p) => p.id === id)) {
			data.activeProfileId = id
			await this.save(data)
		}
	}

	/** Map the active profile onto OpenAI-compatible apiConfiguration fields. */
	async toApiConfiguration(): Promise<Record<string, unknown>> {
		const p = await this.getActiveProfile()
		return {
			apiProvider: "openai",
			openAiBaseUrl: p.baseUrl,
			openAiApiKey: p.apiKey,
			planModeApiProvider: "openai",
			actModeApiProvider: "openai",
			planModeOpenAiModelId: p.modelId,
			actModeOpenAiModelId: p.modelId,
		}
	}
}
```

- [ ] **Step 2: Run the tests to confirm they pass**

```bash
npm run test:unit 2>&1 | grep -i 'ModelProfileService'
```
Expected: 3 passing.

- [ ] **Step 3: Confirm the `@/config/...` import alias resolves under the test tsconfig**

```bash
npm run check-types
```
Expected: no errors. (If the `@/` alias is not mapped for `mocha`/`tsconfig.unit-test.json`, switch the import to a relative path `../../config/cellockaiDefaults`.)

- [ ] **Step 4: Checkpoint (no commit)**

Leave the new `src/core/profiles` files in the working tree. Do not stage or commit.

---

### Task 4.5: Apply the active profile to the running task's API config

The active profile must drive the real API handler. Apply it where `apiConfiguration` is assembled before `createHandlerForProvider` / task construction.

**Files:**
- Modify: the controller/task setup that reads `apiConfiguration` (find it below)

- [ ] **Step 1: Find where apiConfiguration is read to build the handler**

```bash
grep -rn 'getApiConfiguration\|buildApiHandler\|createHandlerForProvider' src/core | head
```

- [ ] **Step 2: Overlay the active profile onto apiConfiguration at task start**

At the point where the controller resolves the current `apiConfiguration` for a new task (with the workspace cwd available), instantiate `new ModelProfileService(cwd)`, call `await svc.toApiConfiguration()`, and shallow-merge it **over** the resolved config so the profile's OpenAI-compatible fields win:
```ts
import { ModelProfileService } from "@/core/profiles/ModelProfileService"
// ...
const profileCfg = await new ModelProfileService(cwd).toApiConfiguration()
const apiConfiguration = { ...resolvedApiConfiguration, ...profileCfg }
```
Use the same cwd/workspace-root accessor the surrounding code already uses (see `src/core/workspace`). Keep this overlay non-fatal: if the cwd is unavailable (no workspace open), skip the overlay.

- [ ] **Step 3: Typecheck**

```bash
npm run check-types
```
Expected: no errors.

- [ ] **Step 4: Checkpoint (no commit)**

Leave the changes in the working tree. Do not stage or commit.

---

### Task 4.6: Profiles settings UI

**Files:**
- Create: `apps/vscode/webview-ui/src/components/settings/sections/ProfilesSection.tsx`
- Modify: `apps/vscode/webview-ui/src/components/settings/SettingsView.tsx`
- Modify: `apps/vscode/proto/cline/*.proto` + a controller handler (for read/write RPCs)

This needs an RPC pair so the webview can read/write `.cellockai/profiles.json` (the webview has no filesystem access). Follow the existing gRPC pattern (see `CLAUDE.md` → gRPC/Protobuf section).

- [ ] **Step 1: Add proto messages + RPCs**

In an appropriate `apps/vscode/proto/cline/*.proto` (e.g. `state.proto`), add:
```proto
message ModelProfile {
  string id = 1;
  string name = 2;
  string base_url = 3;
  string model_id = 4;
  string api_key = 5;
}
message ProfilesResponse {
  string active_profile_id = 1;
  repeated ModelProfile profiles = 2;
}
message UpsertProfileRequest {
  ModelProfile profile = 1; // empty id = create
}
message SetActiveProfileRequest { string id = 1; }
message DeleteProfileRequest { string id = 1; }
```
Add RPCs `getProfiles`, `upsertProfile`, `setActiveProfile`, `deleteProfile` returning `ProfilesResponse`.

- [ ] **Step 2: Regenerate proto types**

```bash
npm run protos
```
Expected: regenerated types in `src/shared/proto/`, `src/generated/*`.

- [ ] **Step 3: Implement controller handlers**

Create handlers in `src/core/controller/state/` (or matching domain) that delegate to `ModelProfileService(cwd)`. Each returns the full `ProfilesResponse` after mutating, so the webview re-renders from one source of truth.

- [ ] **Step 4: Build the ProfilesSection UI**

`ProfilesSection.tsx` renders: a list of profiles with a radio/active indicator, an "Add profile" form (name, base URL, model id, api key — api key as a password field), edit/delete per row, and calls the generated clients (`StateServiceClient.getProfiles(...)` etc.). On mount, call `getProfiles`; on every mutation, use the returned `ProfilesResponse` to update local state.

- [ ] **Step 5: Register the Profiles tab**

In `SettingsView.tsx`, add to `SETTINGS_TABS`:
```ts
{ id: "profiles", name: "Model Profiles", /* icon + render wiring per the existing tab pattern */ },
```
and render `<ProfilesSection/>` for that tab id.

- [ ] **Step 6: Typecheck + test**

```bash
npm run check-types && npm run test:unit
```
Expected: pass.

- [ ] **Step 7: Checkpoint (no commit)**

Leave the changes in the working tree. Do not stage or commit.

---

## Phase 5 — Verification & Wrap-up

### Task 5.1: Full build + manual smoke

**Files:** none

- [ ] **Step 1: Full production compile**

```bash
npm run compile
```
Expected: completes (check-types + lint + esbuild) with no errors.

- [ ] **Step 2: Launch the extension (manual)**

Press F5 in VS Code (or run the extension's debug launch). Verify in the Extension Development Host:
- Sidebar/title shows **CellockAI**, not Cline.
- No Account button in the nav; Settings has no account card / remote-config tab.
- Settings → **Model Profiles** shows the default **GLM (z.ai)** profile (base URL `https://api.z.ai/api/coding/paas/v4`, model `glm-5.2`).
- Open a folder, add a `.cellockai/rules/` file → it loads as a workspace rule.
- Start a task → it calls the z.ai endpoint using the active profile (verify in network/logs).

- [ ] **Step 3: Confirm the local key file is ignored and untracked**

```bash
git check-ignore apps/vscode/src/config/cellockai-default-key.local.ts
git ls-files apps/vscode/src/config/cellockai-default-key.local.ts
```
Expected: the first prints the path (ignored); the second is empty (untracked). This guarantees that when the user commits later, the key cannot be staged.

- [ ] **Step 4: Full unit suite**

```bash
npm run test:unit
```
Expected: pass.

- [ ] **Step 5: Final residual-branding sweep**

```bash
grep -rnE '>[^<]*\bCline\b[^<]*<' webview-ui/src --include=*.tsx | grep -viE 'Cline[A-Z]' | head
grep -nE '"(displayName|title|description|category)":[^,]*\bCline\b' package.json
```
Expected: no user-facing leftovers (identifier-style `ClineX` matches are fine and expected).

- [ ] **Step 6: Hand off to the user — do NOT commit**

Execution stops here with all changes in the working tree, unstaged. Show the user `git status` and the diff so they can build, run, and test the fork themselves. Committing is the user's decision, to be done after they are satisfied.

```bash
git status
```

---

## Deferred Commit Plan (for the user — run only after you've built and tested)

Nothing above commits. Once you've verified the fork works, here are suggested atomic commit groupings if you want a clean history (the local key file is gitignored and excluded from all of these):

```bash
# 1. Branding
git add apps/vscode/package.json apps/vscode/webview-ui apps/vscode/walkthrough
git commit -m "chore(cellockai): rebrand user-facing strings to CellockAI"

# 2. Hide login/signup (overlaps webview-ui — stage the specific files if you want it separate)
#    Navbar.tsx, App.tsx, account/AccountView.tsx, settings/SettingsView.tsx
git commit -m "feat(cellockai): hide login/signup and account surfaces"

# 3. .cellockai project config root
git add apps/vscode/src/core/storage/disk.ts apps/vscode/src/core/context/instructions
git commit -m "feat(cellockai): relocate project config from .clinerules to .cellockai"

# 4. Model Profiles + default profile (key file stays ignored)
git add apps/vscode/src/core/profiles apps/vscode/src/config/cellockaiDefaults.ts \
        apps/vscode/src/config/cellockai-default-key.local.example.ts apps/vscode/.gitignore \
        apps/vscode/proto apps/vscode/src/core/controller apps/vscode/webview-ui/src/components/settings
git commit -m "feat(cellockai): per-project model profiles with z.ai/GLM default"

# Sanity check before pushing: ensure the key never slipped in
git log -p --all -- apps/vscode/src/config/cellockai-default-key.local.ts   # expect: empty
```

(These groupings are advisory — adjust to taste. The point is: the key file is never staged.)

---

## Self-Review Notes (coverage map)

- **New branch** → Task 1.1.
- **Rename Cline→CellockAI (user-facing)** → Tasks 1.2, 1.3, plus 5.1 Step 5 sweep.
- **Hide login/signup** → Phase 2 (2.1 nav button, 2.2 route+welcome, 2.3 settings surfaces).
- **Model Profile (OpenAI-compatible URL/model/key)** → Phase 4 (types 4.1, service 4.3/4.4, runtime wiring 4.5, UI 4.6).
- **Save per-project `.cellockai` for skills/mcp/rules/profiles** → Phase 3 (rules/skills/workflows 3.1, MCP 3.2) + profiles file in Phase 4.
- **Default profile → z.ai / glm-5.2 / key** → Task 4.2 (constants + gitignored key) + 4.4 (`buildDefault`) + 4.5 (overlay).

**Known risks flagged in-plan:** `@/` alias under unit-test tsconfig (4.4 Step 3 fallback), missing local key file must not break build (4.2 Step 4 try/catch), snapshot regeneration after branding (1.3 Step 5), proto regen required for UI RPCs (4.6 Step 2).
