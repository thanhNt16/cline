# CellockAI Global Configuration Persistence Design

**Date:** 2026-07-28
**Status:** Approved

## Goal

Persist CellockAI's Document Index and Database settings globally, make API profiles and MCP servers resolve from a global base with workspace overrides, and auto-select the Document Index project that matches the active workspace folder.

## Scope

This design changes three existing settings areas:

1. **Document Indexing & Search**
   - Persist the server URL and last selected project under `~/.cellockai`.
   - Restore persisted values after tab changes, extension reset, and VS Code restart.
   - Recompute connection status and project lists rather than persisting transient runtime state.
   - Auto-select a project whose name equals the current workspace folder basename.

2. **Connect a Database / MCP**
   - Make `~/.cellockai/mcp_settings.json` the default write target for all MCP mutations.
   - Continue reading global configuration first and workspace `.cellockai` files afterward, so workspace entries override global entries by server name.
   - Show saved global PostgreSQL MCP connections in the Database tab, plus an Add New form.

3. **API Configuration profiles**
   - Read `~/.cellockai/profiles.json` as the global base.
   - Merge `<workspace>/.cellockai/profiles.json` over global profiles by profile id.
   - Route profile mutations back to the file that owns the profile; create new profiles globally.

Transient Document Index inputs—upload path, URL input, batch options, search query/options, and task id—remain in-memory only.

## Configuration Files and Precedence

### Global files

- `~/.cellockai/mcp_settings.json`
- `~/.cellockai/profiles.json`
- `~/.cellockai/docs_index.json`

### Workspace files

- `<workspace>/.cellockai/mcp_settings.json`
- `<workspace>/.cellockai/profiles.json`
- Existing per-root MCP overlay: `<workspace>/.cellockai/mcp.json`

### Effective MCP precedence

For a server-name collision, later layers win:

1. Global `~/.cellockai/mcp_settings.json`
2. Primary workspace `<workspace>/.cellockai/mcp_settings.json`
3. Each registered workspace root's `<workspace>/.cellockai/mcp.json`, in existing workspace-root order

The existing `McpHub.readAndValidateMcpSettingsFile()` merge behavior remains the effective read path. The implementation changes write routing and removes assumptions that the primary workspace file is the canonical write store.

### Effective profile precedence

For a profile-id collision, the workspace profile replaces the complete global profile object:

1. Global `~/.cellockai/profiles.json`
2. Active workspace `<workspace>/.cellockai/profiles.json`

The effective `activeProfileId` is the workspace value when non-empty and valid in the merged profile list; otherwise the valid global value; otherwise the first merged profile id; otherwise empty.

## Architecture

### 1. Global path helpers and atomic JSON writes

Extend the existing storage layer in `apps/vscode/src/core/storage/disk.ts` rather than adding a general configuration framework.

Add explicit path helpers:

```ts
export function getCellockaiGlobalDirectoryPath(): string
export function getGlobalProfilesFilePath(): string
export function getGlobalDocsIndexSettingsFilePath(): string
```

`getGlobalMcpSettingsFilePath()` remains the MCP global-path source of truth.

Add or reuse a lock-safe atomic JSON update helper for non-MCP files. MCP files continue using `updateMcpSettingsFile()` because it already validates the schema and serializes cross-process read-modify-write operations. Profile and Document Index writes use temp-file-plus-rename semantics and create `~/.cellockai` when needed. A failed write leaves the previous valid file intact.

### 2. MCP read and write ownership

#### Read behavior

Keep the current merged read result. Refactor repeated raw primary-file reads in `McpHub` so server ordering, auto-approve lookup, and webview notifications use the merged settings result. Otherwise global-only servers can connect but be absent from ordering or tool-level settings.

#### Write behavior

Use two routing operations:

```ts
type McpSettingsOwner = "global" | "workspace"

async function resolveMcpSettingsOwner(serverName: string): Promise<McpSettingsOwner>
async function getMcpWriteFilePath(serverName?: string): Promise<string>
```

