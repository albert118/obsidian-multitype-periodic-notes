import { describe, expect, it } from "vitest";
import { add } from "../src/utils";

describe("harness", () => {
	it("arithmetic", () => {
		expect(2 + 2).toBe(4);
	});
	it("imports src", () => {
		expect(add(1, 2)).toBe(3);
	});
});
