# NPD QA Endorsement Tracker — Google Apps Script edition

A self-contained tracker a single person can deploy under **their own Google account**
— **no SharePoint, no tenant admin, no app registration**. The page is served by a
container-bound **Google Apps Script** Web App; data lives in a **Google Sheet**,
uploaded files in **Google Drive**, and **Slack posting + scheduled reminders run
server-side**.

Same UI, ShipERP branding, and four views as the SharePoint edition (Dashboard with
the "Needs attention now" panels, AXO Tracker, Shift Log, and the status-routed
New/Edit builder with a live Slack preview). Only the data/integration layer changed:
`google.script.run` + a Google Sheet instead of SharePoint REST.

> **Prefer SharePoint?** If you later get SharePoint access, the SharePoint edition is
> in [`../qa-endorsement-tracker/`](../qa-endorsement-tracker/) (see its `SETUP.md`).

---

## 1. Create the Sheet + Apps Script project

1. Create a new **Google Sheet** — this is your database.
2. In the Sheet, open **Extensions &rsaquo; Apps Script**. This makes a
   **container-bound** script (so `SpreadsheetApp.getActive()` targets this Sheet).

You don't need to pre-create any tabs — the server creates an **`Endorsements`** tab
with the header row `Id, ShiftDate, Shift, QAResource, Payload, CreatedAt, UpdatedAt`
on first use.

## 2. Add the three files

In the Apps Script editor:

1. **`Code.gs`** — replace the default `Code.gs` contents with this repo's `Code.gs`.
2. **`index` (HTML)** — click **+ &rsaquo; HTML**, name it exactly **`index`** (no
   extension), and paste this repo's `index.html` into it.
3. **Manifest** — **Project Settings** (gear) &rsaquo; tick **"Show `appsscript.json`
   manifest file in editor"**, open `appsscript.json` from the editor, and paste this
   repo's manifest. It requests these scopes (you'll approve them on first run/deploy):
   Sheets, Drive (`drive.file`), external requests (Slack), and ScriptApp (triggers).

## 3. Configure (Script Properties)

Open **Project Settings &rsaquo; Script Properties &rsaquo; Add script property**:

| Property | Value | Required |
|---|---|---|
| `SLACK_WEBHOOK_URL` | your Slack **Incoming Webhook** URL | Required for Slack posts |
| `REMIND_INCLUDE_BLOCKED` | `true` to also remind about **Blocked** AXOs | Optional (default `false`) |
| `REMIND_WHEN_EMPTY` | `false` to stay silent when nothing is open; otherwise the reminder posts a short **all-clear** heartbeat | Optional (**default `true`**) |
| `DRIVE_FOLDER_ID` | — | Auto-managed; leave unset |

**Make a Slack Incoming Webhook:** Slack &rsaquo; *Your apps* &rsaquo; create/select an
app &rsaquo; **Incoming Webhooks** &rsaquo; *Add New Webhook to Workspace* &rsaquo; pick a
channel &rsaquo; copy the `https://hooks.slack.com/services/…` URL.

> The webhook lives server-side in Script Properties — it is **never** in the page
> source. If `SLACK_WEBHOOK_URL` is unset, saves still work; Slack posting is simply
> skipped (logged). You can also set it from the editor by running
> `setConfig('https://hooks.slack.com/services/…')` once.

## 4. Deploy as a Web App

1. **Deploy &rsaquo; New deployment &rsaquo;** select type **Web app**.
2. **Execute as:** **Me** (data lives in *your* Sheet; everyone runs as you).
3. **Who has access:** pick one —
   - **Anyone with Google account** — login-gated; recommended.
   - **Anyone** — link-only, no login (anonymous). Convenient but anyone with the URL
     can use it.
   - **Anyone within `<your org>`** — only shows for Google Workspace accounts;
     tightest option.
4. **Deploy**, authorize the scopes when prompted, and copy the **Web App URL**. Share
   that URL with the team.

To tighten or loosen access later, edit the manifest's `webapp.access`
(`ANYONE_ANONYMOUS` / `ANYONE` / `DOMAIN` / `MYSELF`) and create a **new deployment**
(or **Manage deployments &rsaquo; Edit**).

