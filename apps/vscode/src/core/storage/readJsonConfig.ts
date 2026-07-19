import fs from "fs/promises"

/**
 * Reads and parses a JSON config file. Returns undefined if the file is
 * missing, empty, or contains invalid JSON. Non-fatal — callers decide
 * whether the absence is an error or expected.
 */
export async function readJsonConfigFile<T>(filePath: string): Promise<T | undefined> {
	try {
		const content = await fs.readFile(filePath, "utf8")
		const trimmed = content.trim()
		if (!trimmed) return undefined
		return JSON.parse(trimmed) as T
	} catch {
		return undefined
	}
}
