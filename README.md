# Katy's Home Dashboard

A calm, personal home dashboard: to-dos by category with urgency ranks, a
private journal for longer writing, and an autosaving scratchpad. Plain HTML,
CSS, and vanilla JavaScript — no framework, no build step, no accounts. All
data lives in your browser's localStorage, on your machine only.

## Run it

From this folder:

```bash
python3 -m http.server 5180
```

Then open <http://localhost:5180>. That's the whole daily routine — bookmark it.

**Keep the port at 5180.** Your data is stored by the browser under the
`localhost:5180` address — if you serve on a different port one day, the
dashboard will look empty (the data isn't gone; go back to 5180).

## Using it

- **Add a task:** click the input at the top of a list, type, press Enter.
- **Urgency:** every task has a small dot + label (Urgent / Soon / Upcoming /
  Someday). Click it to cycle. New tasks start as Upcoming. Tasks auto-sort by
  urgency; anything marked Urgent also surfaces in the "Today" strip up top.
- **Reorder lists:** hover a list's header → grab the ⠿ handle and drag the
  card onto another list to take its spot. (The handle also responds to arrow
  keys.)
- **Due date (optional):** hover a task → calendar icon. Click an existing date
  to change it; clear the field to remove it.
- **Edit:** click a task's text (or a list's name). Enter saves, Esc cancels.
- **Complete:** click the circle. Done tasks fade to the bottom under a
  collapsible "Done" divider.
- **Delete:** hover a task (or list header) → ×.
- **Journal:** ＋ in the Journal panel opens a quiet full-screen writing sheet —
  title optional, autosaves as you type, Esc or ← to close. Entries are listed
  newest first; open one anytime to keep writing. Private like everything else:
  entries never leave your browser.
- **Journal folders:** the little folder icon in the Journal panel creates a
  named folder. Open an entry and use the quiet "No folder" picker at the top
  of the sheet to file it. Folder rows fold/unfold on click; hover one for
  rename (✎) and delete (×) — deleting a folder never deletes entries, they
  just return to the unfiled list.
- **Journal formatting:** the small toolbar offers bold (⌘B), italic (⌘I),
  bullets, checklists (tick a box and the line crosses itself off — the state
  saves with the entry), and links (⌘K). Select some text and hit the link button to name a
  link like in Google Docs, or use it with nothing selected to type the text
  and address. Clicking a link opens it in a new tab; to change or remove one,
  ⌘-click it (or place your cursor inside it and press ⌘K or the link button).
- **Notes:** just type. Autosaves as you go.
- **Theme:** the ◐ in the top-right toggles light / dark.
- **Little touches:** a few seasonal petals drift by (sakura-red in spring,
  matcha in summer, clay in autumn, snow in winter — they stay home if your
  system prefers reduced motion), a daily kotowaza (proverb) sits under the
  date, the urgent strip is stamped with a 今日 seal, and completing a task
  flashes a tiny vermilion stamp.
- **Backup:** "Export data" in the footer downloads a JSON of everything
  (tasks, lists, notes, journal); "Import data" restores it.

## Where your data lives

localStorage keys: `dashboard.todos`, `dashboard.categories`,
`dashboard.notes`, `dashboard.journal`, `dashboard.journalFolders`,
`dashboard.theme`.
Clearing site data for localhost erases them — export a backup first.

## Files

```
index.html    page shell
styles.css    all styling — palette tokens at the top
js/store.js   state + localStorage + pub/sub
js/todos.js   lists, tasks, Today strip, drag-to-reorder
js/journal.js journal entries + writing sheet
js/app.js     boot: header, theme, notes, backup
```
