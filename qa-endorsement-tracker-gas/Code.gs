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
   source: SLACK_WEBHOOK_URL (required for posting), optional
   REMIND_INCLUDE_BLOCKED ('true'/'false'), DRIVE_FOLDER_ID
   (auto-managed). See README.md.
   ============================================================ */

/* ---------- constants ---------- */
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
  var date = String(values[colOf_('ShiftDate') - 1] || '');
  if (date.length > 10) date = date.slice(0, 10);
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

function apiAdd(model) {
  var sheet = ensureSheets_();
  model = model || {};
  var id = Utilities.getUuid();
  var now = new Date().toISOString();
  var row = [];
  row[colOf_('Id') - 1] = id;
  row[colOf_('ShiftDate') - 1] = model.shiftDate || '';
  row[colOf_('Shift') - 1] = model.shift || 'Day';
  row[colOf_('QAResource') - 1] = model.qaResource || '';
  row[colOf_('Payload') - 1] = payloadOf_(model);
  row[colOf_('CreatedAt') - 1] = now;
  row[colOf_('UpdatedAt') - 1] = now;
  sheet.appendRow(row);

  var saved = {
    id: id,
    shiftDate: model.shiftDate || '',
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
  sheet.getRange(rowIdx, colOf_('ShiftDate')).setValue(model.shiftDate || '');
  sheet.getRange(rowIdx, colOf_('Shift')).setValue(model.shift || 'Day');
  sheet.getRange(rowIdx, colOf_('QAResource')).setValue(model.qaResource || '');
  sheet.getRange(rowIdx, colOf_('Payload')).setValue(payloadOf_(model));
  sheet.getRange(rowIdx, colOf_('UpdatedAt')).setValue(now);
  // No auto-post on edit.
  return {
    id: String(id),
    shiftDate: model.shiftDate || '',
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
   DRIVE FILE UPLOAD
   Decode base64 → blob → save into the "NPD QA Test Files" folder,
   share ANYONE_WITH_LINK/VIEW, return { name, url }. Collisions on
   name are de-duplicated ("report.har" → "report (2).har").
   ============================================================ */
function apiUploadFile(name, mimeType, base64) {
  var folder = getUploadFolder_();
  var safeName = dedupeFileName(name || 'file', existingNames_(folder));
  var bytes = Utilities.base64Decode(base64 || '');
  var blob = Utilities.newBlob(bytes, mimeType || 'application/octet-stream', safeName);
  var file = folder.createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    // Sharing may be restricted by domain policy; the file still saves. Log and continue.
    Logger.log('setSharing failed for ' + safeName + ': ' + e);
  }
  return { name: safeName, url: file.getUrl() };
}

/* Get-or-create the uploads folder, remembering its id in Script Properties. */
function getUploadFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('DRIVE_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* stale id — fall through */ }
  }
  // Reuse an existing same-named folder if present, else create one.
  var it = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(DRIVE_FOLDER_NAME);
  props.setProperty('DRIVE_FOLDER_ID', folder.getId());
  return folder;
}

/* Set of file names already in a folder (for collision de-duplication). */
function existingNames_(folder) {
  var used = Object.create(null);
  var files = folder.getFiles();
  while (files.hasNext()) { used[files.next().getName()] = true; }
  return { has: function (n) { return !!used[n]; } };
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
   webhook is configured. NEVER throws — a failed post must not fail the save. */
function postToSlack_(text) {
  try {
    var url = getProp_('SLACK_WEBHOOK_URL');
    if (!url) { Logger.log('SLACK_WEBHOOK_URL not set — skipping Slack post.'); return false; }
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ text: text || '' }),
      muteHttpExceptions: true
    });
    return true;
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
   SCHEDULED REMINDER
   Derive every AXO's CURRENT status from all endorsements and, if any are
   Urgent/High Prio (plus Blocked when REMIND_INCLUDE_BLOCKED='true'), post a
   start-of-shift reminder. No-op (no spam) when none are open.
   ============================================================ */
