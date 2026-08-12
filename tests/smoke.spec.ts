import { describe, expect, it } from "vitest";
import { slug } from "../src/constants";

describe("harness", () => {
	it("arithmetic", () => {
		expect(2 + 2).toBe(4);
	});
	it("imports src", () => {
		expect(slug("Work Notes")).toBe("work-notes");
	});
});
