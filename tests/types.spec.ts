import { describe, expect, it } from "vitest";
import { DEFAULT_NOTE_TYPE, NOTE_TYPE_ID_RE, slug } from "../src/constants";
import type { NoteTypeConfig } from "../src/types";

const makeType = (overrides: Partial<NoteTypeConfig> = {}): NoteTypeConfig => ({
	...DEFAULT_NOTE_TYPE,
	id: "work",
	name: "Work",
	...overrides,
});

describe("slug", () => {
	it("should lowercase and trim the input", () => {
		expect(slug("Work")).toBe("work");
		expect(slug("  Journal  ")).toBe("journal");
	});

	it("should collapse runs of non-alphanumerics into a single dash", () => {
		expect(slug("Work Notes")).toBe("work-notes");
		expect(slug("My  Work!")).toBe("my-work");
	});

	it("should strip leading and trailing dashes", () => {
		expect(slug("--Work--")).toBe("work");
		expect(slug("-Work!")).toBe("work");
	});

	it("should allow digits at the start", () => {
		expect(slug("1st")).toBe("1st");
		expect(slug("2nd Notes")).toBe("2nd-notes");
	});

	it("should drop non-ASCII letters", () => {
		expect(slug("Café")).toBe("caf");
	});

	it("should return an empty string when the input is empty", () => {
		expect(slug("")).toBe("");
	});

	it("should return an empty string when the input is only whitespace", () => {
		expect(slug("   ")).toBe("");
	});

	it("should return an empty string when the input has no alphanumerics", () => {
		expect(slug("!!!")).toBe("");
		expect(slug("???")).toBe("");
	});

	it("should always produce an id accepted by NOTE_TYPE_ID_RE", () => {
		for (const input of ["Work", "My  Work!", "1st", "Café", "Q3 Report!"]) {
			const id = slug(input);
			expect(NOTE_TYPE_ID_RE.test(id), `${input} -> ${id}`).toBe(true);
		}
	});
});

describe("NOTE_TYPE_ID_RE", () => {
	it("should accept a valid lowercase alphanumeric id", () => {
		expect(NOTE_TYPE_ID_RE.test("work")).toBe(true);
		expect(NOTE_TYPE_ID_RE.test("my-note")).toBe(true);
		expect(NOTE_TYPE_ID_RE.test("a1")).toBe(true);
		expect(NOTE_TYPE_ID_RE.test("a")).toBe(true);
	});

	it("should reject an id with uppercase letters", () => {
		expect(NOTE_TYPE_ID_RE.test("Work")).toBe(false);
	});

	it("should reject an empty id", () => {
		expect(NOTE_TYPE_ID_RE.test("")).toBe(false);
	});

	it("should reject an id with a leading dash", () => {
		expect(NOTE_TYPE_ID_RE.test("-lead")).toBe(false);
		expect(NOTE_TYPE_ID_RE.test("-test")).toBe(false);
	});

	it("should reject an id with a trailing dash", () => {
		expect(NOTE_TYPE_ID_RE.test("trail-")).toBe(false);
	});

	it("should reject an id with a double dash", () => {
		expect(NOTE_TYPE_ID_RE.test("a--b")).toBe(false);
	});

	it("should reject an id containing a space or path/command separator", () => {
		expect(NOTE_TYPE_ID_RE.test("a b")).toBe(false);
		expect(NOTE_TYPE_ID_RE.test("a/b")).toBe(false);
		expect(NOTE_TYPE_ID_RE.test("a:b")).toBe(false);
		expect(NOTE_TYPE_ID_RE.test("a.b")).toBe(false);
		expect(NOTE_TYPE_ID_RE.test("a_b")).toBe(false);
	});

	it("should reject an id that does not start with an alphanumeric", () => {
		expect(NOTE_TYPE_ID_RE.test(".test")).toBe(false);
	});
});

describe("NoteTypeConfig", () => {
	it("should produce a full config when built from defaults plus id and name", () => {
		const type = makeType();
		expect(type.id).toBe("work");
		expect(type.name).toBe("Work");
		expect(type.enabled).toBe(true);
		expect(type.granularity).toBe("day");
		expect(type.folder).toBe("");
		expect(type.format).toBe("");
		expect(type.templatePath).toBe("");
		expect(type.openAtStartup).toBe(false);
	});

	it("should apply overrides on top of the defaults", () => {
		const type = makeType({
			id: "journal",
			name: "Journal",
			enabled: false,
			granularity: "week",
			folder: "Journal",
		});
		expect(type.id).toBe("journal");
		expect(type.name).toBe("Journal");
		expect(type.enabled).toBe(false);
		expect(type.granularity).toBe("week");
		expect(type.folder).toBe("Journal");
	});
});
