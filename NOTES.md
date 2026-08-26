# Notes

During testing the MANUAL_VALIDATION. The following notes were made:

## Settings Menu

- should place "Add note type" option at top of settings UI.
- "Add note type" should be visually distinct from other note type settings so that is clearly visible
- "Delete" (note type) red button is good. Red for danger nice
- "Delete" (note type) button should be inline with the note type's title if possible
- the note type should be toggleable as enabled/disabled. Similar to Periodic Notes feature (toggle it off/on without deleting it). This is current configurable via the "Enabled" toggle. Similar to the "Delete" button, it would be nice if these could be inlined together with the note's title.
- each note type's section has an errant date stamp above it. This is not expected and not desired. Remove it.
- folder option for note type should suggest based on real file paths. Instead it is a blank input.
- folder option input for note type doesn't allow the same folder for distinct notes. This is correct. However, it applies this as the content is entered. This validation should be applied on blur/on defocus of the input field.
- each note type should be split by a divider for visible clarity.
- templates option should prefill with Obsidian's default template path and suggest available templates in dropdown.
- Adding a new note type should add when hitting "enter" on keyboard (only button click works currently).

## Manual Validation Notes

- A1 passing with one bug:
  - PASS: configure x2 note types Work + Journal with a simple template and distinct folders
  - PASS: open journal note, reopen with command and existing file reopened
  - PASS: template subtitution and frontmatter applied as expected
  - PASS: folder autocreation as expected (nested subfolder folder working too)
  - PASS: tab does NOT duplicate
  - BUG-A1: given I configure a work + journal note type, regardless of which note type I open, the journal type is always opened and inserted. This seems to only affect the default "work" note type. A note type of Work-2 is completely valid and works fine. Additional note types are therefore fine.
- A2: PASS
- A3:
  - PASS: third type added and appearing as expected
  - UNCONFIRMED: rename cannot be tested due to BUG-A1
  - PASS: delete a type and its command disappears (also from palette)
  - PASS: empty name not valid and notice shows as expected
  - PASS: colliding slugs shows a notice and does NOT add the colliding note type. This is expected and correct but manual validation expected a counter suffix. Counter suffix is NOT expected and NOT desired.
- A4: ALL PASS
- A5: ALL PASS
- A6: ALL PASS
- A7:
  - PASS: delete all types and resets with notice
  - PASS: edit `data.json` directly then reload. Data shows in UI as expected. edit directly and remove all types then reload also resets types to expected default.

- B1: PASS (covered by earlier test)
- B2: PASS
- B3: UNCLEAR, the picker command advances to the note type selection as expected. There is no period list selection I know of
- B4: PASS
- B5: PASS
- B6: PASS
- B7: PASS
- B8: PASS
