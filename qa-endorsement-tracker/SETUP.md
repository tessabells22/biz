# NPD QA Endorsement Tracker — SharePoint deployment

A single, self-contained `index.html` that reads and writes one shared SharePoint
list so the whole NPD QA team edits one copy of the shift-endorsement log. No build
step, no dependencies, no CDNs — it runs offline from any SharePoint page.

> **Branding:** the chrome is re-skinned to the real **ShipERP** look (light app
> bar, recreated inline-SVG **ShipERP** logo with an amber underline and the
> **NPD QA** label) and the product is named **NPD QA Endorsement Tracker**. The
> verbatim Slack field **`QA Resource`** is unchanged. See §6.

Entries go in through **one unified AXO row builder** — add an AXO, pick its status,
and the status files it into the correct Slack section automatically (no more filling
seven separate section blocks). The Shift Log cards and the "Copy latest as Slack"
output still mirror the real Slack **"Endorsement of Tasks"** modal field-for-field
(see "Field structure" below). Each handover is stored as **one list item**: all of
its sections *and* its file references are kept as JSON in a single text column, so
list setup is trivial and the structure is preserved exactly.

---

## 1. Create the SharePoint list

Create a list named **`QAEndorsements`** (Site contents → New → List → Blank list).
Add these columns:

| Column | Type | Notes |
|---|---|---|
| `Title` | Single line of text | Exists by default. Used as a shift label, e.g. `2025-09-30 Night — Juan`. |
| `ShiftDate` | Date and Time | The shift date. If you prefer, a **Single line of text** holding an ISO date (`YYYY-MM-DD`) also works. |
| `Shift` | Choice *(or Single line of text)* | Choices: `Day`, `Mid`, `Night`. |
| `QAResource` | Single line of text | The QA who logged the shift. |
| `Payload` | Multiple lines of plain text | `JSON.stringify({ sections, fileRefs })` — all handover sections **plus** the "Needs Continuation Test File Upload" references (link / attachment / data kinds). Set "Plain text" (not rich text / not append-only). |

Column **internal names must match** the names above (`ShiftDate`, `Shift`,
`QAResource`, `Payload`). SharePoint derives the internal name from the name you
type when the column is first created, so create them with exactly these names. If
a column already exists with a different internal name, recreate it or adjust the
`$select`/field names in `index.html`.

> The app never parses individual AXO columns on the server — every section and all
> file references live inside `Payload` as JSON. This keeps the list schema stable
> even if the handover format evolves. **No extra column is needed for file
> references** — they ride along in the same `Payload` text.

---

## Field structure — the "Endorsement of Tasks" form

The Shift Log cards and the "Copy latest as Slack" output use these labels
**verbatim** from the Slack modal, in this order. In the New/Edit Endorsement
builder you don't pick a section directly — you pick a **status** on each AXO row
and it routes into the matching section below (status → section mapping noted inline):

1. **Date** *(required to save)*
2. **QA Resource** *(required to save)* — plus an operational **Shift** selector
   (Day / Mid / Night) the tool adds for cross-shift ordering.
