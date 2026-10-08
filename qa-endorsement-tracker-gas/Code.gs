/* ============================================================
   NPD QA Endorsement Tracker — Google Apps Script backend
   ------------------------------------------------------------
   Container-bound script (created from the Google Sheet via
   Extensions > Apps Script) so SpreadsheetApp.getActive() works.

   Responsibilities:
     • doGet()        — serve index.html (HtmlService Web App)
     • apiList/Add/Update/Remove — Google Sheet CRUD
     • apiUploadFile  — Drive uploads (returns a shareable link)
     • Slack          — server-side auto-post on every add
     • Reminders      — native time triggers at each shift start

   Config lives in Script Properties (Project Settings), never in
   source:
     • SLACK_WEBHOOK_URL     — required for posting (Slack Incoming Webhook URL)
     • REMIND_INCLUDE_BLOCKED — 'true'/'false' (default false): also treat
       Blocked AXOs as open in the shift reminder.
     • REMIND_WHEN_EMPTY     — 'true'/'false' (DEFAULT TRUE): post a short
       all-clear heartbeat when no Urgent/High Prio (or Blocked) AXOs are open.
       Set to 'false' to stay silent on an empty shift.
     • DRIVE_FOLDER_ID       — auto-managed.
   See README.md.
   ============================================================ */

/* ---------- constants ---------- */
var BUILD = '2026-10-08.4'; // kept in step with the clients' BUILD stamp
var SHEET_NAME = 'Endorsements';
var HEADERS = ['Id', 'ShiftDate', 'Shift', 'QAResource', 'Payload', 'CreatedAt', 'UpdatedAt'];
var DRIVE_FOLDER_NAME = 'NPD QA Test Files';

/* ============================================================
   WEB APP ENTRY POINT
   ============================================================ */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('NPD QA Endorsement Tracker')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ============================================================
   SHEET BOOTSTRAP
   Creates the Endorsements tab + header row if missing. Called at
   the start of every api function so a fresh Sheet just works.
   ============================================================ */
function ensureSheets_() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  var firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  var hasHeader = firstRow.join('') === HEADERS.join('');
  if (!hasHeader) {
    // Only (re)write the header when row 1 is empty or wrong; never clobber data rows.
    var topLeft = String(firstRow[0] || '');
    if (sheet.getLastRow() === 0 || topLeft !== 'Id') {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

/* Column index (1-based) of a header name. */
function colOf_(name) {
  var i = HEADERS.indexOf(name);
  return i < 0 ? -1 : i + 1;
}

/* ============================================================
   CRUD
   ============================================================ */

/* The script's timezone (Asia/Manila per the manifest), used to resolve a Sheet
   Date cell to the calendar day the team actually meant. */
function scriptTimeZone_() {
  try { return Session.getScriptTimeZone() || 'Asia/Manila'; } catch (e) { return 'Asia/Manila'; }
}

/* Coerce whatever the ShiftDate cell yields into a canonical 'YYYY-MM-DD' before
   it ever reaches the client. getValues() returns a real Date object when Sheets
   has coerced the text to a date (which String()+slice would mangle into e.g.
   "Wed Oct 07" and break date comparison); format such a Date in the script
   timezone so the calendar day is stable. A string that already begins with a
   'YYYY-MM-DD' passes through (timezone-free); anything else is parsed as a last
   resort, and empties stay empty. */
function coerceSheetDate_(value) {
  if (value === null || value === undefined || value === '') return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) return '';
    return Utilities.formatDate(value, scriptTimeZone_(), 'yyyy-MM-dd');
  }
  var s = String(value).trim();
  if (!s) return '';
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  var d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, scriptTimeZone_(), 'yyyy-MM-dd');
  return '';
}

/* Parse one sheet row object into an endorsement model, mirroring the client's
   spToModel: Payload JSON holds { sections, fileRefs }; legacy top-level sections
   are still read. Ensures every section key is an array. */
function rowToModel_(values) {
  var payload = {};
  try { payload = JSON.parse(values[colOf_('Payload') - 1] || '{}'); } catch (e) { payload = {}; }
  var sections = (payload && typeof payload.sections === 'object' && payload.sections) ? payload.sections : payload;
  if (!sections || typeof sections !== 'object') sections = {};
  var fileRefs = Array.isArray(payload && payload.fileRefs) ? payload.fileRefs : [];
  SECTIONS.forEach(function (s) { if (!Array.isArray(sections[s.key])) sections[s.key] = []; });
  var date = coerceSheetDate_(values[colOf_('ShiftDate') - 1]);
  return {
    id: String(values[colOf_('Id') - 1] || ''),
    shiftDate: date,
    shift: String(values[colOf_('Shift') - 1] || 'Day'),
    qaResource: String(values[colOf_('QAResource') - 1] || ''),
    sections: sections,
    fileRefs: fileRefs
  };
}

