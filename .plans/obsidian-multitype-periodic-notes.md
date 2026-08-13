# Plan: Obsidian "Periodic Note Types" plugin

## Context / Goal

The user uses Obsidian for personal **and** work notes. The Periodic Notes plugin +
templates generates their personal daily note. They have a separate work note
template. Pain point: Periodic Notes only produces **one** daily/named note, so
personal and work notes can't both follow the canonical daily flow. They currently
hand-create a date-named note and insert the work template via the command palette.

Goal: a plugin that supports an **arbitrary number of periodic note "types"** (work,
personal, journal, …), each independently configurable and independently
command-triggered, working in tandem with the existing Periodic Notes plugin. Adding
a new type in the future must be a **settings operation, not a code change**.

## Why not just use Periodic Notes' Calendar Sets (considered & rejected)

Periodic Notes ships a real **Calendar Sets** feature (named sets, each with
per-granularity `{folder, format, template, enabled}`), present in the `1.0.0`
release (Apr 2022). But it does **not** solve this use case:

- **It is undocumented** — the README/changelog never mention it; the `1.0.0`
  release's `manifest.json` still says `"version": "0.0.17"`. It's a silent,
  half-finished feature.
- **Commands are bound to the ACTIVE set.** `openPeriodicNote` calls
  `calendarSetManager.getActiveConfig(granularity)` and
  `getActiveGranularities()` reads only the active set. "Open today's daily note"
  always hits the active set. There is **no** command that creates notes in
  multiple sets — to get a personal AND a work note you'd flip the active set
  back and forth. Clunkier than the current manual process.

We reuse its **data model** (named sets, per-granularity config) but fix the
**command model**: register commands for **every enabled type**, not just one active
set. That single behavioral change is what unlocks "N types in parallel."

## Repository / location

This worktree is the **PropertyMe monorepo** (manager-app, front-end, etc.) — **not**
an Obsidian project. The plugin is a personal tool and must **not** be rooted here.
This plan is the design; the source lives in the user's OWN repo (ideally a git
repo, consistent with their GH workflow), with a **build-then-copy** test loop into
the vault.

- **Develop in your own repo, NOT inside the vault.** This matches the
  `obsidian-sample-plugin` docs: "Clone your repo to a local development folder"
  (vault placement is only an _optional convenience_, not the requirement), and the
  documented install is **"Copy over `main.js`, `styles.css`, `manifest.json` to
  your vault `VaultFolder/.obsidian/plugins/your-plugin-id/`."**
- **Critical for this user:** the vault is a **git-synced repo** (shared GitHub repo,
  GH PAT already exists). Developing inside `<vault>/.obsidian/plugins/…` would drag
  plugin `src/`, `tests/`, and `node_modules/` into the notes repo's git history —
  polluting it. Keeping source in a separate repo keeps plugin dev cleanly out of
  the notes vault.
- **Test loop:** `npm run dev` (watch → `main.js`) in the dev repo → **copy**
  `main.js`, `manifest.json`, `styles.css` into `<vault>/.obsidian/plugins/
periodic-types/` → Obsidian "Reload plugin without saving" (or toggle) picks it
  up. A small `copy` npm script (esbuild `onEnd` or a `Copy-Item` step) automates
  the copy so the watch loop stays one-command. Plain `Copy-Item` works across
  drives/volume and needs no admin — **no junction/symlink required**.
- **What the vault must track:** only the tiny built plugin folder
  `.obsidian/plugins/periodic-types/` (`main.js`, `manifest.json`, `styles.css`,
  `data.json` runtime config) — which is normal vault config. Plugin source,
  tests, and `node_modules/` stay in the dev repo, never in the notes repo.
  (`%APPDATA%\obsidian` is the _app_ config dir, not where vaults live; vaults are
  user-chosen folders.)

**Tooling (verified vs `obsidianmd/obsidian-sample-plugin` master):** Node **20 LTS
minimum** (22 fine); npm bundled with it. TypeScript `^5.8.3`, esbuild `0.25.5`
(pinned by the sample), `obsidian` `latest` (dev dep, not bundled), vitest `2.x`
(added). Pin an `.nvmrc` (`20`) and `"engines": { "node": ">=20" }` in `package.json`
so a stale Node fails fast. **Note: the sample's `devDependencies` do NOT include
`tslib`** — drop it; add nothing unless runtime helpers are imported (not needed in
v1).

> **Stage 0 — Dev-env bootstrap (prove the environment BEFORE writing feature
> code):** see the dedicated section below. Do not write `configureCommands`, the
> registry UI, or note-creation logic until the four green-light criteria in that
> section all pass.

## Architecture

Standalone plugin (no coupling to Periodic Notes; works even if PN is disabled).
Model the note-creation helpers on `liamcain/obsidian-periodic-notes` (MIT).
Proposed layout:

```
periodic-types/
├── manifest.json            # id "periodic-types", name, version, minAppVersion, isDesktopOnly: false
├── package.json             # esbuild + typescript + obsidian (dev); engines.node >= 20
├── esbuild.config.mjs        # standard sample-plugin bundle → main.js (external: obsidian, electron, codemirror…)
├── tsconfig.json
├── vitest.config.ts         # node env, include tests/**/*.spec.ts
├── versions.json            # stub { "0.0.1": "1.7.2" } — publish decision pending
└── src/
    ├── main.ts              # PeriodicTypesPlugin extends Plugin; command generation
    ├── types.ts             # NoteTypeConfig, PluginSettings interfaces
    ├── constants.ts         # DEFAULT_FORMATS per granularity
    ├── settings.ts          # NoteTypeSettingTab (type registry UI)
    └── utils.ts             # getTemplateContents, applyTemplateTransformations,
                             #   getNotePath, ensureFolderExists (model on Periodic Notes)
```

### Core data model

**src/types.ts**

