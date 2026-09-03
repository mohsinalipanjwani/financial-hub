/**
 * Financial Hub — auto-create a Payments row when a Revenue row is marked Paid.
 *
 * WHY THIS LIVES IN THE SHEET (not the app):
 * The Financial Hub sync is one-directional (Sheets -> DB). The app never writes
 * back to the sheet, so the "paid -> payment" automation has to run inside the
 * spreadsheet. This bound Apps Script watches the Revenue tab's "Payment Status"
 * column; when a row becomes "Paid", it upserts a matching row in the Payments
 * tab. The next Financial Hub sync ingests that payment like any other, and
 * invoice reconciliation (recalcInvoicePayments) picks it up automatically.
 *
 * IDEMPOTENT BY DESIGN:
 * Each auto-payment uses a deterministic key `PAY-<Revenue ID>`. Re-marking a row
 * paid updates the same Payments row instead of creating a duplicate, and the
 * app's sync (which upserts payments by "Payment ID") stays clean.
 *
 * SETUP:
 *   1. In the spreadsheet: Extensions -> Apps Script.
 *   2. Paste this file's contents, Save.
 *   3. Run `installTrigger` once (authorize when prompted). This installs an
 *      onEdit trigger that can write to other tabs (a simple onEdit cannot).
 *   4. Optional first pass: menu "Financial Hub" -> "Rebuild payments from paid
 *      revenue" backfills payments for rows already marked Paid.
 */

// ---- Config -----------------------------------------------------------------

var CONFIG = {
  revenueSheet: "Revenue",
  paymentsSheet: "Payments",
  paidValue: "paid",          // Revenue "Payment Status" value that triggers a payment (case-insensitive)
  autoIdPrefix: "PAY-",       // Payment ID = autoIdPrefix + Revenue ID
  paymentStatusValue: "Cleared", // written to the Payments "Status" column
  autoNote: "Auto-created from paid revenue",
  removeOnUnpay: true,        // if a paid row is later set to non-paid, delete the auto payment
};

// Header names must match the app's DEFAULT_MAPPINGS (src/lib/sync/mapping.ts).
var REVENUE_COLS = {
  revenueId: "Revenue ID",
  client: "Client",
  amount: "Amount",
  currency: "Currency",
  paymentStatus: "Payment Status",
  receivedDate: "Received Date",
  paymentMethod: "Payment Method",
};

var PAYMENT_COLS = {
  paymentId: "Payment ID",
  date: "Date",
  client: "Client",
  revenueId: "Revenue ID",
  amount: "Amount",
  currency: "Currency",
  method: "Method",
  status: "Status",
  notes: "Notes",
};

// ---- Triggers / menu --------------------------------------------------------

function installTrigger() {
  var ss = SpreadsheetApp.getActive();
  // Remove any existing copies of this handler to avoid duplicates.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "onEditInstallable") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("onEditInstallable").forSpreadsheet(ss).onEdit().create();
  toast("Trigger installed. Marking Revenue 'Payment Status' = Paid now creates a payment.");
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Financial Hub")
    .addItem("Rebuild payments from paid revenue", "rebuildPaidPayments")
    .addToUi();
}

function onEditInstallable(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  if (sheet.getName() !== CONFIG.revenueSheet) return;

  var ctx = revenueContext(sheet);
  if (!ctx) return;

  // Re-evaluate every row touched by the edit (covers single edits and pastes).
  var firstRow = e.range.getRow();
  var lastRow = e.range.getLastRow();
  for (var r = Math.max(firstRow, 2); r <= lastRow; r++) {
    processRevenueRow(ctx, r);
  }
}

/** Menu action: scan all revenue rows and sync their payment state. */
function rebuildPaidPayments() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(CONFIG.revenueSheet);
  if (!sheet) return;
  var ctx = revenueContext(sheet);
  if (!ctx) return;
  var last = sheet.getLastRow();
  var created = 0;
  for (var r = 2; r <= last; r++) {
    if (processRevenueRow(ctx, r)) created++;
  }
  toast("Done. Synced payments for " + created + " paid revenue row(s).");
}

/** Show feedback if a UI/spreadsheet context exists; otherwise just log (e.g. run from the editor). */
function toast(message) {
  try {
    SpreadsheetApp.getActive().toast(message, "Financial Hub", 5);
  } catch (err) {
    Logger.log(message);
  }
}

// ---- Core -------------------------------------------------------------------