/* Read every endorsement model from the sheet (data rows only). */
function readEndorsements_() {
  var sheet = ensureSheets_();
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var values = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
  return values.map(rowToModel_);
}

/* Serialize a model's sections + fileRefs into the Payload JSON string. */
function payloadOf_(model) {
  return JSON.stringify({ sections: (model && model.sections) || {}, fileRefs: (model && model.fileRefs) || [] });
}

function apiList() {
  return readEndorsements_();
}

/* Pin the ShiftDate cell to plain-text format and (re)write the canonical string,
   so Sheets cannot auto-coerce 'YYYY-MM-DD' into a locale/serial Date that would
   later round-trip wrong and break the current-status date comparison. */
function writeShiftDateAsText_(sheet, rowIdx, sd) {
  var cell = sheet.getRange(rowIdx, colOf_('ShiftDate'));
  cell.setNumberFormat('@'); // plain text — never a date serial
  cell.setValue(sd || '');
}

function apiAdd(model) {
  var sheet = ensureSheets_();
  model = model || {};
  var id = Utilities.getUuid();
  var now = new Date().toISOString();
  var sd = coerceSheetDate_(model.shiftDate); // canonical 'YYYY-MM-DD' (or '')
  var row = [];
  row[colOf_('Id') - 1] = id;
  row[colOf_('ShiftDate') - 1] = sd;
  row[colOf_('Shift') - 1] = model.shift || 'Day';
  row[colOf_('QAResource') - 1] = model.qaResource || '';
  row[colOf_('Payload') - 1] = payloadOf_(model);
  row[colOf_('CreatedAt') - 1] = now;
  row[colOf_('UpdatedAt') - 1] = now;
  sheet.appendRow(row);
  writeShiftDateAsText_(sheet, sheet.getLastRow(), sd); // keep ShiftDate plain text

  var saved = {
    id: id,
    shiftDate: sd,
    shift: model.shift || 'Day',
    qaResource: model.qaResource || '',
    sections: model.sections || {},
    fileRefs: model.fileRefs || []
  };

  // Fire the Slack alert for EVERY add (never let a post failure fail the save).
  sendNewEndorsementAlert_(saved);
  return saved;
}

function apiUpdate(id, model) {
  var sheet = ensureSheets_();
  model = model || {};
  var rowIdx = findRowById_(sheet, id);
  if (rowIdx < 0) throw new Error('Endorsement not found: ' + id);
  var now = new Date().toISOString();
  var sd = coerceSheetDate_(model.shiftDate); // canonical 'YYYY-MM-DD' (or '')
  writeShiftDateAsText_(sheet, rowIdx, sd);     // keep ShiftDate plain text
  sheet.getRange(rowIdx, colOf_('Shift')).setValue(model.shift || 'Day');
  sheet.getRange(rowIdx, colOf_('QAResource')).setValue(model.qaResource || '');
  sheet.getRange(rowIdx, colOf_('Payload')).setValue(payloadOf_(model));
  sheet.getRange(rowIdx, colOf_('UpdatedAt')).setValue(now);
  // No auto-post on edit.
  return {
    id: String(id),
    shiftDate: sd,
    shift: model.shift || 'Day',
    qaResource: model.qaResource || '',
    sections: model.sections || {},
    fileRefs: model.fileRefs || []
  };
}

function apiRemove(id) {
  var sheet = ensureSheets_();
  var rowIdx = findRowById_(sheet, id);
  if (rowIdx < 0) return true; // already gone
  sheet.deleteRow(rowIdx);
  return true;
}