```ts
export type Granularity = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface NoteTypeConfig {
  id: string; // "work", "personal", "journal", ... unique
  name: string; // "Work" (human-facing, used in command/labels)
  enabled: boolean;
  granularity: Granularity; // "day" for now; future-proof for week/month/etc.
  folder: string; // "Work"
  format: string; // "YYYY-MM-DD"  → filename
  templatePath: string; // "Templates/work.md"
  openAtStartup: boolean;
  // future: color, ribbon icon, extra frontmatter
}

export interface PluginSettings {
  types: NoteTypeConfig[];
}
```

**src/constants.ts** — defaults per granularity (mirror Periodic Notes):

```ts
export const DEFAULT_FORMATS: Record<Granularity, string> = Object.freeze({
  day: 'YYYY-MM-DD',
  week: 'gggg-[W]ww',
  month: 'YYYY-MM',
  quarter: 'YYYY-[Q]Q',
  year: 'YYYY',
});

export const DEFAULT_NOTE_TYPE: Omit<NoteTypeConfig, 'id' | 'name'> = Object.freeze({
  enabled: true,
  granularity: 'day',
  folder: '',
  format: '', // falls back to DEFAULT_FORMATS[granularity]
  templatePath: '',
  openAtStartup: false,
});

/** Id must be command/hotkey/frontmatter-safe. Not user-editable once set. */
export const NOTE_TYPE_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function slug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
```

> **Correction (Stage 1):** the regex is `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` (word-joined-by-single-dashes), **not** `/^[a-z0-9][a-z0-9-]*$/`. The latter accepted a trailing dash (`-` is in the second char class), contradicting the test floor that `trail-` is rejected. The corrected form rejects leading/trailing/double dashes and uppercase while matching every `slug()` output. Plan and code are now consistent.

**Decided:** all five granularities are supported now (`day|week|month|quarter|year`).
No schema change needed later; the `DEFAULT_FORMATS` table already covers every
granularity, so a weekly/monthly/etc. type is fully expressible from day one.

**Id discipline:** `id` is derived once at Add via `slug(name)` and validated against
`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`; empty/duplicate slugs are rejected with a `Notice`. `id` is
**not** user-editable after creation — only `name` is. This keeps command ids, their
**labels** (`Open today's ${id} note`), hotkey keys (`${pluginId}:${commandId}`), and
frontmatter `type:` stable across renames, and prevents `/`, `:`, spaces, or uppercase
in ids from producing ambiguous command ids or breaking the hotkey separator.

````

### utils.ts — the three MIT helpers (from Periodic Notes `src/utils.ts`)

- `getTemplateContents(app, templatePath)`:
  `metadataCache.getFirstLinkpathDest(normalizePath(templatePath), "")` →
  `vault.cachedRead(file)`; return `""` on error (Notice on failure).
  `templatePath === ""`/`"/"` → `""`.
- `applyTemplateTransformations(filename, date /*: Moment*/, templateContents)`:
  ```ts
  .replace(/{{\s*date\s*}}/gi, filename)
  .replace(/{{\s*time\s*}}/gi, window.moment().format("HH:mm"))
  .replace(/{{\s*title\s*}}/gi, filename)
````

Note: `{{date}}` becomes the already-formatted **filename**, matching PN behavior.

- `getNotePath(app, filename, type)`:
  `normalizePath(join(type.folder, filename + ".md"))`, then `ensureFolderExists`.
- `ensureFolderExists(app, path)`: walk dirs (split "/", drop basename), create each
  missing `TFolder` via `app.vault.createFolder`.

### main.ts — plugin class + command lifecycle

```ts
export default class PeriodicTypesPlugin extends Plugin {
  settings: PluginSettings;
  /** exactly the command ids (without plugin prefix) we have registered */
  registeredCommandIds: Set<string> = new Set();

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new NoteTypeSettingTab(this.app, this));
    this.configureCommands(); // OLD → remove diff, then add current (see below)
    if (this.settings.types.some(t => t.openAtStartup)) {
      this.registerEvent(
        this.app.workspace.on('layout-ready', () => {
          for (const t of this.settings.types) if (t.enabled && t.openAtStartup) this.openNote(t, window.moment());
        }),
      );
    }
  }
  onunload() {}

  /**
   * Command lifecycle: do NOT rely on addCommand idempotency/overwrite — unverified
   * and load-bearing (an earlier critical bug was orphaned commands). Only addCommand
   * ids NOT already registered; removeCommand (via the diff below) ids no longer
   * desired. Mirror Periodic Notes' approach (removeCommand for disabled granularities).
   * Cancellation-free and avoids re-creating hotkey bindings on every save.
   */
  configureCommands() {
    const desired = new Set<string>();
    for (const t of this.settings.types) {
      if (!t.enabled) continue;
      desired.add(`open-today-${t.id}-note`);
    }
    // remove ids that are no longer desired
    for (const id of this.registeredCommandIds)
      if (!desired.has(id)) this.app.commands.removeCommand(`periodic-types:${id}`);
    // add only ids that are new or re-enabled (not already registered)
    for (const t of this.settings.types) {
      if (!t.enabled) continue;
      const id = `open-today-${t.id}-note`;
      if (this.registeredCommandIds.has(id)) continue;
      this.addCommand({
        id,
        name: `Open today's ${t.id} note`, // label derives from the immutable id
        callback: async () => this.openNote(t, window.moment()),
      });
    }
    const PICKER = `open-periodic-picker`;
    if (!this.registeredCommandIds.has(PICKER)) {
      this.addCommand({
        id: PICKER,
        name: `Open periodic note…`,
        callback: async () => new NotePickerModal(this.app, this).open(),
      });
    }
    // desired includes the picker so it is never removed; per-type ids tracked exactly
    desired.add(PICKER);
    this.registeredCommandIds = desired;
  }

  offset(type, delta) {
    return window.moment().add(delta, type.granularity);
  }

  async openNote(type: NoteTypeConfig, date: Moment): Promise<void> {
    const filename = date.format(type.format || DEFAULT_FORMATS[type.granularity]);
    const path = getNotePath(this.app, filename, type);
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!file) {
      file = await this.createNote(type, date, filename, path);
      // createNote may have raced and failed-as-already-exists → re-fetch
      if (!file) file = this.app.vault.getAbstractFileByPath(path);
    }
    // Guard against a FOLDER occupying the path; open existing tab if already shown.
    if (!(file instanceof TFile)) return;
    // Stamp-if-missing: a pre-existing (e.g. hand-made) note at the type's exact
    // path is treated as this type's note — ensures `type:` is always present so
    // Dataview queries and future prune are reliable even for non-plugin-created files.
    await stampFrontmatterIfMissing(this.app, file, { type: type.id, date: filename });
    const existing = this.app.workspace.getLeavesOfType('markdown').find(l => l.getView()?.file?.path === file.path);
    if (existing) {
      this.app.workspace.setActiveLeaf(existing);
      return;
    }
    this.app.workspace.getLeaf(false).openFile(file);
  }
  async createNote(type, date, filename, destPath): Promise<TFile | null> {
    const raw = await getTemplateContents(this.app, type.templatePath);
    const body = applyTemplateTransformations(filename, date, raw);
    try {
      const file = await this.app.vault.create(destPath, body); // NOT createNewMarkdownFile
      await this.app.fileManager.processFrontMatter(file, fm => {
        fm.type = type.id; // per-type queryability (Dataview)
        fm.date = filename;
      });
      return file;
    } catch (e) {
      // "already exists" from a concurrent openAtStartup/hotkey → return null; caller re-fetches
      return null;
    }
  }
}
```

**Stamping (decided: stamp-if-missing — resolved).** A note at a type's exact
rendered path is treated as that type's note even if the plugin didn't create it.
`stampFrontmatterIfMissing(app, file, {type, date})` uses
`app.fileManager.processFrontMatter` to write `type`/`date` **only if `type` is
absent** (idempotent — reopens never rewrite an existing value). This guarantees
`type: <id>` is present on every note the plugin opens, so per-type Dataview
queries and the future prune (frontmatter-gated) are reliable regardless of how the
file came to be. Hand-made notes at a type's path are deliberately claimed by that
type; notes elsewhere are never touched.

**Command lifecycle (resolves the pre-existing uncertainty — now specified, not guessed):**
`registerCommands()` replaced with `configureCommands()` that diffs a
`registeredCommandIds: Set<string>` of what it last added against the desired set,
and calls `app.commands.removeCommand("periodic-types:" + id)` for ids no longer
wanted before adding the current set. This is exactly how Periodic Notes cleans up
disabled granularities (`app.commands.removeCommand` in its `configureCommands`).
Deleting/renaming/disabling a type therefore reliably removes its palette commands
and dissolves stale hotkeys instead of trusting `addCommand` idempotency. Both the
command **id and its label** derive from the type `id` (`Open today's ${id} note`),
not its display `name` — so renaming a type's `name` changes nothing about the
command (id, label, hotkey all stay put), by design.

