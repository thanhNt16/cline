/**
 * Pure project-selection rule (webview mirror of the backend
 * DocsIndexSettingsService.selectProject). Order: exact basename match →
 * persisted last project if still present → first project → "".
 */
export function selectProject(
	projectNames: string[],
	workspaceBasename: string,
	lastProject: string | undefined,
): string {
	if (projectNames.length === 0) return ""
	const byBasename = projectNames.find((name) => name === workspaceBasename)
	if (byBasename) return byBasename
	if (lastProject && projectNames.includes(lastProject)) return lastProject
	return projectNames[0]
}