function sendUrgentReminder() {
  var endorsements = readEndorsements_();
  var derived = deriveAxos(endorsements);
  var includeBlocked = String(getProp_('REMIND_INCLUDE_BLOCKED')).toLowerCase() === 'true';
  var wanted = { 'Urgent/High Prio': true };
  if (includeBlocked) wanted['Blocked'] = true;

  var open = derived.filter(function (a) { return wanted[a.current]; });
  if (!open.length) return false; // nothing open — don't spam

  var urgentGlyph = (STATUSES.filter(function (s) { return s.key === 'Urgent/High Prio'; })[0] || {}).glyph || '▲';
  var lines = [];
  lines.push(urgentGlyph + ' *Start-of-shift reminder — ' +
    (includeBlocked ? 'Urgent/High Prio & Blocked' : 'Urgent/High Prio') +
    ' AXOs still open (' + open.length + '):*');
  open.forEach(function (a) {
    var last = a.history[a.history.length - 1] || {};
    var note = last.note ? ' — ' + last.note : '';
    var who = a.lastQA ? ' (' + a.lastQA + ')' : '';
    var stat = a.current === 'Blocked' ? ' [Blocked]' : '';
    lines.push('• AXO ' + a.axo + note + who + stat);
  });
  postToSlack_(lines.join('\n'));
  return true;
}

/* ============================================================
   TRIGGERS
   Three daily time-based triggers at the shift starts. The manifest timeZone is
   Asia/Manila, so atHour is local PHT: 5 AM (Day), 1 PM (Mid), 10 PM (Night).
   Run this once from the editor (authorize when prompted).
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
  { key:'Not Tested',        token:'--st-nottested',  glyph:'○' },
  { key:'In Progress',       token:'--st-inprogress', glyph:'◐' },
  { key:'Needs Monitoring',  token:'--st-monitoring', glyph:'◉' },
  { key:'Urgent/High Prio',  token:'--st-urgent',     glyph:'▲' },
  { key:'Blocked',           token:'--st-blocked',    glyph:'■' },
  { key:'Failed',            token:'--st-failed',     glyph:'✕' },
  { key:'Passed',            token:'--st-passed',     glyph:'✓' }
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
  'Not Tested':       'notTested',
  'In Progress':      'workedOn',
  'Passed':           'workedOn',
  'Failed':           'workedOn',
  'Needs Monitoring': 'needsMonitoring',
  'Urgent/High Prio': 'urgent',
  'Blocked':          'blocker'
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
    Object.keys(sectionTitleByKey).forEach(function(secKey){
      var rows = Array.isArray(sections[secKey]) ? sections[secKey] : [];
      rows.forEach(function(r){
        if (!r || r.axo === undefined || r.axo === null) return;
        var axo = String(r.axo).trim();
        if (!axo) return;
        if (!map[axo]) { map[axo] = []; order.push(axo); }
        map[axo].push({
          axo: axo,
          date: e.shiftDate,
          shift: e.shift,
          qaResource: e.qaResource || '',
          section: sectionTitleByKey[secKey],
          sectionKey: secKey,
          note: r.note || '',
          status: r.status || 'Not Tested',
          _date: e.shiftDate,
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
  var urgentGlyph = (STATUSES.filter(function(s){ return s.key === 'Urgent/High Prio'; })[0] || {}).glyph || '▲';
  var lines = [];
  lines.push('*' + prefix + 'New QA Endorsement — ' + model.shiftDate + ' · ' + model.shift + ' · ' + model.qaResource + '*');
  var urgent = urgentRowsOf(model);
  if (urgent.length){
    lines.push(urgentGlyph + ' *Urgent / High Prio (' + urgent.length + '):*');
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

/* De-duplicate a file name against a used-set ("report.har" → "report (2).har"). */
function dedupeFileName(name, used){
  if (!used.has(name)) return name;
  var dot = name.lastIndexOf('.');
  var base = dot > 0 ? name.slice(0, dot) : name;
  var ext  = dot > 0 ? name.slice(dot) : '';
  var i = 2, cand;
  do { cand = base + ' (' + i + ')' + ext; i++; } while (used.has(cand));
  return cand;
}
