# obsidian-multitype-periodic-notes

An Obsidian plugin for managing **multiple, independently-configurable periodic
note types** (work, personal, journal, …) that run in parallel alongside
[Periodic Notes](https://github.com/liamcain/obsidian-periodic-notes).

Periodic Notes generates one daily/periodic note per active configuration. This
plugin lets you register any number of note types — each with its own folder,
filename format, template, granularity, and per-type commands — so a work note and
a personal note can both follow the same canonical daily flow without manual
setup.

## Planned features

- Registry of note types (`id`, `name`, `granularity`, `folder`, `format`,
  `templatePath`, `openAtStartup`).
- Per-type command: `Open today's {name} note`, plus a picker for next/prev.
- Template resolution and `{{date}}`/`{{time}}`/`{{title}}` substitution.
- `type: <id>` frontmatter stamping for querying / future pruning.
- Collision guard so no two types write the same rendered path.
- Works alongside Periodic Notes (standalone plugin, no coupling).

## Development

Node ≥ 20. Scaffolded from the
[Obsidian sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin);
`npm run dev` builds `main.js`, then copy `main.js`, `manifest.json`,
`styles.css` into `<vault>/.obsidian/plugins/<plugin-id>/` and reload Obsidian.

See the plan for the full bootstrap checklist and staged build sequence.

## License

MIT
