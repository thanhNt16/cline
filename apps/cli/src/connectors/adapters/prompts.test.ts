import { describe, expect, it } from "vitest";
import { getConnectorFirstContactMessage } from "./prompts";

describe("getConnectorFirstContactMessage", () => {
	it("greets the user as CellockAI", () => {
		const message = getConnectorFirstContactMessage();
		expect(message).toContain("Connected to CellockAI.");
		expect(message).not.toContain("Connected to Cline.");
	});
});