3. **Worked On during Shift and Status** — status *In Progress*, *Passed*, or *Failed*.
4. **Needs Monitoring for Develop/Deployment Server - (AXOs that are already in the
   canvass but hasn't been crossed out)** — status *Needs Monitoring*.
5. **Needs Continuation Test File Upload** — file references (see below); a
   collapsible panel in the builder.
6. **Blocker Issue that needs Urgency (Include the affected AXO No. if any and the
   Title raised in Blocker for easy search)** — status *Blocked*.
7. **Urgent and High Prio** — status *Urgent/High Prio*.
8. **Not Yet Tested** — status *Not Tested*.
9. **Non AXO Related but needs Attention - Regression, end-to-end ETC** — free-text
   lines, no AXO / no status; a collapsible panel in the builder.

Every field is optional in Slack; the tool only requires **Date** and
**QA Resource** so each item can be labelled and ordered. The builder also
remembers the last-used QA Resource and Shift (and defaults Date to today), and
has a collapsible **Preview Slack post** panel (below the row builder, remembers its
open/closed state, default collapsed) that matches the "Copy" output exactly. The
status dropdown is grouped **Worked on this shift** (*In Progress* default, *Passed*,
*Failed*) and **Needs follow-up** (*Needs Monitoring*, *Not Tested*, *Urgent/High Prio*,
*Blocked*); the stored status values are unchanged and *In Progress*, *Passed*, and
*Failed* all still file under **Worked On during Shift and Status**.

### File references ("Needs Continuation Test File Upload")

Each entry can hold any number of file references, added by dragging files onto the
drop zone, by the **choose files** picker, or by **+ Add a link instead**. A removable
chip (with name and size) shows each chosen file. Every reference is one of **three
kinds**, all stored in the single `Payload.fileRefs` array and shown on the matching
Shift Log card and in the Slack copy/preview under the verbatim heading:

| `kind` | Stored shape | Used in | Shown as |
|---|---|---|---|
| `link` | `{ kind:'link', name, url, note }` | both modes | name + link + note |
| `attachment` | `{ kind:'attachment', name, note }` | **Connected** mode | name (attachment) + note |
| `data` | `{ kind:'data', name, note, dataUrl }` | **Demo** mode | name + note (downloadable) |

Older items saved before kinds existed stored only `{ name, url, note }`; they are read
as **links**, so nothing breaks.

**Connected (SharePoint) mode — real attachments.** Dropped/picked files upload as the
list item's **native attachments**. Because an attachment needs an existing item, Save
happens in order: the item is created (or updated) and its `Id` read, *then* each pending
file is uploaded with

```
POST {site}/_api/web/lists/getbytitle('QAEndorsements')/items({id})/AttachmentFiles/add(FileName='{encoded name}')
```

(the file's `ArrayBuffer` as the request body, with a fresh `X-RequestDigest`). Filename
collisions are de-duplicated automatically (`report.har` → `report (2).har`). On **Edit**
the item's existing attachments are listed via `.../items({id})/AttachmentFiles` and shown
as chips; removing a chip deletes the attachment on Save via
`.../AttachmentFiles/getByFileName('{name}')` with `X-HTTP-Method: DELETE` and `IF-MATCH: *`.
Upload/delete errors surface as a toast and never undo the saved endorsement.

> **Enable attachments on the list.** List settings → *Advanced settings* →
> *Attachments: Enabled* (SharePoint lists allow attachments by default; confirm they
> were not turned off). Adding or removing an attachment requires **Contribute** on the
> list (see §4).

**Demo (local) mode — inline data.** With no server, each dropped/picked file is read
with `FileReader` as a base64 `data:` URL and stored inline (kind `data`) so it persists
in `localStorage` and can be re-downloaded from the card. A per-file cap of **1.5 MB** is
enforced to protect the browser storage quota; a larger file is rejected with a clear
message suggesting the **link** option instead.

---

## 2. Host `index.html` on SharePoint

1. Upload `index.html` to a document library — **Site Assets** is a good choice
   (`Site contents → Site Assets → Upload`).
2. Surface it on a page using any one of:
   - **File Viewer** web part pointing at the uploaded `index.html`, or
   - **Embed** web part with the file's URL, or
   - a classic **Content Editor** web part linking the file, or
   - simply share the direct file URL (`.../SiteAssets/index.html`).
3. Open the page while **signed in**. Because the page is served from the same
   SharePoint origin, its REST calls are automatically authenticated with the
   viewer's credentials (`credentials: 'same-origin'`) — no app registration,
   client secret, or token handling is required.

---

## 3. Point it at your site (only if needed)

Near the top of `index.html`:

```js
const SP_CONFIG = {
  siteUrl: '',                       // e.g. 'https://contoso.sharepoint.com/sites/QA'
  listName: 'QAEndorsements',
  slackWebhookUrl: '',               // optional — see "Slack notifications"
  axoStatusListName: 'QAAxoStatus'   // optional — see "Scheduled reminder" ('' = off)
};
```

- **Leave `siteUrl` empty** when the file is hosted on a SharePoint page — the app
  auto-detects the site from `_spPageContextInfo.webAbsoluteUrl`.
- **Set `siteUrl`** to the absolute site URL only if auto-detect does not apply
  (for example, embedding where the page context is unavailable). Use the site URL
  *without* a trailing slash.
- Change `listName` only if you named the list something other than
  `QAEndorsements`.
- `slackWebhookUrl` and `axoStatusListName` are optional and covered under **Slack
  notifications** below; both ship off/empty of a live webhook by default.

The data layer uses standard SharePoint REST and works on SharePoint Online /
modern pages and classic:

- `GET  _api/web/lists/getbytitle('QAEndorsements')/items?$select=…&$top=5000&$orderby=ShiftDate desc`
- `POST _api/contextinfo` for a fresh form digest before every write
- `POST …/items` to add, `POST …/items(Id)` with `IF-MATCH:*` + `X-HTTP-Method:MERGE`
  to update, and `IF-MATCH:*` + `X-HTTP-Method:DELETE` to delete.

---

## 4. Permissions

The app inherits the user's SharePoint permissions on the list:

- **Contribute** (or higher) → can log new endorsements, edit, and delete, and
  **add or remove list-item attachments** (the real file uploads).
- **Read** → can view the dashboard, tracker, and shift log, but writes will fail
  with a clear error toast.

Grant the QA team Contribute on the `QAEndorsements` list; grant stakeholders Read.

---

## 5. Demo mode vs connected mode

The header shows a connection pill:

- **Connected — SharePoint**: a site context was found and a read succeeded. All
  create / edit / delete operations go to the live shared list, and **Refresh**
  re-fetches it.
- **Demo (local)**: no SharePoint site was detected (for example, opening the file
  directly off a desktop, or a local preview). The app loads **sample data** —
  clearly labelled as sample in the UI — and all changes persist to this browser's
  `localStorage` only. Nothing is shared with the team and nothing touches
  SharePoint. A dismissible banner explains this and points back to this file.

The storage layer is abstracted behind a single interface (`store.list / add /
update / remove`) that dispatches to SharePoint REST or `localStorage` based on the
detected mode, so the UI behaves identically in both.

The sample data (demo mode only) is a preview aid. The **source of truth is always
the SharePoint list.**

---

## Slack notifications

The tool always offers **Copy latest as Slack** in the header (clipboard, no setup) —
it copies the full six-section "Endorsement of Tasks" post for the latest handover.

### Notify on every new endorsement

To post a short alert automatically whenever a new endorsement is logged, set up
**one** of the two routes below. **Pick only one** — running both posts every new
endorsement twice.

#### 1. Recommended — Power Automate on-create flow (reliable, credential server-side)

Build a flow in Power Automate:

1. Trigger: **When an item is created** → site = your site, list = **`QAEndorsements`**.
2. *(Optional)* Add a **Compose** to format the message from the item's columns /
   `Payload`.
3. Action: **Post message in a chat or channel** (Slack connector) to the target
   channel, *or* an **HTTP** action `POST`ing to a Slack Incoming Webhook with body
   `{ "text": "…" }`.
4. Save the flow and turn it on.

Why this is preferred:

- The Slack credential (connection or webhook) lives in the flow, **never in the page
  source** — nobody who opens `index.html` can read it.
- It is **server-side** and fires for **every** item created in the list, including
  items created by any other client, not only saves made through this page.

#### 2. Alternative — Slack Incoming Webhook in the page (quick)

Set the webhook URL near the top of `index.html`:

```js
const SP_CONFIG = {
  …
  slackWebhookUrl: 'https://hooks.slack.com/services/T000/B000/XXXXXXXX'
};
```

Create the webhook via a Slack app with **Incoming Webhooks** enabled (Slack →
*Your apps* → *Incoming Webhooks* → *Add New Webhook to Workspace*). When
`slackWebhookUrl` is non-empty, saving a **new** endorsement **automatically** posts a
concise alert to that channel:

- the **shift header** (date · shift · QA Resource),
- any **Urgent / High Prio** AXOs for that endorsement, listed up top, and
- a one-line **per-section count** summary.

The post is sent as a CORS "simple request" (`Content-Type:
application/x-www-form-urlencoded`, body `payload=<json>`, `mode:'no-cors'`), so the
browser needs no proxy. A failed post is **never** allowed to fail the Save — it only
shows a non-blocking toast. **Editing** an existing endorsement does **not** post, to
avoid repeat noise.

> **⚠️ The webhook URL is visible in the page source** to anyone who can open the file.
> Only use this route for an **internal / trusted-audience** page. It also fires **only
> for saves made through this page** — items created by other clients are not posted.
> **Do not also run the Power Automate on-create flow (route 1), or every new
> endorsement will be posted twice.** For a server-side secret that covers all sources,
> prefer route 1.

### Scheduled Urgent / High Prio reminder

A static page cannot run on a timer, so a recurring "remind us of the urgent AXOs"
message must be a **scheduled Power Automate flow**. To make that flow trivial, the
tracker keeps an **optional** helper list mirroring each AXO's **current** status.

**Helper list — `QAAxoStatus`** *(OPTIONAL — only needed for this reminder)*. Create a
list with these columns; everything is stored as **text** so setup is easy:

| Column | Type | Notes |
|---|---|---|
| `Title` | Single line of text | The AXO number (exists by default). |
| `AxoNumber` | Single line of text | The AXO number again (looked up by the tracker). |
| `Status` | Single line of text | The AXO's current status value, e.g. `Urgent/High Prio`. |
| `Note` | Multiple lines of plain text | The latest note for that AXO. |
| `QAResource` | Single line of text | QA who last touched it. |
| `ShiftDate` | Single line of text | ISO date (`YYYY-MM-DD`) of the latest touch. |
| `Section` | Single line of text | The section key the AXO landed in. |
| `UpdatedAt` | Single line of text | ISO timestamp of the last mirror write. |

Enable the mirror by setting `axoStatusListName` in `SP_CONFIG` (default
`'QAAxoStatus'`; set it to `''` to turn the feature off):

```js
const SP_CONFIG = {
  …
  axoStatusListName: 'QAAxoStatus'
};
```

On each Save in **Connected** mode, the tracker **upserts one row per AXO touched by
that endorsement** — it looks the AXO up by `AxoNumber`, merges the existing row if
found, otherwise creates one. Only changed AXOs are written, so the list stays current
with minimal writes, and it never deletes rows. The mirror is **best-effort**: if the
list is absent or a write fails, the endorsement still saves (you just get a small
toast). Demo (local) mode skips the mirror entirely.

Then build the scheduled flow:

1. Trigger: **Recurrence** — e.g. daily, or at each shift start.
2. Action: **Get items** from **`QAAxoStatus`** with the OData filter

   ```
   Status eq 'Urgent/High Prio'
   ```

   *(to also catch blockers, use `Status eq 'Urgent/High Prio' or Status eq 'Blocked'`).*
3. **Condition**: `length(body('Get_items')?['value'])` is greater than `0`.
4. If yes → **Compose** / **Select** a message listing the AXOs, for example:

   ```
   :rotating_light: Urgent / High Prio AXOs still open (2):
   • AXO 15099 — Password reset emails failing again in prod (Juan)
   • AXO 15277 — Audit log export, blocking release sign-off (Aisha)
   ```
5. **Post** that message to Slack (connector or Incoming Webhook).

Because the tracker keeps `QAAxoStatus` current on every save, the reminder always
reflects the latest statuses.

---

## 6. Branding & colours (ShipERP palette)

The chrome is re-skinned to match the real **ShipERP** product look, sampled from a
sibling ShipERP internal tool ("NPD Test File Drafter"). The brand palette is kept
as a **separate channel** from the semantic status colours. All values are CSS
custom properties at the top of `index.html` (`:root` and the two dark blocks) —
**edit them there** to adjust the brand.

### Logo (recreated, inline SVG)

The app-bar carries a recreated **ShipERP** lockup — **no external image**, crisp at
any size:

- an **isometric cube / open-box** icon in two-tone line-art (`<svg class="logo-mark">`:
  the `.box` body strokes in brand navy, the `.lid` in brand blue);
- the **"ShipERP"** wordmark — `Ship` in navy, `ERP` in brand blue;
- a short **amber underline** bar beneath the wordmark (the ShipERP accent);
- a thin vertical divider, then the **`NPD QA`** label (small, letter-spaced, muted).

### Palette — sampled from the ShipERP reference tool

| Token | Role | Light | Dark |
|---|---|---|---|
| `--brand` | brand **navy** — icon, "Ship" wordmark, headings/badges | `#2A3B5A` | `#AFC4E4` |
| `--brand-2` | brand **blue** — "ERP" wordmark, active tab, links, "Total" tile | `#2E6DB4` | `#6FA8E6` |
| `--brand-2-ink` | brand blue **ink** — link / tab / pill text (AA) | `#215C9E` | `#9BC4F0` |
| `--brand-orange` / `--accent` | ShipERP **amber** — logo underline, **primary buttons**, focus | `#F19305` | `#F5A623` |
| `--accent-ink` | amber text accent (numbers, "+ New" tab) (AA) | `#A15F02` | `#E0962A` |
| `--accent-fg` | **label on amber buttons** — deep warm ink | `#2A1A00` | `#2A1A00` |
| `--pill-bg` / `--pill-fg` | info / tag pill (light-blue bg, brand-blue text) | `#DDEBF8` / `#215C9E` | `#1E3A5A` / `#9BC4F0` |
| `--plane` | app background (light cool grey) | `#F3F5F7` | `#0F141B` |
| `--border` | card border / hairline (≈ `#E3E8EE`) | `rgba(34,48,79,.12)` | `rgba(255,255,255,.11)` |
| `--ok` | success / check green | `#1E8E52` | `#35B06E` |

**Source of these values:** sampled **from the ShipERP reference tool screenshot**
(the "NPD Test File Drafter" tool), **not the live site** — the live `shiperp.com`
was not used. Values were read off the image and refined for contrast. If the real
ShipERP brand hex values differ, replace the `--brand*` / `--accent*` tokens in
`index.html`; nothing else needs to change.

### Primary buttons — amber with a dark label (accessibility note)

The reference's amber primary button uses **white** text, which measures ≈ **2.4:1**
and **fails WCAG AA**. To stay on-brand *and* accessible, the amber primary buttons
here keep the signature amber fill but use a **deep warm ink label** (`#2A1A00`),
which measures ≈ **7:1 (light) / 8:1 (dark)** — a well-established amber-button
pattern.

### Contrast

All brand **text/surface** pairs were checked for **WCAG AA** in **both** light and
dark themes. Essential text (body, headings, links, active-tab text, pill text,
amber-button label, muted labels) meets **≥ 4.5:1**. The amber logo underline is a
**decorative** bar (not text). The semantic status colours are a reserved channel,
always shown with an **icon + label**, never colour-alone, and were kept **intact
and distinct**: *In Progress* was nudged to a cyan-azure (`#0E80C7`) so it does not
collide with the royal brand blue, and the brand amber is kept clear of the burnt
*Urgent/High Prio* orange. Status mapping: Blocked/violet, Failed/red, Passed/green,
Needs Monitoring/amber, Urgent/orange, In Progress/cyan-blue, Not Tested/grey.