Rules:

- A new server (`serverName` absent or not found in writable layers) writes to `~/.cellockai/mcp_settings.json`.
- If the primary workspace `mcp_settings.json` contains `serverName`, mutations for that server write to the workspace file.
- Otherwise, if the global file contains `serverName`, mutations write to the global file.
- Workspace ownership wins when the same server name exists in both layers because the effective server is the workspace override.
- Existing per-root `.cellockai/mcp.json` is a read-only overlay for UI/RPC mutations. If a server exists only there, mutation requests fail with an error naming the owning file instead of silently creating a hidden global entry.
- Delete removes the server only from its owning writable layer. If a workspace override is deleted, the global server of the same name becomes effective immediately.
- Add rejects a name already present in any effective layer. It does not create a hidden lower-precedence duplicate.

Apply routing to add, delete, enable/disable, auto-approve, timeout, OAuth updates, remote-config reconciliation, Document Index MCP registration, and all other settings mutations. This prevents one mutation path from continuing to write workspace-local state by accident.

`McpHub.getMcpSettingsFilePath()` becomes the global default path for new registrations. Add an explicit owner-aware method for existing-server mutation rather than letting callers infer directories.

### 3. Profile layer and ownership

Keep `ModelProfileService` as the single profile API. Change its construction to receive an optional workspace path while always knowing the global profile path:

```ts
constructor(workspacePath?: string)
```

Internal reads return both merged data and ownership metadata:

```ts
type ProfileLayer = "global" | "workspace"

type LayeredProfiles = {
  merged: ProfilesFile
  owners: Map<string, ProfileLayer>
  global: ProfilesFile
  workspace?: ProfilesFile
}
```

Rules:

- Missing, empty, or malformed global/workspace files are treated as an empty layer and logged; the other valid layer remains usable.
- New profiles write to global.
- Updating or deleting an existing profile writes to its owning layer.
- A workspace profile with a duplicate id owns the effective merged profile.
- Setting the active profile writes `activeProfileId` to the selected profile's owning layer. This lets a workspace select a workspace override without modifying the global default, while selection of a global profile updates the global default.
- Deleting the active profile repairs the affected layer's `activeProfileId`; effective resolution then applies the standard workspace/global/first-profile fallback.
- Profile ids remain stable. No name-based merge or migration occurs.

All existing controller RPC signatures remain unchanged. `getWorkspacePath()` still determines the active workspace; the service handles no-workspace mode by reading and writing global only.

The synchronous active-profile overlay used by `getStateToPostToWebview()` must adopt the same merge and active-id resolution rules as `ModelProfileService`; otherwise the API Configuration UI and the model actually used by tasks can diverge.

### 4. Document Index settings service

Add a focused extension-side service, for example:

`apps/vscode/src/services/docs-index/DocsIndexSettingsService.ts`

File schema:

```ts
export interface DocsIndexSettings {
  serverUrl: string
  lastProjects: Record<string, string>
}
```

Defaults:

```ts
{
  serverUrl: "http://localhost:8080",
  lastProjects: {},
}
```

The `lastProjects` key is the normalized absolute primary workspace path, not only its basename. This avoids collisions when two open folders share a name. Folder basename remains the project-name matching input.

Expose controller RPCs:

```ts
getDocsIndexSettings(EmptyRequest): Promise<DocsIndexSettingsResponse>
updateDocsIndexSettings(UpdateDocsIndexSettingsRequest): Promise<DocsIndexSettingsResponse>
```

A small protobuf addition is appropriate here because these values must cross the extension/webview boundary and be persisted by the extension process. Generated protobuf/grpc files are regenerated using the repository's existing codegen command; generated files are not hand-edited.

`DocsIndexSettingsResponse` includes:

- `serverUrl`
- `lastSelectedProject` for the current workspace path
- `workspaceBasename`

The webview does not need the whole path-to-project map.

