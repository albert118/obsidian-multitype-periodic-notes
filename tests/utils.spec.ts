import { beforeEach, describe, expect, it, vi } from "vitest";
import { Notice, normalizePath } from "obsidian";
import {
	applyTemplateTransformations,
	ensureFolderExists,
	getNotePath,
	getTemplateContents,
	resolveNotePath,
	type AppLike,
	type MomentLike,
} from "../src/utils";

vi.mock("obsidian", () => ({
	normalizePath: vi.fn((path: string) => path),
	Notice: vi.fn(),
}));

const makeDate = (formatted = "14:30"): MomentLike => ({
	format: vi.fn((format: string) => (format === "HH:mm" ? formatted : "")),
});

const makeApp = (overrides: Partial<AppLike> = {}): AppLike => ({
	vault: {
		getAbstractFileByPath: () => null,
		createFolder: vi.fn().mockResolvedValue(undefined),
	},
	...overrides,
});

const makeTemplateApp = (overrides: Record<string, unknown> = {}): {
	metadataCache: { getFirstLinkpathDest: (path: string, sourcePath: string) => unknown };
	vault: { cachedRead: ReturnType<typeof vi.fn> };
} => ({
	metadataCache: { getFirstLinkpathDest: () => null },
	vault: { cachedRead: vi.fn().mockResolvedValue("template body") },
	...overrides,
} as never);

beforeEach(() => {
	vi.clearAllMocks();
});

describe("applyTemplateTransformations", () => {
	it("should substitute date, time, and title tokens from the filename and injected date", () => {
		const date = makeDate();
		const result = applyTemplateTransformations(
			"2026-08-12",
			date,
			"{{date}} {{time}} {{title}}"
		);
		expect(result).toBe("2026-08-12 14:30 2026-08-12");
		expect(date.format).toHaveBeenCalledWith("HH:mm");
	});

	it("should tolerate whitespace inside tokens", () => {
		const result = applyTemplateTransformations(
			"note",
			makeDate(),
			"{{ date }} {{  time  }} {{ title }}"
		);
		expect(result).toBe("note 14:30 note");
	});

	it("should match tokens case-insensitively", () => {
		const result = applyTemplateTransformations("note", makeDate(), "{{DATE}} {{Time}}");
		expect(result).toBe("note 14:30");
	});

	it("should leave an empty template unchanged", () => {
		expect(applyTemplateTransformations("note", makeDate(), "")).toBe("");
	});

	it("should leave a template without tokens unchanged", () => {
		const body = "no tokens in here";
		expect(applyTemplateTransformations("note", makeDate(), body)).toBe(body);
	});

	it("should use the injected date value for the time token", () => {
		const date = makeDate("09:05");
		expect(applyTemplateTransformations("note", date, "{{time}}")).toBe("09:05");
	});
});

describe("resolveNotePath", () => {
	it("should join folder, filename, and the .md extension", () => {
		expect(resolveNotePath("Work", "2026-08-12")).toBe("Work/2026-08-12.md");
	});

	it("should not emit a leading slash when the folder is empty", () => {
		expect(resolveNotePath("", "note")).toBe("note.md");
		expect(resolveNotePath("/", "note")).toBe("note.md");
	});

	it("should strip trailing slashes from the folder", () => {
		expect(resolveNotePath("Work/", "note")).toBe("Work/note.md");
	});

	it("should normalize Windows-style backslashes to forward slashes", () => {
		expect(resolveNotePath("Work\\Sub", "note")).toBe("Work/Sub/note.md");
	});
});

