# Periodic note types

An Obsidian plugin for running **any number of independently-configurable
periodic note types** (work, personal, journal, …) in parallel alongside
[Periodic Notes](https://github.com/liamcain/obsidian-periodic-notes). Each type
has its own folder, filename format, template, granularity, and its own command —
so a work note and a personal note can both follow the daily flow without manual
setup.

## Install

1. `npm install && npm run build` (requires Node ≥ 20).
2. Copy `main.js`, `manifest.json`, `styles.css` into
   `<vault>/.obsidian/plugins/periodic-types/`.
3. Enable it in **Settings → Community plugins**.

Requires Obsidian ≥ 1.7.2.

## Usage

- **Commands** — one per enabled type: `Open today's {id} note` (named from the
  type's immutable ID, so renaming the display name never changes a command),
  plus `Open periodic note…` to pick a type and a period (today / next /
  previous).
- **Settings** — add a type by display name; the ID is derived once (`slug`) and
  never changes. Per type: name, folder, filename format (moment; blank =
  granularity default), template path, granularity, enabled, open at startup.
  Empty names are rejected; duplicate IDs get a `-2` suffix; deleting all types
  resets to the default `work` type.
- **Collision guard** — two enabled types can't resolve to the same rendered
  path. Keep each type's folder distinct from your Periodic Notes daily folder:
  the guard only covers this plugin's own types.
- **Frontmatter** — notes are stamped with `type: <id>` and `date:` (existing
  notes only when missing) so Dataview can select per-type notes.
- **Open at startup** — opens the type's current note on a real app launch;
  toggling the plugin mid-session does not pop notes.

## Notes

- A missing template never blocks creation: the note is created empty and a
  Notice is shown.
- If [Templater](https://github.com/SilentVoid13/Templater) is installed,
  `<% %>` blocks in templates are best-effort rendered through it at creation;
  this plugin always substitutes its own `{{date}}`/`{{time}}`/`{{title}}`
  tokens.
- Corrupt YAML on an existing note at a type's path shows an error Notice; the
  note still opens.

## License

MIT