Updates use field-preserving semantics: changing the server URL does not erase project mappings; changing the current workspace's project does not alter mappings for other workspaces.

#### Initialization and selection flow

When `SettingsView` mounts:

1. Fetch persisted Document Index settings.
2. Initialize `serverUrl` from the response.
3. Ping the server URL. Connection status is derived, never persisted.
4. On a successful ping, fetch projects.
5. Select in this order:
   1. Exact project name equal to `workspaceBasename`.
   2. Persisted `lastSelectedProject` when it still exists.
   3. First returned project.
   4. Empty string when there are no projects.
6. Persist the chosen project for the current workspace when non-empty.

A manual project selection updates `lastProjects[currentWorkspacePath]`. A server URL edit is persisted on blur or successful Connect, not on every keystroke. Switching tabs remounts from persisted state without losing values.

A failed ping leaves the persisted URL visible, marks the UI disconnected, and does not erase the last project. A failed project refresh keeps the prior selected project value but disables project-dependent actions until a valid list is available.

### 5. Database tab

The Database settings section becomes a saved-connections list plus the existing PostgreSQL form.

Identify wizard-created PostgreSQL entries deterministically. Extend the generated MCP server config with CellockAI metadata rather than parsing arbitrary command-line arguments for classification:

```ts
metadata: {
  cellockaiPreset: "postgres-mcp-toolbox"
}
```

The MCP schema already tolerates or explicitly supports metadata where OAuth/fingerprinting logic references it; the implementation must ensure this metadata survives read/write validation and does not trigger a server restart.

UI behavior:

- List effective MCP servers whose `metadata.cellockaiPreset` is `postgres-mcp-toolbox`.
- Show server name, database, host, port, and whether the entry is global or workspace override.
- Provide **Add New**, **Edit**, and **Delete**.
- Add New starts with `toolbox-postgres`, blank credentials, and existing optional defaults.
- Edit parses the preset's known argument/env shape into `PostgresConnectionFields`, then updates the owning MCP layer without changing the server id/name unless the user explicitly changes it.
- Password inputs remain masked. Existing password is retained when the edit form is submitted without changing it.
- Delete uses the owner-aware MCP delete route and confirms before removal.
- Workspace-only overrides remain visible because the list uses the effective merged MCP state. The global entry reappears if its workspace override is deleted.

The copy changes from workspace-specific `.cellockai/mcp_settings.json` to `~/.cellockai/mcp_settings.json`, with a note that workspace files can override global connections.

### 6. Reset and restart semantics

The existing extension reset operation must not delete `~/.cellockai` files. The implementation verifies this behavior with a controller/service test. If the current reset path removes these files, exclude the three global files explicitly.

Expected persistence behavior:

| Event | Document Index | DB/MCP | API profiles |
|---|---|---|---|
| Switch settings tabs | Restored | List restored | Restored |
| Close/reopen settings | Restored | List restored | Restored |
| Reset extension state | Restored from files | Restored from files | Restored from files |
| Restart VS Code | Restored from files | Restored from files | Restored from files |
| Open another workspace | Global URL; workspace-specific last project | Global base + new workspace overrides | Global base + new workspace overrides |

## Error Handling

- JSON parse/schema errors identify the exact file path and layer.
- A malformed workspace file does not suppress a valid global layer; it is skipped with a visible/logged diagnostic.
- Writes use locks/atomic replacement to prevent concurrent VS Code windows or the CLI from truncating shared files.
- Mutation of a server sourced only from `.cellockai/mcp.json` fails explicitly; no masked global duplicate is created.
- Profile update/delete with an unknown id fails instead of silently succeeding.
- Document Index settings validate `serverUrl` as an HTTP/HTTPS URL before persistence. Invalid input remains in the form with an inline error; the previous file stays unchanged.
- Secrets remain plaintext only where MCP already stores them. The Database tab keeps the existing warning and recommends a read-only DB role.

## Testing Strategy