/* 1-based sheet row for a given Id, or -1. */
function findRowById_(sheet, id) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var ids = sheet.getRange(2, colOf_('Id'), last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

/* ============================================================
   DRIVE FILE UPLOAD — via the Drive REST API v3 (NOT the built-in Drive service)
   ------------------------------------------------------------
   Apps Script's built-in Drive service write methods (createFolder/createFile)
   require the BROAD https://www.googleapis.com/auth/drive scope, which we
   deliberately do NOT request. The Drive REST API, called with the script's own
   OAuth token (ScriptApp.getOAuthToken()), honors the NARROW
   https://www.googleapis.com/auth/drive.file scope — per-file access to the
   files this app creates. So every Drive operation here is a plain
   UrlFetchApp.fetch with an Authorization: Bearer header. No broad-scope service,
   and no advanced/enabled service required.
   ============================================================ */

/* Shared bearer header for Drive REST calls. */
function driveAuthHeader_() {
  return { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
}

/* Get-or-create the uploads folder, remembering its id in Script Properties.
   NEVER does a name search (that needs the broad drive scope). Under drive.file
   we verify/reuse the cached id, else create a fresh app-owned folder and cache
   its id. */
function getOrCreateUploadFolderId_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('DRIVE_FOLDER_ID');
  if (id) {
    try {
      var verify = UrlFetchApp.fetch(
        'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) +
          '?fields=id,trashed&supportsAllDrives=true',
        { method: 'get', headers: driveAuthHeader_(), muteHttpExceptions: true });
      if (verify.getResponseCode() === 200) {
        var info = JSON.parse(verify.getContentText() || '{}');
        if (info && info.id && !info.trashed) return info.id; // reuse the cached folder
      }
    } catch (e) {
      // fall through and create a fresh folder
    }
  }
  var createRes = UrlFetchApp.fetch(
    'https://www.googleapis.com/drive/v3/files?fields=id',
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
      headers: driveAuthHeader_(),
      muteHttpExceptions: true
    });
  if (createRes.getResponseCode() < 200 || createRes.getResponseCode() >= 300) {
    throw new Error('Could not create Drive folder (HTTP ' + createRes.getResponseCode() + '): ' + createRes.getContentText());
  }
  var folder = JSON.parse(createRes.getContentText() || '{}');
  if (!folder.id) throw new Error('Drive folder create returned no id: ' + createRes.getContentText());
  props.setProperty('DRIVE_FOLDER_ID', folder.id);
  return folder.id;
}

/* Upload one file (base64) into the uploads folder via a multipart Drive REST
   call, make it viewable by link, and return { name, url }. Throws a clean Error
   on a hard upload failure (the client surfaces it as a toast without losing the
   endorsement). */
function apiUploadFile(name, mimeType, base64) {
  name = name || 'file';
  mimeType = mimeType || 'application/octet-stream';
  base64 = base64 || '';
  var folderId = getOrCreateUploadFolderId_();

  // multipart/related upload — base64 content-transfer-encoding avoids any binary
  // concatenation in the request body.
  var boundary = '-------npdqa' + Date.now();
  var meta = { name: name, mimeType: mimeType, parents: [folderId] };
  var body =
    '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(meta) +
    '\r\n--' + boundary + '\r\nContent-Type: ' + mimeType +
    '\r\nContent-Transfer-Encoding: base64\r\n\r\n' +
    base64 +
    '\r\n--' + boundary + '--';

  var uploadRes = UrlFetchApp.fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,name',
    {
      method: 'post',
      contentType: 'multipart/related; boundary=' + boundary,
      payload: body,
      headers: driveAuthHeader_(),
      muteHttpExceptions: true
    });
  if (uploadRes.getResponseCode() < 200 || uploadRes.getResponseCode() >= 300) {
    throw new Error('Upload failed (HTTP ' + uploadRes.getResponseCode() + '): ' + uploadRes.getContentText());
  }
  var result = JSON.parse(uploadRes.getContentText() || '{}');
  var fileId = result.id;
  if (!fileId) throw new Error('Upload returned no file id: ' + uploadRes.getContentText());

  // Share view-by-link. If this fails (e.g. domain policy), don't fail the whole
  // upload — the owner can still share manually. Log and continue.
  try {
    var permRes = UrlFetchApp.fetch(
      'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '/permissions',
      {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ role: 'reader', type: 'anyone' }),
        headers: driveAuthHeader_(),
        muteHttpExceptions: true
      });
    if (permRes.getResponseCode() < 200 || permRes.getResponseCode() >= 300) {
      Logger.log('permissions set failed for ' + name + ' (HTTP ' + permRes.getResponseCode() + '): ' + permRes.getContentText());
    }
  } catch (e) {
    Logger.log('permissions set threw for ' + name + ': ' + e);
  }

  return {
    name: result.name || name,
    url: result.webViewLink || ('https://drive.google.com/file/d/' + fileId + '/view')
  };
}

