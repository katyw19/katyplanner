// Copy this file to config.js and fill in your own values.
// config.js is git-ignored, so your keys stay on your machine.
// The dashboard works fine without it — the calendar panel just shows a setup hint.

window.DASHBOARD_CONFIG = {
  // From console.cloud.google.com → APIs & Services → Credentials
  googleClientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
  googleApiKey: 'YOUR_API_KEY', // optional — restrict it to the Calendar API

  // ── The one-line fallback switch ─────────────────────────────────────────
  // 'api'    → styled agenda via the Google Calendar API (recommended)
  // 'iframe' → zero-setup embed, no keys needed: change this to 'iframe' and
  //            paste your embed URL below (Google Calendar → Settings → your
  //            calendar → "Integrate calendar" → Embed code src, Agenda mode).
  calendarMode: 'api',
  calendarEmbedSrc: '',
};
