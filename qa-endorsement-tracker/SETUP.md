# QA Endorsement Tracker — SharePoint deployment

A single, self-contained `index.html` that reads and writes one shared SharePoint
list so the whole QA team edits one copy of the shift-endorsement log. No build
step, no dependencies, no CDNs — it runs offline from any SharePoint page.

Each shift handover is stored as **one list item**. The six handover sections are
kept as JSON in a single text column, so list setup is trivial and the structure is
preserved exactly.

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
| `Payload` | Multiple lines of plain text | `JSON.stringify` of the six sections. Set "Plain text" (not rich text / not append-only). |

Column **internal names must match** the names above (`ShiftDate`, `Shift`,
`QAResource`, `Payload`). SharePoint derives the internal name from the name you
type when the column is first created, so create them with exactly these names. If
a column already exists with a different internal name, recreate it or adjust the
`$select`/field names in `index.html`.

> The app never parses individual AXO columns on the server — all six sections live
> inside `Payload` as JSON. This keeps the list schema stable even if the handover
> format evolves.

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