## 5. Install the scheduled reminders

In the editor, select the function **`setupShiftReminders`** and **Run** it **once**
(authorize if prompted). It installs three native daily time-triggers that post a
start-of-shift reminder of any open **Urgent/High Prio** AXOs (plus **Blocked** when
`REMIND_INCLUDE_BLOCKED=true`). If none are open it posts a short **all-clear**
heartbeat so a quiet shift still confirms the schedule is working — set
`REMIND_WHEN_EMPTY=false` if you'd rather it stay silent on an empty shift.

The manifest `timeZone` is **Asia/Manila**, so the trigger hours are **local PHT**:

| Shift | PHT start | Trigger |
|---|---|---|
| Day | 5:00 AM | `atHour(5)` |
| Mid | 1:00 PM | `atHour(13)` |
| Night | 10:00 PM | `atHour(22)` |

> Apps Script time-triggers fire within the given hour (not exactly on the minute).
> Re-running `setupShiftReminders` is safe — it deletes existing `sendUrgentReminder`
> triggers first, then recreates the three.
>
> Time-triggers always run the **latest saved** project code, so editing `Code.gs`
> or changing a Script Property takes effect immediately — **no redeploy** and no
> re-run of `setupShiftReminders` needed. Only re-run it if the three triggers are
> missing (check **Triggers** in the editor sidebar). Each run writes diagnostics
> (open counts, whether the webhook is set, the Slack response code) to the
> **Executions** tab.

## 6. Access & security notes

- **Data** lives in the **owner's Google Sheet**; uploaded files in the owner's Drive
  folder **"NPD QA Test Files"** (shared "anyone with link — view" so links open for
  the team). Uploads go through the **Drive REST API** using the app's own OAuth token,
  so the tool keeps only the **narrow `drive.file`** scope — no broad `drive` access and
  no advanced service to enable. If your team prefers tighter sharing, change the
  permission `type` from `anyone` to `domain` (Workspace org-only) in `apiUploadFile`, or
  remove the permission step entirely so each file stays private and is shared manually.
- **Execute as Me** means every visitor's reads/writes run under the **owner's**
  identity and quotas — the Sheet and Drive are the owner's.
- The **Slack webhook** is in **Script Properties**, never in the page source.
- **"Anyone / anonymous" access** means anyone with the Web App URL can use the tool.
  Prefer **"Anyone with Google account"** (login-gated) or **domain** access where
  possible.

## 7. Migration (move data in / out)

- **Out:** the Sheet **is** the database — `File &rsaquo; Download` it, or copy rows.
  Each row's `Payload` cell is `JSON.stringify({ sections, fileRefs })`.
- **In:** paste rows into the `Endorsements` tab matching the header columns. `Id` can
  be any unique string (the server generates UUIDs for app-created rows); set
  `Payload` to the JSON shape above. Leave `CreatedAt`/`UpdatedAt` blank if unknown.
- From the SharePoint edition, the stored **model is identical**
  (`{ id, shiftDate, shift, qaResource, sections{…}, fileRefs[] }` with the sections +
  fileRefs as one JSON string), so a `Payload` value copies across unchanged. Note
  SharePoint **attachment** file-refs won't resolve here; re-upload those files (they
  become Drive **links**) or paste a link.
- The **seeded sample rows appear only in demo mode** (when the page is opened outside
  Apps Script). The real Sheet **starts empty**.

## 8. Troubleshooting

- **Uploads folder / `DRIVE_FOLDER_ID`.** The uploads folder (**"NPD QA Test Files"**)
  is **created once** via the Drive REST API and its id is **cached in the Script
  Property `DRIVE_FOLDER_ID`** (auto-managed — leave it unset yourself). The server
  verifies that cached id with a REST `GET` and reuses it; it **never searches** for a
  folder by name. This is deliberate: a name search would require the broad `drive`
  scope, whereas creating and touching **app-created** items works under the **minimal
  `drive.file`** scope. If the cached folder is deleted/trashed, the server simply
  creates a new one and re-caches its id on the next upload. To force a brand-new
  folder, delete the `DRIVE_FOLDER_ID` Script Property.
