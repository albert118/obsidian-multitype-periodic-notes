import { Notice, normalizePath as obsidianNormalizePath } from 'obsidian';
import { DEFAULT_FORMATS } from './constants';
import type { NoteTypeConfig } from './types';

/**
 * Minimal shape of a moment instance. The real obsidian `Moment` satisfies it
 * structurally, so token substitution stays pure and testable with an injected
 * stub instead of Obsidian's `window.moment`.
 */
export interface MomentLike {
  format: (format: string) => string;
}

/** Minimal vault surface used by the path helpers (real `App.vault` satisfies it). */
export interface VaultLike {
  getAbstractFileByPath(path: string): unknown;
  createFolder(path: string): Promise<unknown>;
}

/** Minimal app surface used by the path helpers (real `App` satisfies it). */
export interface AppLike {
  vault: VaultLike;
}

/** Minimal metadataCache surface used by getTemplateContents. */
interface TemplateMetadataCacheLike {
  getFirstLinkpathDest(path: string, sourcePath: string): unknown;
}

/** Minimal vault surface used by getTemplateContents. */
interface TemplateVaultLike {
  cachedRead(file: unknown): Promise<string>;
}

/**
 * Minimal app surface used by the template helpers. `plugins` is optional: the
 * real `App` carries `plugins.plugins` at runtime even though the obsidian
 * typings do not declare it, so we feature-detect Templater through a narrow
 * optional member that the real object satisfies structurally.
 */
export interface TemplateAppLike {
  metadataCache: TemplateMetadataCacheLike;
  vault: TemplateVaultLike;
  plugins?: { plugins?: Record<string, unknown> };
}

/**
 * Join path segments with "/" only (posix-safe; never emits "\" on Windows).
 * Edge slashes are trimmed per segment so empty/root folders join cleanly.
 */
function joinPosix(...parts: string[]): string {
  return parts
    .filter(part => part !== '')
    .map(part => part.replace(/^\/+|\/+$/g, ''))
    .filter(part => part !== '')
    .join('/');
}

/**
 * Single path-normalization helper for the note-path pipeline. Mirrors
 * obsidian's documented `normalizePath` (backslash -> "/", collapse duplicate
 * slashes, strip leading/trailing slashes) without importing obsidian, so the
 * path helpers stay Layer-1 testable. getNotePath, ensureFolderExists, and the
 * rendered-path collision guard all flow through this one helper.
 */
function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

/**
 * Resolve the vault-absolute path for a note named `filename` inside `folder`.
 * THE shared path helper: getNotePath and the rendered-path collision guard
 * must both use this so guard and runtime can never disagree.
 */
export function resolveNotePath(folder: string, filename: string): string {
  return normalizePath(joinPosix(folder, `${filename}.md`));
}

/**
 * Ensure every parent folder of `path` exists, creating missing folders via
 * `app.vault.createFolder`. Idempotent: a path that already resolves is skipped.
 */
export async function ensureFolderExists(app: AppLike, path: string): Promise<void> {
  const dirs = path.split('/');
  dirs.pop(); // the final segment is the file name
  let dirPath = '';
  for (const dir of dirs) {
    if (dir === '') continue;
    dirPath = dirPath === '' ? dir : `${dirPath}/${dir}`;
    if (!app.vault.getAbstractFileByPath(dirPath)) {
      await app.vault.createFolder(dirPath);
    }
  }
}

/** Resolve and ensure the folder for a note, returning its vault path. */
export async function getNotePath(
  app: AppLike,
  filename: string,
  type: Pick<NoteTypeConfig, 'folder'>,
): Promise<string> {
  const path = resolveNotePath(type.folder, filename);
  await ensureFolderExists(app, path);
  return path;
}

/**
 * Substitute template tokens. `{{date}}` and `{{title}}` become the already-
 * formatted `filename`; `{{time}}` becomes the injected `date` formatted as
 * "HH:mm" (the injected date, not `window.moment()`, keeps this pure). This is
 * the guaranteed render path — Templater feature-detect never replaces it.
 */
