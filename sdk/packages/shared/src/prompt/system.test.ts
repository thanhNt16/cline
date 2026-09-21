import { describe, expect, it } from "vitest";
import { DEFAULT_CLINE_SYSTEM_PROMPT, DEFAULT_CLINE_SYSTEM_PROMPTS } from "./system";

describe("system prompt identity", () => {
	it("introduces the default system prompt as CellockAI", () => {
		expect(DEFAULT_CLINE_SYSTEM_PROMPT.startsWith("You are CellockAI, an AI coding agent.")).toBe(true);
		expect(DEFAULT_CLINE_SYSTEM_PROMPT).not.toContain("You are Cline");
	});

	it("introduces the yolo system prompt as CellockAI", () => {
		expect(DEFAULT_CLINE_SYSTEM_PROMPTS.YOLO.startsWith("You are CellockAI, a careful and helpful coding agent")).toBe(true);
		expect(DEFAULT_CLINE_SYSTEM_PROMPTS.YOLO).not.toContain("You are Cline");
	});
});