- **Teammates see demo mode / "Can't connect".** If a teammate opens the Web App URL
  but the page can't reach the server, it now shows an explicit **"Can't reach the
  tracker"** screen (a **Disconnected** pill, reload + guidance) instead of silently
  dropping into **Demo (local)** mode — so nobody edits throwaway local data thinking
  it's shared. Common causes and fixes:
  - **Third-party cookies blocked.** Apps Script serves the page from a
    `googleusercontent.com` iframe and needs cookies for `google.com` +
    `googleusercontent.com`. **Allow third-party cookies** for those domains (or
    disable the "block third-party cookies" setting for this site).
  - **Multiple Google accounts.** Being signed in to several accounts can misroute the
    request. **Use one account**, or open the link in an **incognito/private window**
    signed in to just the right account.
  - **Not the `/exec` URL.** Make sure the link is the deployed Web App URL (ends in
    **`/exec`**), not a saved copy of the HTML file or a `/dev` link.
  After fixing, click **Reload** on that screen (it re-runs detection). Genuinely local
  previews (opening the file directly, or adding **`?demo=1`**) still get real demo mode;
  the "Can't reach the tracker" screen also offers an **"Open demo mode instead"** link.
- **Applying code changes + re-auth.** Pulling an update from this repo does **not**
  change your deployed copy. After any change to `Code.gs` / `appsscript.json` (or
  `index`), **paste the updated file(s) into your Apps Script editor and Save**, then
  **Deploy → Manage deployments → Edit → New version**. On that first run/deploy after
  this change, Apps Script will **prompt to (re)authorize** — **approve it**. (The
  requested scopes are still only Sheets, `drive.file`, external requests, and
  ScriptApp — no broad `drive` access is ever requested.)

---

## How it works

- **Runtime detection (`index.html`).** On load the page **polls for the
  `google.script.run` bridge for up to ~5 s** (it can initialize late). If it appears →
  **Connected — Google** mode (all CRUD via the server). A **genuine local/static
  preview** (a `file:` origin, or an explicit `?demo=1` / "Open demo mode instead"
  request) → **Demo (local)** mode with sample data in `localStorage`. But if the page
  is clearly **running as the Web App** yet the bridge never connects (or the first
  `apiList()` fails) — typically third-party cookies blocked or a multi-account misroute
  — it shows an explicit **"Can't reach the tracker"** screen with a **Disconnected**
  pill instead of silently seeding demo data (see `store.detect()` / `isGenuineLocal()` /
  `isWebAppContext()`).
- **Data layer.** The `store.list / add / update / remove` interface wraps
  `google.script.run` calls in Promises (`withSuccessHandler` / `withFailureHandler`),
  calling `apiList()`, `apiAdd(model)`, `apiUpdate(id, model)`, `apiRemove(id)`. The
  view code is unchanged from the SharePoint edition.
- **File upload.** In Connected mode a chosen file is read to base64 (FileReader) and
  sent to `apiUploadFile(name, mimeType, base64)`; the server performs a **multipart
  Drive REST v3 upload** (via `UrlFetchApp` + `ScriptApp.getOAuthToken()`, so no
  `DriveApp` and only the `drive.file` scope), shares the file view-by-link, and returns
  `{ name, url }`, stored as a `kind:'link'` fileRef pointing at the Drive URL (so it
  renders/opens like any pasted link). Demo mode keeps the inline data-URL fallback with
  a size cap. Pasting a link also still works.
- **Slack (server-side).** `apiAdd` calls `sendNewEndorsementAlert_`, which posts
  `buildSlackAlert(model)` — the same alert content as the SharePoint edition (shift
  header, Urgent/High Prio AXOs up top, per-section counts). A failed post never fails
  the save. Edits don't post. The header **"Copy latest as Slack"** button is
  unchanged (client-side clipboard).
- **Reminders (server-side).** `sendUrgentReminder` derives each AXO's current status
  with the same `deriveAxos` logic as the client and posts the open Urgent/High Prio
  (and optionally Blocked) AXOs at each shift start via the native time-triggers.

The pure functions (`deriveAxos`, `buildSlackAlert`, status→section mapping, etc.) are
**copied verbatim** into `Code.gs`, so the server and client produce identical text.