/* ============================================================
   CONFIG (Script Properties)
   ============================================================ */
function getProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

/* Helper to set the Slack webhook from the editor (run once, or set it in
   Project Settings > Script Properties). */
function setConfig(webhookUrl) {
  PropertiesService.getScriptProperties().setProperty('SLACK_WEBHOOK_URL', String(webhookUrl || '').trim());
  return 'SLACK_WEBHOOK_URL set.';
}

/* ============================================================
   SLACK (server-side, UrlFetchApp — no CORS, secret stays server-side)
   ============================================================ */

/* Post plain text to the configured Slack Incoming Webhook. No-op (logs) when no
   webhook is configured. NEVER throws — a failed post must not fail the save.
   Logs the HTTP response code to the Executions tab and returns it (a truthy
   number, e.g. 200) on a completed POST, or false when skipped/errored. */
function postToSlack_(text) {
  try {
    var url = getProp_('SLACK_WEBHOOK_URL');
    if (!url) { Logger.log('Slack: SLACK_WEBHOOK_URL not set — skipping Slack post.'); return false; }
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ text: text || '' }),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    Logger.log('Slack: POST response code ' + code +
      (code === 200 ? ' (ok)' : ' — ' + res.getContentText()));
    return code;
  } catch (e) {
    Logger.log('postToSlack_ failed: ' + e);
    return false;
  }
}

/* Auto-post on add — identical content to the client's buildSlackAlert. */
function sendNewEndorsementAlert_(model) {
  try {
    postToSlack_(buildSlackAlert(model));
  } catch (e) {
    Logger.log('sendNewEndorsementAlert_ failed: ' + e);
  }
}

/* ============================================================
   SCHEDULED REMINDER  (handler for the shift-start time triggers)
   Derives every AXO's CURRENT status from all endorsements and posts a
   start-of-shift HEARTBEAT to Slack on EVERY scheduled run:
     • if any AXOs are currently Urgent/High Prio (plus Blocked when
       REMIND_INCLUDE_BLOCKED='true'), it posts the list;
     • if NONE are open, it posts a short all-clear line instead of staying
       silent — so a quiet shift still confirms the schedule is alive.
   The all-clear is gated by Script Property REMIND_WHEN_EMPTY, which DEFAULTS
   TO TRUE: the all-clear posts unless REMIND_WHEN_EMPTY is explicitly set to
   the string 'false'. Set it to 'false' only if you truly want silence on an
   empty shift (then this behaves like the old no-op).
   Always logs diagnostics to the Executions tab (counts, whether the webhook
   is configured, the Slack POST response code) and NEVER throws — a failed
   post or read is logged, not raised, so a trigger run is never left red for a
   transient Slack/Sheet hiccup.
   ============================================================ */
function sendUrgentReminder() {
  try {
    var endorsements = readEndorsements_();
    var derived = deriveAxos(endorsements);
    var includeBlocked = String(getProp_('REMIND_INCLUDE_BLOCKED')).toLowerCase() === 'true';
    // REMIND_WHEN_EMPTY defaults to TRUE — only the exact string 'false' silences the all-clear.
    var remindWhenEmpty = String(getProp_('REMIND_WHEN_EMPTY')).toLowerCase() !== 'false';

    var wanted = { 'Urgent/High Prio': true };
    if (includeBlocked) wanted['Blocked'] = true;
    var open = derived.filter(function (a) { return wanted[a.current]; });

    var urgentCount = derived.filter(function (a) { return a.current === 'Urgent/High Prio'; }).length;
    var blockedCount = derived.filter(function (a) { return a.current === 'Blocked'; }).length;
    var webhookSet = !!getProp_('SLACK_WEBHOOK_URL');

    Logger.log('sendUrgentReminder: Urgent/High Prio=' + urgentCount +
      (includeBlocked ? (', Blocked=' + blockedCount + ' (included)') : (', Blocked=' + blockedCount + ' (not included)')) +
      ', open total=' + open.length +
      ', REMIND_WHEN_EMPTY=' + remindWhenEmpty +
      ', SLACK_WEBHOOK_URL ' + (webhookSet ? 'configured' : 'MISSING'));

    var text;
    if (open.length) {
      var lines = [];
      lines.push('🚨 *Start-of-shift reminder — ' +
        (includeBlocked ? 'Urgent/High Prio & Blocked' : 'Urgent/High Prio') +
        ' AXOs still open (' + open.length + '):*');
      open.forEach(function (a) {
        var last = a.history[a.history.length - 1] || {};
        var note = last.note ? ' — ' + last.note : '';
        var who = a.lastQA ? ' (' + a.lastQA + ')' : '';
        var stat = a.current === 'Blocked' ? ' [Blocked]' : '';
        lines.push('• AXO ' + a.axo + note + who + stat);
      });
      text = lines.join('\n');
    } else {
      if (!remindWhenEmpty) {
        Logger.log('sendUrgentReminder: nothing open and REMIND_WHEN_EMPTY=false — staying silent.');
        return false;
      }
      text = '✅ *Start-of-shift check — No ' +
        (includeBlocked ? 'Urgent/High Prio or Blocked' : 'Urgent/High Prio') +
        ' AXOs right now.*';
    }

    var code = postToSlack_(text);
    Logger.log('sendUrgentReminder: ' + (open.length ? ('posted ' + open.length + ' open AXO(s)') : 'posted all-clear') +
      '; postToSlack_ returned ' + code +
      (webhookSet ? '' : ' (no webhook configured — nothing was sent)'));
    return true;
  } catch (e) {
    Logger.log('sendUrgentReminder failed: ' + e + (e && e.stack ? ('\n' + e.stack) : ''));
    return false;
  }
}

