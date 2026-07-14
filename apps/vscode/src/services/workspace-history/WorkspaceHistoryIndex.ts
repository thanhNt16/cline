import * as fs from "node:fs/promises"
import * as path from "node:path"
import { getProjectSettingsDirectoryPath } from "@core/storage/disk"
import { Logger } from "@/shared/services/Logger"

interface WorkspaceHistoryFile {
	taskIds: string[]
}

export class WorkspaceHistoryIndex {
	private cachedTaskIds: Set<string> | null = null
	private cacheValid = false

	private async getHistoryFilePath(): Promise<string> {
		const settingsDir = await getProjectSettingsDirectoryPath()
		const sessionsDir = path.join(settingsDir, "sessions")
		await fs.mkdir(sessionsDir, { recursive: true })
		return path.join(sessionsDir, "history.json")
	}

	private async readIndex(): Promise<Set<string>> {
		if (this.cacheValid && this.cachedTaskIds) {
			return this.cachedTaskIds
		}
		try {
			const filePath = await this.getHistoryFilePath()
			const content = await fs.readFile(filePath, "utf8")
			const parsed = JSON.parse(content) as WorkspaceHistoryFile
			this.cachedTaskIds = new Set(parsed.taskIds || [])
		} catch {
			this.cachedTaskIds = new Set()
		}
		this.cacheValid = true
		return this.cachedTaskIds
	}

	private async writeIndex(ids: Set<string>): Promise<void> {
		const filePath = await this.getHistoryFilePath()
		const data: WorkspaceHistoryFile = { taskIds: Array.from(ids) }
		await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8")
		this.cachedTaskIds = ids
		this.cacheValid = true
	}

	async getTaskIds(): Promise<Set<string>> {
		return await this.readIndex()
	}

	async addTaskId(taskId: string): Promise<void> {
		try {
			const ids = await this.readIndex()
			if (ids.has(taskId)) return
			ids.add(taskId)
			await this.writeIndex(ids)
		} catch (error) {
			Logger.error("[WorkspaceHistoryIndex] Failed to add task ID:", error)
		}
	}

	async removeTaskId(taskId: string): Promise<void> {
		try {
			const ids = await this.readIndex()
			if (!ids.has(taskId)) return
			ids.delete(taskId)
			await this.writeIndex(ids)
		} catch (error) {
			Logger.error("[WorkspaceHistoryIndex] Failed to remove task ID:", error)
		}
	}

	async containsTaskId(taskId: string): Promise<boolean> {
		const ids = await this.readIndex()
		return ids.has(taskId)
	}

	invalidateCache(): void {
		this.cachedTaskIds = null
		this.cacheValid = false
	}
}