export function applyTemplateTransformations(filename: string, date: MomentLike, templateContents: string): string {
  return templateContents
    .replace(/{{\s*date\s*}}/gi, filename)
    .replace(/{{\s*time\s*}}/gi, date.format('HH:mm'))
    .replace(/{{\s*title\s*}}/gi, filename);
}

/**
 * True when the Templater community plugin is enabled in this vault. Used by
 * renderNoteTemplate to decide whether to best-effort `<% %>` rendering. We
 * only read its presence — never its internals parsing or its data.
 */
export function isTemplaterAvailable(app: TemplateAppLike): boolean {
  return app.plugins?.plugins?.['obsidian-templater'] != null;
}

/**
 * Best-effort render through Templater's API. Templater exposes no stable
 * public render method across versions, so this is strictly a guarded attempt:
 * we only call a shape we recognize, wrap it in try/catch, and accept the result
 * only when Templater actually changed the content (so a partial/failed render —
 * which produces identical or empty output — is discarded). Returns "" when the
 * plugin or the recognized shape is absent, rendering throws, or nothing changed,
 * so the caller always falls back to its own token substitution.
 */
async function renderWithTemplater(app: TemplateAppLike, content: string): Promise<string> {
  if (!isTemplaterAvailable(app)) return '';
  const templater = (
    app.plugins?.plugins?.['obsidian-templater'] as
      { templater?: { parse_template?: (config: unknown, content: string) => Promise<string> } } | undefined
  )?.templater;
  const render = templater?.parse_template;
  if (typeof render !== 'function') return '';
  try {
    const result = await render({}, content);
    if (typeof result === 'string' && result !== '' && result !== content) return result;
    return '';
  } catch {
    return '';
  }
}

/**
 * Produce the final note body. Feature-detects Templater and, when present,
 * best-effort renders `<% %>` blocks through it (see renderWithTemplater), then
 * applies our own `{{date}}/{{time}}/{{title}}` substitution. Template handling
 * never breaks note creation: any absence, missing shape, or thrown render falls
 * back to the guaranteed regex path. (Templater additionally processes `<% %>`
 * itself on file creation via its trigger-on-file-creation hook.)
 */
export async function renderNoteTemplate(
  app: TemplateAppLike,
  filename: string,
  date: MomentLike,
  templateContents: string,
): Promise<string> {
  const templated = await renderWithTemplater(app, templateContents);
  return applyTemplateTransformations(filename, date, templated || templateContents);
}

/**
 * Read a template's contents, or "" when the path is empty/root, the file
 * cannot be resolved, or reading fails (a Notice is shown in those cases).
 */
export async function getTemplateContents(app: TemplateAppLike, templatePath: string): Promise<string> {
  if (templatePath === '' || templatePath === '/') return '';
  const file = app.metadataCache.getFirstLinkpathDest(obsidianNormalizePath(templatePath), '');
  if (!file) {
    new Notice(`Failed to read the template '${templatePath}'`);
    return '';
  }
  try {
    return await app.vault.cachedRead(file);
  } catch {
    new Notice(`Failed to read the template '${templatePath}'`);
    return '';
  }
}

/**
 * Return a Notice message naming two enabled types whose rendered paths
 * collide, or null when every enabled type maps to a distinct path. Uses the
 * same `resolveNotePath` helper as `openNote` so the guard can never disagree
 * with the runtime. Same-folder but different rendered filenames (e.g. daily
 * `YYYY-MM-DD` vs monthly `YYYY-MM`) are correctly allowed.
 */
export function findRenderedPathCollisions(types: NoteTypeConfig[]): string | null {
  const rendered = new Map<string, NoteTypeConfig>();
  for (const type of types) {
    if (!type.enabled) continue;
    const filename = (type.format || DEFAULT_FORMATS[type.granularity]).trim();
    const path = resolveNotePath(type.folder, filename);
    const other = rendered.get(path);
    if (other) {
      return `'${other.name}' and '${type.name}' both resolve to '${path}'. Give them distinct folders or filename formats.`;
    }
    rendered.set(path, type);
  }
  return null;
}