/* ============================================================
   TRIGGERS
   Installs exactly three daily time-based triggers at the shift starts, all
   calling sendUrgentReminder. The manifest timeZone is Asia/Manila, so atHour
   is local PHT: 5 AM (Day), 1 PM (Mid), 10 PM (Night). Idempotent — it deletes
   any existing sendUrgentReminder triggers first, so re-running never stacks
   duplicates.

   IMPORTANT: time-based triggers always run the LATEST SAVED project code — you
   do NOT need to redeploy the Web App after editing Code.gs for the reminder to
   pick up changes; just Save. You only need to run setupShiftReminders() again
   if the three triggers are missing (e.g. none were ever installed, or they
   were deleted in the Triggers page). Changing a Script Property
   (REMIND_WHEN_EMPTY / REMIND_INCLUDE_BLOCKED / SLACK_WEBHOOK_URL) also takes
   effect immediately with no redeploy and no re-run of this function.
   ============================================================ */
function setupShiftReminders() {
  // Remove any existing triggers for sendUrgentReminder first (idempotent).
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendUrgentReminder') ScriptApp.deleteTrigger(t);
  });
  [5, 13, 22].forEach(function (h) {
    ScriptApp.newTrigger('sendUrgentReminder').timeBased().everyDays(1).atHour(h).create();
  });
  return 'Installed shift-start reminders at 5 AM / 1 PM / 10 PM PHT.';
}

/* ============================================================
   PURE LOGIC — COPIED VERBATIM from index.html so the server and
   client produce IDENTICAL Slack text and status derivation.
   (Keep these in sync with the client's PURE LOGIC block.)
   ============================================================ */
var STATUSES = [
  { key:'Not Tested',                   token:'--st-nottested',      glyph:'○' },
  { key:'In Progress',                  token:'--st-inprogress',     glyph:'◐' },
  { key:'Passed - Initial',             token:'--st-passed-initial', glyph:'↗' },
  { key:'Passed - Develop/Deployment',  token:'--st-passed',         glyph:'✓' },
  { key:'Failed - Initial',             token:'--st-failed',         glyph:'✕' },
  { key:'Failed - Develop/Deployment',  token:'--st-failed',         glyph:'✕' },
  { key:'Needs Monitoring',             token:'--st-monitoring',     glyph:'◉' },
  { key:'Urgent/High Prio',             token:'--st-urgent',         glyph:'▲' },
  { key:'Blocked',                      token:'--st-blocked',        glyph:'■' },
  /* Legacy values — still RECOGNIZED but no longer offered in the entry builder. */
  { key:'Failed',                       token:'--st-failed',         glyph:'✕', legacy:true },
  { key:'Passed',                       token:'--st-passed',         glyph:'✓', legacy:true }
];