**`openNote` guardrails:** `openNote` is guaranteed **non-rejecting** (command
callback, layout-ready, and picker all fire-and-forget via `void`). Every failure
goes through one of four kinds (`folder`/`create`/`stamp`/`open`) surfaced by
`handleNoteError` → `console.error` + a user-facing `Notice`. Specifically:
(a) filename/`getNotePath` (folder creation) is wrapped → `folder`; (b) `createNote`
only lets the `already exists` race through as `null` (caller re-fetches) — any
other `vault.create` throw is re-thrown into `openNote`, which re-checks the path
for a race winner, else surfaces `create`; (c) the fresh-note frontmatter stamp in
`createNote` is in its own silent catch (the file exists but is unstamped —
`openNote`'s own stamp then surfaces **one** `stamp` Notice and still opens);
(d) `instanceof TFile` guard so a folder at the computed path is rejected with a
short Notice (upgraded from a silent no-op); (e) `processFrontMatter` on the opened
note is wrapped → `stamp`, but the note still opens; (f) the already-open-leaf
lookup + `setActiveLeaf`/`getLeaf(false).openFile` are wrapped → `open`.

**`openAtStartup` gating:** startup-open fires inside `app.workspace.on("layout-ready")`,
so it runs on a real app launch, not on plugin reload/disable-toggle (which also
fires `onload`). Avoids popping every type whenever you toggle the dev plugin.

### settings.ts — the type registry UI

`NoteTypeSettingTab extends PluginSettingTab` renders **one block per type**:

- name (text), folder (text), format (`.addMomentFormat` — native live sample),
  template path (text, resolved via link semantics), granularity (dropdown),
  enabled (toggle), openAtStartup (toggle).
- Per-type **Delete** button.
- A trailing **"Add note type"** button appending a new
  `{...DEFAULT_NOTE_TYPE, id: slug(name), name}`.
- On any change: `saveSettings()`, then `plugin.configureCommands()`. (Settings are
  persisted to `.obsidian/plugins/periodic-types/data.json` via `saveData`.)
- **Collision validation** on save — normalized. Compute each enabled type's
  target path as `normalizePath(join(normalizePath(folder), (format||default).trim() + ".md"))`;
  no two enabled types may produce the **same rendered path** (this catches
  `Work` vs `Work/`, trailing-space formats, and same-folder same-rendered-name
  across granularities like a daily `YYYY-MM` vs a monthly `YYYY-MM`). Block with a
  `Notice` naming the offenders. (Same-folder but _different_ rendered names, e.g.
  daily `YYYY-MM-DD` vs monthly `YYYY-MM`, are correctly allowed — filenames don't
  collide because the rendered formats differ.)
- **Use ONE path-normalization helper everywhere.** The guard and `openNote`'s
  `getNotePath` must share the same `normalizePath(join(...))` pipeline, and every
  join output must pass through `normalizePath` (older path.join emits `\` on
  Windows; normalizePath emits `/`). A mismatch between guard and runtime would
  let two colliding types slip through or false-positive.
- **PN-coexistence note (NOT internals parsing):** do NOT read Periodic Notes'
  `data.json` (legacy + Calendar Sets shapes) to detect overlap — fragile if PN
  changes shape, near-zero value for a single user who knows their own config.
  Replace with: a static README note ("keep a type's folder distinct from your
  Periodic Notes daily folder") plus, optionally, a one-time non-blocking `Notice`
  on first enable advising the same. Keep the rendered-path collision guard among
  our own types — that one is essential.
- Duplicate `id` guard on Add (slug collision → append counter).

### manifest.json

```json
{
  "id": "periodic-types",
  "name": "Periodic note types",
  "version": "0.0.1",
  "minAppVersion": "1.7.2",
  "description": "Generate multiple independently-configurable periodic notes (work, personal, journal, ...) alongside Periodic Notes.",
  "author": "",
  "isDesktopOnly": false
}
```

Plugin folder must be named to match `id`.

## Registration model / extensibility

- **Adding a type** = click "Add note type", fill name/folder/template → new
  commands appear (after `configureCommands()`; no app reload).
- **Removing/renaming** — delete button / editable `name` (id immutable); re-runs
  `configureCommands()` so stale commands are removed via `removeCommand`.
- **Granularity** is part of the type, so a future weekly or monthly type is
  already expressible (format defaults exist per granularity) with no schema change.

## Seed behavior (empty registry is invalid)

**Empty is invalid by design.** On `onload`, if `this.settings.types` is empty,
seed exactly one type (`id: "work"`, `name: "Work"`, `folder: "Work"`, day
granularity, no template, `openAtStartup` off). Because the seed runs whenever
`types.length === 0`, it covers not only the true first run (no data.json) but a
stale/empty data.json and a delete-all reset whose save raced — all recover to
the same seeded state. **No version marker needed.**

Deleting the last type resets **immediately** (not only on reload): the delete
handler runs the empty list through `ensureNonEmptyTypes`, which returns the seed,
and shows a "reset to the default 'work' type" Notice.

```ts
{
  id: "work", name: "Work", enabled: true, granularity: "day",
  folder: "Work", format: "",         // → defaults to "YYYY-MM-DD"
  templatePath: "",                   // no template until user sets it
  openAtStartup: false,
}
```

- **`templatePath: ""` is a valid state, not an error** — the note is created with
  an empty body. `getTemplateContents` already returns `""` for empty/"", so no
  special-casing needed.
- If a **user-set** `templatePath` doesn't resolve via `getFirstLinkpathDest`,
  show a `Notice` at creation time and create the note with an empty body — never
  block note creation because a template is missing; that would strand the user with
  no note at all. The seed itself ships with no template.

## Command-palette sizing (decided: lean)

Reviewed and settled — **one "Open today's X note" command per enabled type**
(hotkey-bindable, the case users want one-keystroke) **plus a single global
`Open periodic note…` command** using a `SuggestModal`: pick type → pick
period (today/next/prev). Rationale: next/prev is rare navigation, rarely
hotkeyed, and 2×N palette entries for it is pure noise. This halves the palette
versus the 3×N original while keeping the common "today" case ergonomic.
Consequence: the per-type next/prev `addCommand`s are dropped from
`configureCommands()` (the picker covers them); `desired` set becomes just
`open-today-{id}-note` per enabled type plus the single global picker command.

## Coexistence / collision strategy

- Distinct folder per type by default → no collision with Periodic Notes' personal
  daily even if both use `YYYY-MM-DD`.
- Rendered-path collision guard among our own types (normalized, shared path
  helper; see settings).
- PN-coexistence via README note + optional first-enable `Notice`, NOT internals
  parsing (see settings).
- Own command ids (`open-today-{id}-note` + global `open-periodic-picker`), own
  plugin id, own `data.json`. No default hotkeys.
- Neither plugin auto-creates on day-change (creation is command-triggered), so no
  midnight race. `openAtStartup` per type is independent and layout-ready gated.

## Optional enhancements (defer / nice-to-have)

- **Templater support**: feature-detect `app.plugins.plugins["obsidian-templater"]`
  and call its render API if present, else fall back to the regex approach.
- Do **not** use `internalPlugins.getPluginById("templates")` for rendering — it
  exposes no clean programmatic render API; Periodic Notes avoids it and so do we.
- Per-type ribbon icon / color.

## Future improvements (logged, NOT in current scope)

**Self-maintaining notes (auto-create + prune).** Auto-create (externally
scheduled/triggered + `openAtStartup` catch-up — **not** an in-plugin poll; see the
scheduled auto-create bullet below) and prune are one lifecycle feature: create
`today`'s note when missing, delete notes past retention — keeping the vault
bounded with zero admin. Both share the same idempotent **"create if missing /
prune expired"** core that the current scope already builds (`openNote`'s
create-if-missing IS the idempotency both need). Key interaction points to design
for when built (do NOT block current work):

- **Prune safety depends entirely on the `type:` frontmatter stamp.** Only delete
  notes carrying `type: <our-id>` (never a blind "older than X in folder" sweep —
  it would touch unrelated notes and Period Notes' personal notes). Therefore the
  current scope's `type:` stamping must stay **mandatory**, not optional. And on the
  `processFrontMatter`-on-pre-existing open question, prefer **stamp-if-missing on
  open** so a hand-made note at a type's exact path is, and is treated as, that note.
- **Prune must never delete date >= today's** — otherwise auto-create and prune fight
  (a scheduling slip deletes the just-created note). An explicit "skip date >= now"
  guard in prune.
- **Retention must exceed the creation period** per type (`retention > period`, or
  "keep last N ≥ 1"), validated in the same on-save slot as the collision guard.
- **Retention semantics are granularity-aware** — age-based (`retention?: number` days)
  or count-based ("keep last N"); per contextual note type since granularity is per-type.
- **Both rely on the date being extractable from the filename** — prune's age =
  today − filename-date. A future guard should refuse `retention` on a type whose
  `format` embeds no date.
- **"Reduced admin" posture** = `openAtStartup` (create on next open if overdue —
  covers "app was closed at fire time") + optional scheduled poll (covers "app open
  across the boundary") + retention prune on load. All funnel through the same
  safe create-if-missing / prune-expired core, so they compose without double-create.

- **Prune command (specific)** — per-type retention (`retention?: number` days or
  "keep last N") plus a `prune-notes` command. When built: only notes with
  `type: <id>` frontmatter; move to _trash_ (`app.vault.trash(file, false)` →
  `.trash/`, or `true` → system trash), never `vault.delete`; confirm via `Notice`
  before deleting. Fits the on-demand command model (no scheduling dependency).
- **Scheduled auto-create (specific) — [REVISED] external trigger, not polling.**
  Polling was rejected: the app is not guaranteed running/hovered, instances are
  distributed (mobile, desktop), a perpetual interval drains mobile battery, and a
  poll that almost never fires is pure waste. The idempotent core (`ensureCurrent`)
  is retained; **the trigger source moves out of the plugin into an external
  scheduler / server hook.**

  **Config** stays per-type: `schedule?: { time?: string /*"HH:mm"*/; days?:
number[]; enabled?: boolean }`.

  **One primitive (unchanged, the idempotency invariant):** `ensureCurrent(type,
now)` — compute the current period for `type.granularity`, derive the note path,
  and if the file **does not exist** and the make-ready gate passes, create it. The
  **file-existence check IS the idempotency** — shared by every trigger (external
  hook, `openAtStartup` catch-up, manual "Open today"), so no source can double-
  create. This primitive is exposed as a **named, invocable command**
  (`ensure-{type-id}-note`, "Ensure today's {name} note exists") so an external
  caller can fire it (see below) — it is the plugin's external API surface.

  **External trigger options** (someone callable from cron / a server / an OS
  scheduler / a Shortcut — not the plugin polling):
  1. **Native `obsidian://` URI + plugin `registerObsidianUriHandler`.** Obsidian
     ships the `obsidian://` scheme (`open`/`new`/`search`). A plugin registers a
     custom handler for a URI like
     `obsidian://periodic-types?action=ensure&type=work`, which maps onto
     `ensureCurrent("work", window.moment())`. An external scheduler launches the
     URI (desktop `open`/`start`, mobile Shortcut/Tasker). When Obsidian is open it
     is handled in-app; when closed, the OS **cold-launches** Obsidian with the URI
     (best-effort, desktop-strong). No extra plugin dependency; it is the plugin's
     own URI surface.
  2. **Local REST API (community plugin, coddingtonbear/obsidian-local-rest-api).**
     Runs an HTTP server on :27124 with bearer auth. Provides exactly this:
     **`POST /commands/{commandId}/`** executes any registered Obsidian command
     (incl. our `ensure-{type-id}-note`), plus `/vault/{path}` CRUD, `/open/{path}`,
     and an MCP endpoint. An external server/cron does
     `curl -X POST /commands/periodic-types:ensure-work-note/`. This is the closest
     thing to a general "hook Obsidian from outside" — the de-facto community
     standard for server→Obsidian automation. Caveat: requires the Local REST API
     plugin installed, and its HTTP server only runs while Obsidian is open.

  **The hard constraint (same for BOTH — be direct):** there is **no official
  Obsidian cloud/daemon API** and no headless mode. Obsidian is local-first; the
  app must be **running** (or OS-cold-launchable via the URI scheme) **on the
  target device** for any hook to create a note. The URI handler gives the
  strongest cold-launch story on desktop; the REST API is richer while running.
  Neither can reach a device whose Obsidian is fully closed and not launchable.

  **Unification with `openAtStartup` (still the future-proofing insight):**
  `openAtStartup` (`layout-ready` catch-up) is the backstop for "app was closed at
  fire time" — on next launch, `ensureCurrent` creates the missing note. The
  external hook is the prompt for "app is open / just launched with the URI." They
  are the same existence-checked primitive fired from different sources, so the
  two compose with zero duplication.

  **Implement as a `NoteTrigger` module (small, not in `main.ts`):**
  - Registers `registerObsidianUriHandler` parsing `action=ensure&type=<id>` →
    `ensureCurrent(type, window.moment())` (native path, no plugin dep).
  - Exposes `ensure-{type-id}-note` commands (idempotent, invocable by Local REST
    API's `/commands/` or by URI).
  - **NO `registerInterval` polling at all** — no timer, no battery cost, no
    perpetual overhead. The scheduler responsibility is delegated to the external
    cron/server/Shortcut.
  - `isDueForPeriod`/due-gate stays a **pure, testable** function (Layer 1 with an
    injected clock) so the "make-ready" logic is unit-tested regardless of trigger.

  **Distributed instances:** an external scheduler may target multiple devices
  (one per vault/instance). Each device that is running/hovered handles its own
  hook; devices that are off rely on their next `openAtStartup`. The plugin itself
  stays single-instance and stateless — distribution is orchestrated by the
  external scheduler, not by the plugin.

  **Server-side always-on instance (desirable long-run infra — considered, not
  committed):** to eliminate the "app not running at fire time" gap for an
  authoritative node, host a **permanent, non-headless Obsidian instance** on a
  server (Xvfb/virtual X or a desktop + VNC/noVNC; or a Docker image bundling
  Xvfb+noVNC). One always-up instance means no cold-launch uncertainty on that
  node.

  **LOCKED — server delivery model (direct shim, no logic in it, keep minimal):**
  - A **local delivery shim** maps inbound HTTP requests → the `obsidian://`
    proto, because `obsidian://` URIs are delivered by the _local OS_ — a remote
    caller cannot POST a `obsidian://` URI over HTTP. The shim is **expected and
    valid infra**: a ~10-line local HTTP endpoint (or systemd socket) that, on a
    hit for `action=ensure&type=<id>`, runs
    `open "obsidian://periodic-types?action=ensure&type=work"` _on the server_, and
    nothing else. **No business logic in the shim** — it is a dumb HTTP→URI
    translator. The plugin still handles the URI via `registerObsidianUriHandler`
    → `ensureCurrent`. (Local REST API is the only-alternative trigger; not
    required given the shim.)
  - **Scheduling is a server-side concern** (cron/systemd timer, or an upstream
    scheduler) — it owns _when_ to fire and calls the shim; neither the shim nor
    the plugin holds the schedule.
  - **Vault sync is already a known, solved concern:** devices already align notes
    via a **shared Git(Hub) repo** (partly manual). A **GH PAT already exists** for
    this. Corollary: server-created notes flow to devices through that same git
    sync — no new sync infra needed; the server instance's vault is a checkout of
    the shared repo, kept current (pull before/after create, or the repo is the
    source of truth and Obsidian watches it).
  - **Dual-writes are a problem in theory but not in practice — LOCKED operating
    model:** the **server creates** (its node runs `ensureCurrent` → creates the
    file); **clients sync, then read the existing file and write TO it — never
    create it.** Clients do not run creation for a server-scheduled type, so there
    is a single creator (server) and multiple writers-on-existing (clients). This
    removes creation collisions. (Plugin's `openAtStartup` for a server-scheduled
    type should therefore be **disabled**, so the server is the sole creator.)

  **Plugin still useful standalone — important note.** Even with the server
  scheduled path, the plugin is **independently valuable**: it provides the
  per-type registry, template/daily-note creation on demand ("Open today's…" /
  picker), `type:` stamping, and pruning — all useful with **no** scheduling or
  server. Server scheduling is an additive trigger on top of a plugin that stands
  alone for non-scheduled use (personal device, travelling, ad-hoc).
  Licensing note: running Obsidian as server/infra is unsupported-but-common in
  the community; fine for personal use, re-check if it ever becomes team infra.

  **Granularity-aware due-logic (unchanged):** a `day` note is due starting
  midnight (gated by `time`/`days` if set); a `week` note once its ISO week has
  begun; etc. `days`/`time` are optional refinements, not required for due-
  computation.

  **Hard platform limit (unchanged):** Obsidian is local-first with no
  daemon/headless/cloud API. Any hook (URI or REST) requires the app **running**
  (or OS-cold-launchable) **on the target device** — unless an always-on server
  instance (above) provides the authoritative running node. The always-on server
  instance + local delivery shim is the mechanism that removes the
  fire-at-exact-time limitation on the authoritative node; arbitrary mobile/
  desktop devices remain best-effort (their next `openAtStartup` or a server-
  created note already synced to them).

## Key risks / open questions for the implementer

Resolved during review: seed (`work`, `Work/`, no template, day granularity),
granularities (all five), command lifecycle (`configureCommands` add-only-new +
`removeCommand`), id discipline (slug, immutable, `/^[a-z0-9][a-z0-9-]*$/`),
collision guard (normalized rendered path, shared path helper), PN-coexistence
(README note not internals parse), and the lean command model (per-type today +
global picker).

Remaining for kickoff:

1. Template tokens: only `{{date}}/{{time}}/{{title}}`, or full Templater/core
   Templates syntax? Templater → feature-detect path.
2. Template path storage: absolute vault path vs note-link — mirror
   `getFirstLinkpathDest` semantics so both resolve.
3. `openAtStartup` day-boundary + **enable-after-boot**: `layout-ready` fires on
   cold start but NOT if the plugin is disabled at boot and enabled later — in that
   session `openAtStartup` silently never triggers. Document this (or add a
   fallback check on enable). Review-recommended: auto-open only if today's missing.
4. **`processFrontMatter` on pre-existing notes:** `openNote` re-fetches and opens
   an existing note without stamping `type:`. If a hand-made note sits at
   `Work/<today>.md`, Dataview `type:` queries miss it. Decide: stamp-if-missing on
   open (idempotent) or document that only plugin-created notes carry `type:`.
5. **`moment` in vitest — RESOLVED (Stage 2).** `{{time}}` uses the **injected
   `date`** (`date.format("HH:mm")`), not `window.moment()` — making
   `applyTemplateTransformations` pure/testable. `Moment` is typed as a thin
   structural `MomentLike { format(f): string }`. Note-paths use one shared
   `resolveNotePath(folder, filename)` helper (reused by Stage 5's collision
   guard). Was: `window.moment()` (Obsidian-bundled; not
   present in vitest). For offset/edge-case tests (Jan 31 → Feb 28, ISO-week year
   boundaries), either add `moment` as a dev dep matching Obsidian's bundled
   version, or test against a thin Moment-shaped interface. Decide before Stage 1
   to avoid rework. Token-substitution tests use a stub date/format rather than
   real `moment`, per the mock-at-boundary guideline.
6. Command id vs other plugins: scoped by plugin id, so only human-facing
   name/hotkey collisions matter; plugin id `periodic-types` should be checked
   against the community registry.

## Stage 0 — Dev-env bootstrap (prove the environment BEFORE feature code)

Sequenced so every step has a verifiable checkpoint; do not write
`configureCommands`, the registry UI, or note-creation logic until all four
green-light criteria pass.

**Tooling:** Node ≥ 20 LTS, npm (bundled), TS `^5.8.3`, esbuild `0.25.5`, obsidian
`latest` dev dep, vitest `2.x` (added). Scaffold from `obsidianmd/obsidian-sample-plugin`
(clone, delete `.git`, strip demo `main.ts`, edit `manifest.json`/`package.json`) —
do NOT hand-roll esbuild config; its `external` list (`obsidian`, `electron`,
codemirror/lezer, builtinModules) is easy to get wrong by hand.

**Where:** primary = inside the vault at `<vault>/.obsidian/plugins/periodic-types/`
(invisible: `node_modules/`, `src/`, `tests/`, `tsconfig.json`). Fallback = external
repo + NTFS directory junction. See Repository/location.

**Checklist:**

1. `node -v` ≥ 20 — else install Node 20 LTS first. _Checkpoint: prints v20+._
2. Create plugin folder (primary or fallback location). _Checkpoint: exists, empty._
3. Scaffold from sample-plugin (clone, Copy-Item, remove `_tmp`/`.git`).
   _Checkpoint: package.json, manifest.json, tsconfig.json, esbuild.config.mjs,
   version-bump.mjs, eslint config present._
4. Edit `manifest.json`: `id "periodic-types"`, `name "Periodic note types"`,
   `version "0.0.1"`, `minAppVersion "1.7.2"`, `isDesktopOnly false`, `author ""`.
   Folder must match `id` exactly. _Checkpoint: valid JSON._
5. Edit `package.json`: name `periodic-types`, `"engines": { "node": ">=20" }`.
   _Checkpoint: valid JSON._
6. Create `versions.json` stub `{ "0.0.1": "1.7.2" }` (keep or drop `version` npm
   script per publish decision). _Checkpoint: file exists._
7. Replace `src/main.ts` with a **stub** (no-op, just proves load):
   `onload() { new Notice("periodic-types: env ok"); }`. _Checkpoint: compiles._
8. `npm install`. _Checkpoint: node_modules populated; `npm ls esbuild typescript`._
9. `npm i -D vitest`; add scripts `test`/`test:watch`; create `vitest.config.ts`
   (node env, `tests/**/*.spec.ts`). _Checkpoint: `npm test` runs, 0 tests, no error._
10. Throwaway harness test `tests/smoke.spec.ts` (a `2+2` asserts vitest runs) **and
    a tiny `add` stub in `src/utils.ts`** (proves the src→test import path +
    tsconfig). _Checkpoint: `npm test` → 2 passed._
11. `npm run build` (tsc -noEmit && esbuild). _Checkpoint: non-empty `main.js` in
    plugin root, tsc exits 0._
12. Scratch-vault load: open an empty vault, enable community plugins, enable
    "Periodic note types". _Checkpoint: `Notice("periodic-types: env ok")` toast +
    `periodic-types onload` in console; plugin shows enabled._
13. Disable→enable cycle. _Checkpoint: Notice re-fires each enable; no console
    errors._
14. (Optional) `npm run dev` watch + "Reload plugin without saving" → edit stub →
    new Notice text appears. _Checkpoint: dev loop proven before feature code._

**Green light — "environment is initialized and testable" = ALL four:**

1. Node ≥ 20; `npm install` clean in the plugin folder.
2. `npm run build` exits 0, non-empty `main.js` in the plugin folder.
3. `npm test` exits 0 with harness tests passing.
4. Scratch vault enables "Periodic note types"; stub Notice fires; disable→enable
   re-fires with no console errors.

## Recommended implementation sequence (stages with checkpoints)

Stages 1–2 are pure logic (no Obsidian runtime) and fully test-driven. Stage 3 is
the first API touch — the right place to prove the dev loop end-to-end with real
code (not the stub).

- **Stage 0 — Dev-env bootstrap** (section above). Checkpoint: all four green-light
  criteria.
- **Stage 1 — Pure logic: `types.ts` + `constants.ts`.** `slug`, `NOTE_TYPE_ID_RE`,
  `DEFAULT_FORMATS`, `DEFAULT_NOTE_TYPE`. Vitest: slug normalization, id
  accept/reject, duplicate-slug counter. Checkpoint: `npm test` green, no Obsidian
  dep.
- **Stage 2 — `utils.ts` (three MIT helpers).** `getTemplateContents`,
  `applyTemplateTransformations`, `getNotePath`, `ensureFolderExists`. Vitest:
  token substitution, path normalization (`Work` vs `Work/`, trailing spaces),
  folder-walk with a mocked `app.vault`. Checkpoint: `npm test` green.
- **Stage 3 — `main.ts` minimal, no settings UI.** Seed `work`, one
  `addCommand`, `openNote`/`createNote` with race re-fetch + `TFile` guard.
  Manual: "Open today's Work note" → `Work/<today>.md` with `type: work`; re-run
  opens existing tab; folder-at-path no-ops. Checkpoint: manual tests 1–3, 11–12.
- **Stage 4 — `configureCommands` diff + `settings.ts` registry UI.** Add/remove/
  disable/rename. Manual: tests 5–9; orphaned-command bug demonstrably gone.
- **Stage 5 — Collision guard + picker modal + `openAtStartup` layout-ready.**
  Manual: tests 4, 6, 10.
- **Stage 6 — Remaining polish:** PN-coexistence README note / first-enable Notice,
  `processFrontMatter` stamp-if-missing decision, Templater feature-detect (if
  kept).

## Test strategy

Automated suites (vitest, no Obsidian runtime) plus a manual acceptance pass in a
scratch vault. Conventions follow the repo's unit-testing guidelines for
TypeScript/Vue: files end `.spec.ts`, test names read `should <result> when
<condition>`, test data via factories/builders, mocks at module boundaries and
only what a test needs, no shared mock state across tests. Structure
Arrange–Act–Assert without AAA comments; cover invalid input and failure paths,
not just happy paths.

### Scope split

- **Unit (Layer 1)** — pure functions that need no Obsidian API: `slug`,
  `NOTE_TYPE_ID_RE`, `DEFAULT_FORMATS`, `DEFAULT_NOTE_TYPE`, and the string
  logic in `utils.ts` (`applyTemplateTransformations`, and path/build helpers
  where the vault is passed in as a thin interface).
- **Integration (Layer 2)** — the plugin's behavior against a **mocked `obsidian`
  module boundary** (`vi.mock("obsidian")` providing `Plugin`, `TFile`, `Notice`,
  and an `app` fixture with `vault`/`commands`/`workspace`/`fileManager`). Covers
  `configureCommands` diff/cleanup, `openNote`/`createNote` create-then-open flow,
  the race re-fetch, the folder-at-path `TFile` guard, and collision validation.
- **Not automated** — anything requiring a real Obsidian runtime/DOM/lifecycle
  (`layout-ready` timing, plugin enable/disable, real `vault.create`). Those go in
  the manual scratch-vault pass, which is the true end-to-end "integration" check.

### Layer 1 — Unit (`tests/types.spec.ts`, `tests/utils.spec.ts`, …)

- `slug`: lowercase/trim, non-alphanumerics → `-`, leading/trailing `-` stripped,
  empty input, digits-leading.
- `NOTE_TYPE_ID_RE`: accept `work`, `my-note`, `a1`; reject `Work` (case), empty,
  `-leading`, `trailing-`, embedded `/` or `:`.
- `DEFAULT_FORMATS`: correct moment-format string per granularity; `DEFAULT_NOTE_TYPE`
  defaults `enabled true` / `granularity "day"`.
- `applyTemplateTransformations`: `{{date}}`, `{{time}}`, `{{title}}` substitution
  (incl. `{{ date }}` spacing) → each becomes the passed filename/formats;
  no-template / empty-body case unchanged.
- getNotePath/ensureFolderExists against a minimal `{ createFolder }`/`{ getFolder }`
  stub: folder-with-subfolder creation, root (empty folder), idempotent when folders
  already exist, error path when `createFolder` throws. Path helper emits `/`-joined
  output after `normalizePath` on Windows-style input (the shared-helper rule).

### Layer 2 — Integration (mocked `obsidian`; `tests/config.spec.ts`, `tests/note.spec.ts`, `tests/collision.spec.ts`)

One `vi.mock("obsidian")` at module boundary; a `makeApp()` fixture returning fresh
`vault`/`commands`/`workspace`/`fileManager` doubles per test (no shared state);
`makeNoteType(overrides)` factory builds `NoteTypeConfig` records. Assert behavior,
not implementation: interaction with `commands`/`vault` verified only where it IS
the behavior under test.

- **`configureCommands`** (the highest-risk, regression-guarded):
  - adds `open-today-{id}-note` for an enabled new type;
  - does NOT re-add an already-registered id (no palette leak on repeated save);
  - `removeCommand` is called for a type deleted/disabled/renamed-id (orphaned-command
    regression guard) — and only for previously-registered ids;
  - keeps `open-periodic-picker` stable across calls;
  - disabled types register no command.
- **`openNote`/`createNote`**:
  - create path: `vault.create` called with correct path; `processFrontMatter` stamps
    `type` + `date`; existing file is opened, not re-created;
  - race path: `vault.create` rejects (already-exists) → `createNote` returns null →
    `openNote` re-fetches via `getAbstractFileByPath` and opens, no crash;
  - folder-at-path: `getAbstractFileByPath` returns a `TFolder` → no-op (TFile guard),
    no `openFile` call;
  - already-open-in-leaf: reuses the existing leaf instead of a second tab.
- **Collision validation** (shared path-helper, normalized): `Work` vs `Work/`,
  trailing-space format, cross-granularity same rendered name detected; distinct
  names (daily `YYYY-MM-DD` vs monthly `YYYY-MM`) allowed.

### Manual acceptance pass (scratch vault — the real integration check)

Unchanged behavior list, mapped to the plan's earlier numbered manual steps:

1. Configure two types (e.g. `Work` → `Work/`, `Journal` → `Journal/`), each with a
   throwaway template using `{{date}}` / `{{time}}` / `{{title}}`.
2. "Open today's Work note" → assert `Work/<today>.md` created, tokens substituted,
   folder auto-created, frontmatter has `type: work`.
3. Re-run → assert it opens the existing note in the current tab, does not duplicate.
4. "Open periodic note…" picker → assert type + period selection opens correct note.
5. Add a third type via settings → assert its command appears without app reload;
   assert previously-added commands are unchanged.
6. Collision guard: point two types at the same rendered path → assert save is
   blocked with a Notice identifying both.
7. Rename a type's `name` → assert the command changes nothing (id **and** label
   both derive from the immutable id: `Open today's work note`), by design.
8. Delete a type → assert its command disappears (removeCommand path), no orphan.
9. Disable a type → assert its command disappears.
10. `openAtStartup` on one type, full restart → assert today's note opens; on a
    plugin reload/disable-toggle (not a cold start) → assert it does NOT pop notes.
11. Concurrency: trigger two "open today" for the same type rapidly → assert no
    duplicate-note crash (create-NULL→re-fetch path).
12. Folder at path: create a folder named exactly like a target note → assert
    `openNote` no-ops safely (TFile guard) rather than throwing.

## Key references

- Obsidian docs home: https://docs.obsidian.md/Home
  - Build a plugin: https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin
  - Sample plugin: https://github.com/obsidianmd/obsidian-sample-plugin
  - Raw API markdown: https://github.com/obsidianmd/obsidian-developer-docs
    (`Vault/create`, `FileManager/processFrontMatter`, `Plugin/addCommand`,
    `PluginSettingTab`, `moment`)
- Periodic Notes (canonical repo): https://github.com/liamcain/obsidian-periodic-notes
  - Files: `src/main.ts`, `src/utils.ts`, `src/types.ts`, `src/settings/index.ts`,
    `src/commands.ts`, `src/constants.ts`, `src/cache.ts`,
    `src/calendarSetManager.ts` (Calendar Sets — data model reference)
- Note: docs.obsidian.md is client-rendered (plain fetch returns ~0.2KB). Fetch raw
  `.md` from `obsidian-developer-docs` for verbatim API signatures.
