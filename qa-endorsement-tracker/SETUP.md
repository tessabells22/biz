# NPD QA Endorsement Tracker — SharePoint deployment

A single, self-contained `index.html` that reads and writes one shared SharePoint
list so the whole NPD QA team edits one copy of the shift-endorsement log. No build
step, no dependencies, no CDNs — it runs offline from any SharePoint page.

> **Branding:** the chrome is re-skinned to the real **ShipERP** look (light app
> bar, recreated inline-SVG **ShipERP** logo with an amber underline and the
> **NPD QA** label) and the product is named **NPD QA Endorsement Tracker**. The
> verbatim Slack field **`QA Resource`** is unchanged. See §6.

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