var SECTIONS = [
  { key:'workedOn', num:3, axo:true, defaultStatus:'In Progress',
    title:'Worked On during Shift and Status',
    lead:'Worked On during Shift and Status', hint:'' },
  { key:'needsMonitoring', num:4, axo:true, defaultStatus:'Needs Monitoring',
    title:"Needs Monitoring for Develop/Deployment Server - (AXOs that are already in the canvass but hasn't been crossed out)",
    lead:'Needs Monitoring for Develop/Deployment Server',
    hint:"AXOs that are already in the canvass but hasn't been crossed out" },
  { key:'blocker', num:6, axo:true, defaultStatus:'Blocked',
    title:'Blocker Issue that needs Urgency (Include the affected AXO No. if any and the Title raised in Blocker for easy search)',
    lead:'Blocker Issue that needs Urgency',
    hint:'Include the affected AXO No. if any and the Title raised in Blocker for easy search' },
  { key:'urgent', num:7, axo:true, defaultStatus:'Urgent/High Prio',
    title:'Urgent and High Prio',
    lead:'Urgent and High Prio', hint:'' },
  { key:'notTested', num:8, axo:true, defaultStatus:'Not Tested',
    title:'Not Yet Tested',
    lead:'Not Yet Tested', hint:'' },
  { key:'nonAxo', num:9, axo:false,
    title:'Non AXO Related but needs Attention - Regression, end-to-end ETC',
    lead:'Non AXO Related but needs Attention', hint:'Regression, end-to-end ETC' }
];

var FILE_FIELD = {
  num:5,
  title:'Needs Continuation Test File Upload',
  lead:'Needs Continuation Test File Upload',
  hint:'Hand off the file(s) the next shift should keep testing — drag in or choose files to upload, or paste a link. Add an optional note to each.'
};

function defaultStatusFor(sectionKey){
  var s = SECTIONS.filter(function(x){ return x.key === sectionKey; })[0];
  return (s && s.defaultStatus) || 'Not Tested';
}

var AXO_SECTION_KEYS = SECTIONS.filter(function(s){ return s.axo; }).map(function(s){ return s.key; });

var STATUS_SECTION = {
  'Not Tested':                  'notTested',
  'In Progress':                 'workedOn',
  'Passed - Initial':            'workedOn',
  'Passed - Develop/Deployment': 'workedOn',
  'Failed - Initial':            'workedOn',
  'Failed - Develop/Deployment': 'workedOn',
  'Passed':                      'workedOn',  // legacy
  'Failed':                      'workedOn',  // legacy
  'Needs Monitoring':            'needsMonitoring',
  'Urgent/High Prio':            'urgent',
  'Blocked':                     'blocker'
};
function sectionForStatus(status){
  return STATUS_SECTION[status] || 'workedOn';
}

function normalizeFileRef(r){
  if (!r || typeof r !== 'object') return null;
  var name = r.name || '';
  var note = r.note || '';
  if (r.kind === 'attachment') return { kind:'attachment', name:name, note:note };
  if (r.kind === 'data')       return { kind:'data', name:name, note:note, dataUrl: r.dataUrl || '' };
  return { kind:'link', name:name, url: r.url || '', note:note };
}

function fileRefsOf(e){
  return (Array.isArray(e && e.fileRefs) ? e.fileRefs : []).map(normalizeFileRef).filter(Boolean);
}

function shiftRank(shift){
  return shift === 'Day' ? 0 : shift === 'Mid' ? 1 : shift === 'Night' ? 2 : 3;
}

/* Zero-pad y/m/d into a canonical 'YYYY-MM-DD' string. */
function isoDay_(y, mo, da){
  return y + '-' + (mo < 10 ? '0' : '') + mo + '-' + (da < 10 ? '0' : '') + da;
}

/* Normalize ANY ShiftDate representation to a canonical, lexicographically
   sortable 'YYYY-MM-DD' calendar day — whether the value arrives as a plain
   'YYYY-MM-DD' string, an ISO datetime with a Z or +08:00 offset, a Date object,
   or a locale string. The SAME normalized value feeds both the displayed date
   and the sort key, so the timeline and the ordering can never disagree. For any
   string that begins with a 'YYYY-MM-DD' we take that literal day (timezone-free,
   so an offset can never flip the calendar date). An unparseable value becomes ''
   which sorts before every real date and can never silently equal one.
   (Kept in parity with the clients' PURE LOGIC normDate.) */
function normDate(v){
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]'){
    if (isNaN(v.getTime())) return '';
    return isoDay_(v.getFullYear(), v.getMonth() + 1, v.getDate());
  }
  var s = String(v).trim();
  if (!s) return '';
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  var d = new Date(s);
  if (!isNaN(d.getTime())) return isoDay_(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return '';
}

