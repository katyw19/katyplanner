# Katy's Home Dashboard

A calm, personal home dashboard: to-dos by category with urgency ranks, a
read-only Google Calendar agenda, and an autosaving scratchpad. Plain HTML,
CSS, and vanilla JavaScript — no framework, no build step, no accounts. All
data lives in your browser's localStorage.

## Run it

From this folder:

```bash
python3 -m http.server 5180
```

Then open <http://localhost:5180>. That's the whole daily routine — bookmark it.

(The fixed port matters only for Google Calendar: OAuth is tied to the
`http://localhost:5180` origin you register below. Everything else works from
any port.)

## Using it

- **Add a task:** click the input at the top of a list, type, press Enter.
- **Urgency:** every task has a small dot + label (Urgent / Soon / Upcoming /
  Someday). Click it to cycle. New tasks start as Upcoming. Tasks auto-sort by
  urgency; anything marked Urgent also surfaces in the "Today" strip up top.
- **Due date (optional):** hover a task → calendar icon. Click an existing date
  to change it; clear the field to remove it.
- **Edit:** click a task's text (or a list's name). Enter saves, Esc cancels.
- **Complete:** click the circle. Done tasks fade to the bottom under a
  collapsible "Done" divider.
- **Delete:** hover a task (or list header) → ×.
- **Notes:** just type. Autosaves as you go.
- **Theme:** the ◐ in the top-right toggles light / dark.
- **Backup:** "Export data" in the footer downloads a JSON of everything;
  "Import data" restores it.

## Connect Google Calendar (one-time, ~10 minutes)

The calendar panel is read-only — it only ever displays your events. Until
it's configured, the panel shows a hint and everything else works normally.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and
   create a free project (any name, e.g. `katy-dashboard`).
2. **APIs & Services → Library** → search "Google Calendar API" → **Enable**.
3. **APIs & Services → OAuth consent screen**: choose **External**, fill in
   the app name + your email, and add yourself as a **test user**.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized JavaScript origins: `http://localhost:5180`
5. (Optional) **Create Credentials → API key**, then restrict it to the
   Calendar API.
6. Copy the config template and paste your values in:

   ```bash
   cp config.example.js config.js
   ```

   `config.js` is git-ignored — your keys never leave your machine.
7. Reload the dashboard and click **Connect Google Calendar**. Approve the
   read-only permission once; the token is cached so you won't be re-approving
   constantly.

### Zero-setup fallback (iframe embed)

If the API setup is ever a hassle, there's a one-line switch in `config.js`:
set `calendarMode: 'iframe'` and paste your calendar's embed URL into
`calendarEmbedSrc` (Google Calendar → Settings → your calendar → *Integrate
calendar* → Embed code, Agenda mode). Less pretty, no keys needed.

## Where your data lives

localStorage keys: `dashboard.todos`, `dashboard.categories`,
`dashboard.notes`, `dashboard.theme`, `dashboard.gcal` (calendar token cache).
Clearing site data for localhost erases them — export a backup first.

## Files

```
index.html          page shell
styles.css          all styling — palette tokens at the top
js/store.js         state + localStorage + pub/sub
js/todos.js         lists, tasks, Today strip
js/calendar.js      Google Calendar agenda
js/app.js           boot: header, theme, notes, backup
config.example.js   template for your Google keys
```