### Storage and layering unit tests

- Global path helpers resolve exactly under a mocked home directory.
- Atomic JSON writes preserve the previous file on injected failure.
- MCP global-only, workspace-only, collision, and `.cellockai/mcp.json` ownership cases.
- New MCP servers write globally.
- Workspace overrides receive edits/deletes in the workspace file.
- Deleting a workspace override reveals the global server.
- Merged ordering and auto-approve behavior include global servers.

### Profile service tests

Extend `ModelProfileService.test.ts`:

- Global-only profiles load without a workspace file.
- Workspace profiles override global profiles by id.
- New profiles write globally.
- Updates/deletes write to the owner layer.
- Active profile fallback rules cover invalid ids and deletions.
- Malformed one-layer input does not hide the valid layer.
- No-workspace mode is global-only.
- Synchronous task overlay matches async service output.

### Document Index settings tests

- Defaults load when `docs_index.json` is absent.
- URL and workspace project mappings survive service reconstruction.
- Updating one field preserves the other fields and other workspace mappings.
- Selection helper tests exact basename, persisted fallback, first-project fallback, and empty list.
- Ping failure keeps persisted values but reports disconnected state.

### Database UI and builder tests

Extend the existing `AddDatabaseServerForm.test.tsx` and `McpConfigurationView.test.tsx` coverage:

- Existing preset servers render in the list.
- Add writes a metadata-marked global entry.
- Edit round-trips known PostgreSQL fields and retains an unchanged password.
- Delete requests confirmation and removes the owning entry.
- Non-preset MCP servers do not appear in the Database list.
- Workspace override ownership is displayed.

### Verification commands

Use repository-local test/typecheck commands from `apps/vscode/package.json` and the webview package. The implementation plan will name exact focused commands after confirming current scripts. Final verification includes focused tests, VS Code package typecheck, webview typecheck, and protobuf generation consistency.

## File Responsibilities

Expected focused changes:

- `apps/vscode/src/core/storage/disk.ts` — global path helpers only.
- `apps/vscode/src/core/profiles/ModelProfileService.ts` — profile merge/ownership/mutations.
- `apps/vscode/src/core/controller/state/active-profile-overlay.ts` — synchronous layered profile resolution.
- `apps/vscode/src/services/mcp/McpHub.ts` — merged reads and owner-aware writes.
- `apps/vscode/src/services/docs-index/McpRegistrationService.ts` — global/owner-aware MCP registration.
- `apps/vscode/src/services/docs-index/DocsIndexSettingsService.ts` — persistent Document Index settings.
- `apps/vscode/src/core/controller/docsIndex/*DocsIndexSettings*.ts` — webview RPC handlers.
- `apps/vscode/proto/cline/docs_index.proto` — settings request/response RPCs.
- `apps/vscode/webview-ui/src/components/settings/SettingsView.tsx` — docs settings initialization.
- `apps/vscode/webview-ui/src/components/settings/sections/docs-index/ProjectsCard.tsx` — deterministic project selection/persistence.
- `apps/vscode/webview-ui/src/components/settings/sections/DatabaseSection.tsx` — saved DB list and form mode.
- `apps/vscode/webview-ui/src/components/mcp/configuration/tabs/add-server/AddDatabaseServerForm.tsx` — add/edit form.
- `apps/vscode/webview-ui/src/components/mcp/configuration/tabs/add-server/databasePresets.ts` — preset metadata and reverse parser.
- Existing adjacent tests — focused regressions; no new test framework.

Generated protobuf/grpc files change only through the existing generator.

## Non-Goals

- Encrypting MCP credentials at rest.
- Migrating arbitrary existing MCP entries into PostgreSQL preset metadata.
- Persisting every Document Index form field.
- Adding a user-selectable global/workspace write-target control.
- Changing `.cellockai/mcp.json` ownership or making it writable through the UI.
- Refactoring unrelated settings tabs or replacing the existing state architecture.