/* Aggregate every AXO entry across all endorsements, group by AXO number,
   sort chronologically. Current status = most recent entry's status. */
function deriveAxos(endorsements){
  var sectionTitleByKey = {};
  SECTIONS.forEach(function(s){ if (s.axo) sectionTitleByKey[s.key] = s.title; });

  var map = {};
  var order = [];
  var push = 0;
  var list = endorsements.map(function(e, i){ return { e:e, seq: (typeof e._seq === 'number' ? e._seq : i) }; });

  list.forEach(function(entry){
    var e = entry.e, seq = entry.seq;
    var sections = e.sections || {};
    var nd = normDate(e.shiftDate); // canonical day — drives BOTH display and sort
    Object.keys(sectionTitleByKey).forEach(function(secKey){
      var rows = Array.isArray(sections[secKey]) ? sections[secKey] : [];
      rows.forEach(function(r){
        if (!r || r.axo === undefined || r.axo === null) return;
        var axo = String(r.axo).trim();
        if (!axo) return;
        if (!map[axo]) { map[axo] = []; order.push(axo); }
        map[axo].push({
          axo: axo,
          date: nd,
          shift: e.shift,
          qaResource: e.qaResource || '',
          section: sectionTitleByKey[secKey],
          sectionKey: secKey,
          note: r.note || '',
          status: r.status || 'Not Tested',
          _date: nd,
          _shift: shiftRank(e.shift),
          _seq: seq,
          _ord: push++
        });
      });
    });
  });

  var out = [];
  order.forEach(function(axo){
    var steps = map[axo];
    steps.sort(function(a, b){
      if (a._date !== b._date) return a._date < b._date ? -1 : 1;
      if (a._shift !== b._shift) return a._shift - b._shift;
      if (a._seq !== b._seq) return a._seq - b._seq;
      return a._ord - b._ord;
    });
    var last = steps[steps.length - 1];
    out.push({
      axo: axo,
      current: last.status,
      lastDate: last.date,
      lastShift: last.shift,
      lastQA: last.qaResource,
      touches: steps.length,
      history: steps
    });
  });
  out.sort(function(a, b){
    if (a.lastDate !== b.lastDate) return a.lastDate < b.lastDate ? 1 : -1;
    return shiftRank(b.lastShift) - shiftRank(a.lastShift);
  });
  return out;
}

/* Count AXO lines per section, plus non-AXO notes and file references. */
function sectionCounts(model){
  var s = (model && model.sections) || {};
  var c = {};
  SECTIONS.forEach(function(sec){ c[sec.key] = Array.isArray(s[sec.key]) ? s[sec.key].length : 0; });
  c.files = fileRefsOf(model).length;
  return c;
}

/* The Urgent/High Prio AXO rows in this endorsement (by status, across all AXO sections). */
function urgentRowsOf(model){
  var s = (model && model.sections) || {};
  var out = [];
  AXO_SECTION_KEYS.forEach(function(key){
    (Array.isArray(s[key]) ? s[key] : []).forEach(function(r){
      if (r && r.status === 'Urgent/High Prio') out.push(r);
    });
  });
  return out;
}

/* Concise "new endorsement added" alert for the auto-post. */
function buildSlackAlert(model, opts){
  if (!model) return '';
  var prefix = (opts && opts.updated) ? '(updated) ' : '';
  var lines = [];
  lines.push('📋 *' + prefix + 'New QA Endorsement — ' + model.shiftDate + ' · ' + model.shift + ' · ' + model.qaResource + '*');
  var urgent = urgentRowsOf(model);
  if (urgent.length){
    lines.push('🚨 *Urgent / High Prio (' + urgent.length + '):*');
    urgent.forEach(function(r){ lines.push('• AXO ' + (r.axo || '—') + (r.note ? ' — ' + r.note : '')); });
  }
  var c = sectionCounts(model);
  lines.push('_' + [
    'Worked On ' + c.workedOn,
    'Needs Monitoring ' + c.needsMonitoring,
    'Blocker ' + c.blocker,
    'Urgent/High Prio ' + c.urgent,
    'Not Tested ' + c.notTested,
    'Non-AXO ' + c.nonAxo,
    'Files ' + c.files
  ].join(' · ') + '_');
  return lines.join('\n').trim();
}
