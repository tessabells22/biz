# QA Endorsement Tracker — SharePoint deployment

A single, self-contained `index.html` that reads and writes one shared SharePoint
list so the whole QA team edits one copy of the shift-endorsement log. No build
step, no dependencies, no CDNs — it runs offline from any SharePoint page.

The form mirrors the real Slack **"Endorsement of Tasks"** modal field-for-field
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
| `Payload` | Multiple lines of plain text | `JSON.stringify({ sections, fileRefs })` — all handover sections **plus** the "Needs Continuation Test File Upload" references. Set "Plain text" (not rich text / not append-only). |

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

The New/Edit Endorsement form, the Shift Log cards, and the "Copy latest as Slack"
output all use these labels **verbatim** from the Slack modal, in this order:

1. **Date** *(required to save)*
2. **QA Resource** *(required to save)* — plus an operational **Shift** selector
   (Day / Mid / Night) the tool adds for cross-shift ordering.
3. **Worked On during Shift and Status** — per-AXO lines, default status *In Progress*.
4. **Needs Monitoring for Develop/Deployment Server - (AXOs that are already in the
   canvass but hasn't been crossed out)** — default status *Needs Monitoring*.
5. **Needs Continuation Test File Upload** — file references (see below).
6. **Blocker Issue that needs Urgency (Include the affected AXO No. if any and the
   Title raised in Blocker for easy search)** — default status *Blocked*.
7. **Urgent and High Prio** — default status *Urgent/High Prio*.
8. **Not Yet Tested** — default status *Not Tested*.
9. **Non AXO Related but needs Attention - Regression, end-to-end ETC** — free-text
   lines, no AXO / no status column.

Every field is optional in Slack; the tool only requires **Date** and
**QA Resource** so each item can be labelled and ordered. Each AXO line carries a
per-AXO **status** dropdown (the tool's value-add) that defaults sensibly per
section and is fully overridable (Not Tested / In Progress / Needs Monitoring /
Urgent-High Prio / Blocked / Failed / Passed).

### File references ("Needs Continuation Test File Upload")

This environment is a static SharePoint-hosted page, so the field captures a **file
reference** per entry rather than performing a binary upload: a **file name/label**,
an **optional link** (paste the SharePoint/OneDrive/Drive URL of the file), and an
optional **note**. Entries support add/remove for multiple files. They are stored in
`Payload.fileRefs` and shown on the matching Shift Log card and in the Slack copy
under the same heading.

To attach the actual binary in Connected mode, upload the file to the site's
document library (or the list item's attachments via
`.../items(Id)/AttachmentFiles/add(FileName='..')`) and paste its URL into the link
field. A real in-page binary upload was intentionally left out to keep the page
dependency-free and the list schema a single text column; add it later against the
AttachmentFiles REST endpoint if required.

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
  siteUrl: '',                 // e.g. 'https://contoso.sharepoint.com/sites/QA'
  listName: 'QAEndorsements'
};
```

- **Leave `siteUrl` empty** when the file is hosted on a SharePoint page — the app
  auto-detects the site from `_spPageContextInfo.webAbsoluteUrl`.
- **Set `siteUrl`** to the absolute site URL only if auto-detect does not apply
  (for example, embedding where the page context is unavailable). Use the site URL
  *without* a trailing slash.
- Change `listName` only if you named the list something other than
  `QAEndorsements`.

The data layer uses standard SharePoint REST and works on SharePoint Online /
modern pages and classic:

- `GET  _api/web/lists/getbytitle('QAEndorsements')/items?$select=…&$top=5000&$orderby=ShiftDate desc`
- `POST _api/contextinfo` for a fresh form digest before every write
- `POST …/items` to add, `POST …/items(Id)` with `IF-MATCH:*` + `X-HTTP-Method:MERGE`
  to update, and `IF-MATCH:*` + `X-HTTP-Method:DELETE` to delete.

---

## 4. Permissions

The app inherits the user's SharePoint permissions on the list:

- **Contribute** (or higher) → can log new endorsements, edit, and delete.
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

## 6. Branding & colours (ShipERP palette)

The UI chrome uses a ShipERP-flavoured palette, kept as a **separate channel** from
the semantic status colours so brand blue never collides with the "In Progress"
status blue (`#2a78d6`, left untouched). All values are CSS custom properties at the
top of `index.html` (`:root` and the two dark blocks) — **edit them there** to
correct the brand.

| Token | Role | Light | Dark |
|---|---|---|---|
| `--brand` | primary deep blue — app-bar band, primary buttons, focus | `#0B4F8A` | `#1766A8` |
| `--brand-deep` | navy depth — app-bar gradient end | `#0A2E52` | `#0C1F38` |
| `--brand-2` | teal accent — active tab underline, logo, "Total" tile, links | `#0C8A90` | `#39C0C6` |
| `--brand-2-ink` | teal for link/active-tab text (AA) | `#0A6B70` | `#5FD0D4` |
| `--accent` | = `--brand` (primary buttons / key tiles) | `#0B4F8A` | `#2F84C9` |

**Source of these values:** the live site (`shiperp.com`) was **not reachable from
the build environment** (blocked by the network egress proxy), so these are a
documented **ShipERP-inspired fallback** — a deep professional blue + navy with a
complementary teal accent. If the real ShipERP brand hex values differ, replace the
`--brand*` / `--accent*` tokens above in `index.html`; nothing else needs to change.

All brand text/surface pairs were checked for **WCAG AA** (≥ 4.5:1 for normal text)
in **both** light and dark themes. The semantic status colours (Blocked/violet,
Failed/red, Passed/green, Needs Monitoring/amber, Urgent/orange, In Progress/blue,
Not Tested/grey) are a reserved channel, always shown with an icon + label, never
colour-alone.