/** Reads a revenue row and creates/updates/removes its auto payment. Returns true if a payment was upserted. */
function processRevenueRow(ctx, rowNum) {
  var row = ctx.sheet.getRange(rowNum, 1, 1, ctx.width).getValues()[0];
  var revenueId = String(row[ctx.idx.revenueId] || "").trim();
  if (!revenueId) return false;

  var isPaid = String(row[ctx.idx.paymentStatus] || "").trim().toLowerCase() === CONFIG.paidValue;
  var paymentId = CONFIG.autoIdPrefix + revenueId;

  if (!isPaid) {
    if (CONFIG.removeOnUnpay) removePayment(paymentId);
    return false;
  }

  var client = String(row[ctx.idx.client] || "").trim();
  var amount = row[ctx.idx.amount];
  if (!client || amount === "" || amount == null) return false; // parser would reject; skip quietly

  var received = ctx.idx.receivedDate != null ? row[ctx.idx.receivedDate] : "";
  var date = received ? formatDate(received) : formatDate(new Date());

  upsertPayment(paymentId, {
    paymentId: paymentId,
    date: date,
    client: client,
    revenueId: revenueId,
    amount: amount,
    currency: ctx.idx.currency != null ? row[ctx.idx.currency] : "",
    method: ctx.idx.paymentMethod != null ? row[ctx.idx.paymentMethod] : "",
    status: CONFIG.paymentStatusValue,
    notes: CONFIG.autoNote,
  });
  return true;
}

/** Insert or update the Payments row whose "Payment ID" == paymentId. */
function upsertPayment(paymentId, fields) {
  var pctx = paymentsContext();
  if (!pctx) throw new Error('Missing "' + CONFIG.paymentsSheet + '" tab');

  var rowValues = new Array(pctx.width).fill("");
  set(rowValues, pctx.idx.paymentId, fields.paymentId);
  set(rowValues, pctx.idx.date, fields.date);
  set(rowValues, pctx.idx.client, fields.client);
  set(rowValues, pctx.idx.revenueId, fields.revenueId);
  set(rowValues, pctx.idx.amount, fields.amount);
  set(rowValues, pctx.idx.currency, fields.currency);
  set(rowValues, pctx.idx.method, fields.method);
  set(rowValues, pctx.idx.status, fields.status);
  set(rowValues, pctx.idx.notes, fields.notes);

  var existing = findPaymentRow(pctx, paymentId);
  if (existing > 0) {
    pctx.sheet.getRange(existing, 1, 1, pctx.width).setValues([rowValues]);
  } else {
    pctx.sheet.appendRow(rowValues);
  }
}

function removePayment(paymentId) {
  var pctx = paymentsContext();
  if (!pctx) return;
  var r = findPaymentRow(pctx, paymentId);
  if (r > 0) pctx.sheet.deleteRow(r);
}

function findPaymentRow(pctx, paymentId) {
  var last = pctx.sheet.getLastRow();
  if (last < 2) return -1;
  var ids = pctx.sheet.getRange(2, pctx.idx.paymentId + 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || "").trim() === paymentId) return i + 2;
  }
  return -1;
}

// ---- Header / context helpers ----------------------------------------------

function revenueContext(sheet) {
  var idx = headerIndex(sheet, REVENUE_COLS);
  if (idx.revenueId == null || idx.paymentStatus == null) return null; // required columns absent
  return { sheet: sheet, idx: idx, width: sheet.getLastColumn() };
}

function paymentsContext() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.paymentsSheet);
  if (!sheet) return null;
  var idx = headerIndex(sheet, PAYMENT_COLS);
  if (idx.paymentId == null) return null;
  return { sheet: sheet, idx: idx, width: sheet.getLastColumn() };
}

/** Map logical field -> 0-based column index, matching headers case/space-insensitively. */
function headerIndex(sheet, cols) {
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var byName = {};
  header.forEach(function (h, i) {
    byName[String(h || "").trim().toLowerCase()] = i;
  });
  var out = {};
  Object.keys(cols).forEach(function (field) {
    var i = byName[cols[field].trim().toLowerCase()];
    out[field] = i == null ? null : i;
  });
  return out;
}

function set(arr, idx, value) {
  if (idx != null && idx >= 0 && idx < arr.length) arr[idx] = value;
}

function formatDate(d) {
  var date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "";
  var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone() || "UTC";
  return Utilities.formatDate(date, tz, "yyyy-MM-dd");
}
