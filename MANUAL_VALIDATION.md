# Manual Validation Checklist — obsidian-multitype-periodic-notes

Use this to validate the plugin in a real Obsidian vault. Tick boxes as you go.
This file is a **check-off aid only** — the authoritative design doc is
`.plans/obsidian-multitype-periodic-notes.md`.

**Setup before testing:** copy `main.js`, `manifest.json`, `styles.css` into a
scratch vault's `.obsidian/plugins/periodic-types/`, enable the plugin, and
confirm the toast "periodic-types: env ok" (replaced by real behavior in later
builds — if the stub toast is gone, that's expected).

---

## Part A — Core scenarios (plan manual acceptance pass)

### A1. Create & open

- [ ] Configure two types: `Work` → `Work/`, `Journal` → `Journal/`, each with a
      throwaway template using `{{date}}` / `{{time}}` / `{{title}}`.
- [ ] "Open today's Work note" creates `Work/<today>.md`; tokens substituted;
      folder auto-created; frontmatter has `type: work` (+ `date:`).
- [ ] Re-run "Open today's Work note" → opens the existing note in the current
      tab, does NOT duplicate.

### A2. Picker

- [ ] "Open periodic note…" → type list appears → selecting a type advances to a
      period list (Today / Next / Previous) → selection opens the correct note.

### A3. Settings registry

- [ ] Add a third type via settings → its "Open today's…" command appears without
      app reload; previously-added commands unchanged.
- [ ] Rename a type's `name` → command **id AND label** unchanged (`Open today's
  work note`, named from the immutable id — by design).
- [ ] Delete a type → its command disappears from the palette, no orphan.
- [ ] Disable a type → its command disappears.
- [ ] Add a type with an empty name → blocked with a Notice.
- [ ] Add types with colliding slugs (e.g. "Work" then "Work!") → duplicate id
      gets a counter suffix (`work`, `work-2`).

### A4. Collision guard

- [ ] Point two enabled types at the same rendered path (e.g. same folder + same
      format) → save blocked with a Notice naming both.
- [ ] Distinct names in one folder (daily `YYYY-MM-DD` vs monthly `YYYY-MM`)
      allowed.

### A5. openAtStartup

- [ ] Enable `openAtStartup` on one type, full Obsidian restart → today's note
      opens.
- [ ] Plugin reload / disable-toggle (NOT a cold start) → does NOT pop notes.

### A6. Robustness

- [ ] Fire two "open today" for the same type rapidly → no duplicate-note crash.
- [ ] Create a folder named exactly like a target note → no-op, no throw (a
      short Notice explains the folder at that path).

### A7. Registry edge

- [ ] Delete ALL types → "Reset to default" Notice and the Work block
      immediately reappears; reload → Work persists.
- [ ] (Optional) Edit `data.json` to `{"types":[]}` and reload → `work` is
      re-seeded.

---

## Part B — Review risk checklist (independent review findings)

- [ ] **B1. Command removal works live.** Delete a type and disable a type →
      the command actually VANISHES from the palette. This is the load-bearing
      runtime unknown: if it does NOT vanish, `Plugin.removeCommand` is
      auto-prefixing and the call double-prefixes (fix: pass the bare id, or
      revert to `app.commands.removeCommand("periodic-types:" + id)`).
- [ ] **B2. Rename-label behavior — RESOLVED (by design).** Command id AND label
      both derive from the immutable id. After a rename, check the palette entry
      still reads `Open today's work note`.
- [ ] **B3. Picker type→period advance.** Selecting a type actually advances to
      the period list (synthetic `input` event), and Today/Next/Previous open
      the right delta note.
- [ ] **B4. Delete-all + reload** — see A7 (work re-seeded = correct after fix).
- [ ] **B5. Templater interaction** (if Templater installed): a template with
      `<% %>` produces expected body; `{{date}}/{{time}}/{{title}}` still
      substitute; no double-render or mangled tokens.
- [ ] **B6. Corrupt-YAML existing note.** Open a hand-made note at a type's path
      whose frontmatter is broken YAML → an error Notice ("Couldn't write
      frontmatter for the … note at … — check the note's YAML.") and the note
      still opens; a clean-YAML note stamps `type`/`date` idempotently.
- [ ] **B7. Settings tab renders (latest Obsidian).** ⚠️ **Assume latest Obsidian
      is used**, so the `getSettingDefinitions() → []` fallback is live and MUST
      produce the tab. Confirm Settings → Community plugins → Periodic note types
      shows the "Note types" heading, the seeded `Work` block, and the
      "Add note type" row. A blank tab = real bug (fix: delete the override or
      return real definitions).
- [ ] **B8. openAtStartup cold-start only (ACCEPTED).** ⚠️ **Confirmed by user** —
      cold-start-only is the intended behavior. Full restart → today's note opens.
      Plugin enabled AFTER the app is already running → does NOT open
      (layout-ready already passed; accepted limitation).

---

## Notes

- Anything that fails here should be reported back with the scenario number and
  the Obsidian version in use.
- After validation, `git add` Stages 4–6 and commit (they are currently
  uncommitted).
