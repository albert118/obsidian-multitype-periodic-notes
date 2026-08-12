import { describe, expect, it } from "vitest";
import { DEFAULT_FORMATS, DEFAULT_NOTE_TYPE } from "../src/constants";

describe("DEFAULT_FORMATS", () => {
	it("should map each granularity to its format string", () => {
		expect(DEFAULT_FORMATS.day).toBe("YYYY-MM-DD");
		expect(DEFAULT_FORMATS.week).toBe("gggg-[W]ww");
		expect(DEFAULT_FORMATS.month).toBe("YYYY-MM");
		expect(DEFAULT_FORMATS.quarter).toBe("YYYY-[Q]Q");
		expect(DEFAULT_FORMATS.year).toBe("YYYY");
	});

	it("should contain exactly the five granularity keys", () => {
		expect(Object.keys(DEFAULT_FORMATS).sort()).toEqual([
			"day",
			"month",
			"quarter",
			"week",
			"year",
		]);
	});

	it("should be frozen against mutation", () => {
		expect(Object.isFrozen(DEFAULT_FORMATS)).toBe(true);
	});
});

describe("DEFAULT_NOTE_TYPE", () => {
	it("should default to an enabled daily note with empty path fields", () => {
		expect(DEFAULT_NOTE_TYPE.enabled).toBe(true);
		expect(DEFAULT_NOTE_TYPE.granularity).toBe("day");
		expect(DEFAULT_NOTE_TYPE.folder).toBe("");
		expect(DEFAULT_NOTE_TYPE.format).toBe("");
		expect(DEFAULT_NOTE_TYPE.templatePath).toBe("");
		expect(DEFAULT_NOTE_TYPE.openAtStartup).toBe(false);
	});

	it("should be frozen against mutation", () => {
		expect(Object.isFrozen(DEFAULT_NOTE_TYPE)).toBe(true);
	});

	it("should form a complete config when spread with id and name", () => {
		const config = { ...DEFAULT_NOTE_TYPE, id: "work", name: "Work" };
		expect(config.id).toBe("work");
		expect(config.name).toBe("Work");
		expect(config.enabled).toBe(true);
		expect(config.granularity).toBe("day");
	});
});