describe("getNotePath", () => {
	it("should create each missing folder recursively and return the nested path", async () => {
		const createFolder = vi.fn().mockResolvedValue(undefined);
		const app = makeApp({ vault: { getAbstractFileByPath: () => null, createFolder } });
		const path = await getNotePath(app, "note", { folder: "a/b/c" });
		expect(path).toBe("a/b/c/note.md");
		expect(createFolder.mock.calls.map((call) => call[0])).toEqual(["a", "a/b", "a/b/c"]);
	});

	it("should not create any folder when the type folder is empty", async () => {
		const createFolder = vi.fn().mockResolvedValue(undefined);
		const app = makeApp({ vault: { getAbstractFileByPath: () => null, createFolder } });
		const path = await getNotePath(app, "note", { folder: "" });
		expect(path).toBe("note.md");
		expect(createFolder).not.toHaveBeenCalled();
	});

	it("should emit a /-joined normalized path for Windows-style folder input", async () => {
		const app = makeApp();
		const path = await getNotePath(app, "note", { folder: "Work\\Sub" });
		expect(path).toBe("Work/Sub/note.md");
	});

	it("should reject when createFolder throws", async () => {
		const app = makeApp({
			vault: {
				getAbstractFileByPath: () => null,
				createFolder: vi.fn().mockRejectedValue(new Error("create failed")),
			},
		});
		await expect(getNotePath(app, "note", { folder: "a" })).rejects.toThrow("create failed");
	});
});

describe("ensureFolderExists", () => {
	it("should skip existing folders and create only the missing ones", async () => {
		const createFolder = vi.fn().mockResolvedValue(undefined);
		const app = makeApp({
			vault: {
				getAbstractFileByPath: vi.fn((path: string) =>
					path === "a" ? { name: "a" } : null
				),
				createFolder,
			},
		});
		await ensureFolderExists(app, "a/b/c/note.md");
		expect(createFolder.mock.calls.map((call) => call[0])).toEqual(["a/b", "a/b/c"]);
	});

	it("should be idempotent when every folder already exists", async () => {
		const createFolder = vi.fn().mockResolvedValue(undefined);
		const app = makeApp({
			vault: {
				getAbstractFileByPath: () => ({ name: "existing" }),
				createFolder,
			},
		});
		await ensureFolderExists(app, "a/b/c/note.md");
		expect(createFolder).not.toHaveBeenCalled();
	});
});

describe("getTemplateContents", () => {
	it("should return the template contents when the file resolves", async () => {
		const file = { path: "Templates/work.md" };
		const app = makeTemplateApp({
			metadataCache: { getFirstLinkpathDest: () => file },
		});
		await expect(getTemplateContents(app, "Templates/work.md")).resolves.toBe(
			"template body"
		);
		expect(normalizePath).toHaveBeenCalledWith("Templates/work.md");
		expect(app.vault.cachedRead).toHaveBeenCalledWith(file);
	});

	it("should return an empty string for an empty template path", async () => {
		await expect(getTemplateContents(makeTemplateApp(), "")).resolves.toBe("");
		expect(Notice).not.toHaveBeenCalled();
	});

	it("should return an empty string for a root template path", async () => {
		await expect(getTemplateContents(makeTemplateApp(), "/")).resolves.toBe("");
		expect(Notice).not.toHaveBeenCalled();
	});

	it("should return an empty string and show a Notice when the file does not resolve", async () => {
		await expect(
			getTemplateContents(makeTemplateApp(), "Templates/missing.md")
		).resolves.toBe("");
		expect(Notice).toHaveBeenCalledTimes(1);
		expect(Notice).toHaveBeenCalledWith(expect.stringContaining("template"));
	});

	it("should return an empty string and show a Notice when reading fails", async () => {
		const app = makeTemplateApp({
			metadataCache: { getFirstLinkpathDest: () => ({ path: "Templates/broken.md" }) },
			vault: { cachedRead: vi.fn().mockRejectedValue(new Error("read failed")) },
		});
		await expect(getTemplateContents(app, "Templates/broken.md")).resolves.toBe("");
		expect(Notice).toHaveBeenCalledTimes(1);
		expect(Notice).toHaveBeenCalledWith(expect.stringContaining("template"));
	});
});
