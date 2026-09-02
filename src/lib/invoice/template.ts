// A single professional invoice template rendered to an HTML string. The same
// markup drives the on-screen preview (via an iframe) and the server-side PDF,
// so what you preview is exactly what gets issued.

import { displayStatus, type InvoiceStatus } from "./calc";

export interface TemplateInvoice {
  invoiceNumber: string | null;
  status: InvoiceStatus;
  invoiceDate: Date;
  dueDate: Date;
  currency: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  notes: string | null;
  paymentTerms: string | null;
  project: string | null;
  items: { description: string; quantity: number; unitPrice: number; amount: number; revenuePhase: string | null }[];
}

export interface TemplateClient {
  name: string;
  legalName: string | null;
  companyName: string | null;
  billingContact: string | null;
  billingEmail: string | null;
  billingAddress: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  taxId: string | null;
  vatNumber: string | null;
}

export interface TemplateCompany {
  legalName: string | null;
  displayName: string | null;
  logoUrl: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  registrationNumber: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  accountNumber: string | null;
  iban: string | null;
  swift: string | null;
  invoiceFooter: string | null;
}

function esc(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(d);
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "#64748b",
  ISSUED: "#4f46e5",
  SENT: "#0ea5e9",
  PARTIALLY_PAID: "#d97706",
  PAID: "#16a34a",
  OVERDUE: "#dc2626",
  VOID: "#64748b",
};

function addressBlock(lines: (string | null)[]): string {
  return lines.filter(Boolean).map((l) => `<div>${esc(l)}</div>`).join("");
}

export function renderInvoiceHtml(opts: {
  invoice: TemplateInvoice;
  client: TemplateClient;
  company: TemplateCompany;
  showBank: boolean;
}): string {
  const { invoice, client, company, showBank } = opts;
  const ds = displayStatus(invoice.status, invoice.dueDate, invoice.amountDue);
  const statusColor = STATUS_COLORS[ds] ?? "#64748b";

  const cityLine = [client.city, client.state, client.postalCode].filter(Boolean).join(", ");
  const companyCityLine = [company.city, company.state, company.postalCode].filter(Boolean).join(", ");

  const itemsRows = invoice.items
    .map(
      (it) => `
      <tr>
        <td class="desc">
          <div class="item-desc">${esc(it.description)}</div>
          ${it.revenuePhase ? `<div class="item-sub">${esc(it.revenuePhase)}</div>` : ""}
        </td>
        <td class="num">${it.quantity}</td>
        <td class="num">${money(it.unitPrice, invoice.currency)}</td>
        <td class="num">${money(it.amount, invoice.currency)}</td>
      </tr>`,
    )
    .join("");

  const bankBlock =
    showBank && (company.bankName || company.iban || company.accountNumber)
      ? `
      <div class="pay">
        <div class="pay-title">Payment Instructions</div>
        ${company.bankName ? `<div><span>Bank</span> ${esc(company.bankName)}</div>` : ""}
        ${company.bankAccountName ? `<div><span>Account Name</span> ${esc(company.bankAccountName)}</div>` : ""}
        ${company.accountNumber ? `<div><span>Account #</span> ${esc(company.accountNumber)}</div>` : ""}
        ${company.iban ? `<div><span>IBAN</span> ${esc(company.iban)}</div>` : ""}
        ${company.swift ? `<div><span>SWIFT</span> ${esc(company.swift)}</div>` : ""}
      </div>`
      : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; font-size: 13px; line-height: 1.45; }
  .page { max-width: 800px; margin: 0 auto; padding: 40px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 36px; }
  .brand { max-width: 55%; }
  .logo { max-height: 56px; margin-bottom: 10px; }
  .company-name { font-size: 18px; font-weight: 700; }
  .muted { color: #64748b; }
  .invoice-meta { text-align: right; }
  .invoice-title { font-size: 26px; font-weight: 700; letter-spacing: 0.02em; }
  .invoice-number { font-size: 14px; color: #475569; margin-top: 2px; }
  .status { display: inline-block; margin-top: 10px; padding: 4px 12px; border-radius: 999px; color: #fff; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; background: ${statusColor}; }
  .parties { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
  .party { flex: 1; }
  .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; margin-bottom: 6px; }
  .party .name { font-weight: 600; }
  .dates { text-align: right; }
  .dates div { margin-bottom: 4px; }
  .dates span { color: #94a3b8; display: inline-block; min-width: 90px; }
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  table.items thead th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; border-bottom: 2px solid #e2e8f0; padding: 8px 10px; }
  table.items thead th.num, table.items td.num { text-align: right; }
  table.items td { padding: 12px 10px; border-bottom: 1px solid #eef2f7; vertical-align: top; }
  .item-desc { font-weight: 500; }
  .item-sub { color: #94a3b8; font-size: 11px; margin-top: 2px; }
  .totals { width: 300px; margin-left: auto; margin-bottom: 28px; }
  .totals .row { display: flex; justify-content: space-between; padding: 6px 10px; }
  .totals .grand { border-top: 2px solid #0f172a; margin-top: 4px; padding-top: 10px; font-size: 16px; font-weight: 700; }
  .totals .due { background: #f8fafc; border-radius: 8px; font-weight: 700; }
  .foot { display: flex; justify-content: space-between; gap: 24px; margin-top: 8px; }
  .pay, .notes { flex: 1; }
  .pay-title, .notes-title { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; margin-bottom: 6px; }
  .pay div span { color: #94a3b8; display: inline-block; min-width: 92px; }
  .footer { margin-top: 36px; padding-top: 16px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 11px; text-align: center; }
  .watermark { color: #dc2626; border: 2px solid #dc2626; font-weight: 700; }
</style>
</head>
<body>
  <div class="page">
    <div class="top">
      <div class="brand">
        ${company.logoUrl ? `<img class="logo" src="${esc(company.logoUrl)}" alt="logo" />` : ""}
        <div class="company-name">${esc(company.displayName || company.legalName || "Company")}</div>
        <div class="muted">${addressBlock([company.address, companyCityLine, company.country])}</div>
        <div class="muted">${addressBlock([company.email, company.phone])}</div>
        ${company.taxId ? `<div class="muted">Tax ID: ${esc(company.taxId)}</div>` : ""}
        ${company.registrationNumber ? `<div class="muted">Reg #: ${esc(company.registrationNumber)}</div>` : ""}
      </div>
      <div class="invoice-meta">
        <div class="invoice-title">INVOICE</div>
        <div class="invoice-number">${esc(invoice.invoiceNumber || "DRAFT")}</div>
        <div class="status ${ds === "VOID" ? "watermark" : ""}">${ds.replace("_", " ")}</div>
      </div>
    </div>

    <div class="parties">
      <div class="party">
        <div class="label">Bill To</div>
        <div class="name">${esc(client.companyName || client.legalName || client.name)}</div>
        ${client.billingContact ? `<div>${esc(client.billingContact)}</div>` : ""}
        <div class="muted">${addressBlock([client.billingAddress, cityLine, client.country])}</div>
        ${client.billingEmail ? `<div class="muted">${esc(client.billingEmail)}</div>` : ""}
        ${client.taxId ? `<div class="muted">Tax ID: ${esc(client.taxId)}</div>` : ""}
        ${client.vatNumber ? `<div class="muted">VAT: ${esc(client.vatNumber)}</div>` : ""}
      </div>
      <div class="party dates">
        <div class="label">Details</div>
        <div><span>Invoice Date</span> ${fmtDate(invoice.invoiceDate)}</div>
        <div><span>Due Date</span> ${fmtDate(invoice.dueDate)}</div>
        ${invoice.paymentTerms ? `<div><span>Terms</span> ${esc(invoice.paymentTerms)}</div>` : ""}
        ${invoice.project ? `<div><span>Project</span> ${esc(invoice.project)}</div>` : ""}
        <div><span>Currency</span> ${esc(invoice.currency)}</div>
      </div>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th>Description</th>
          <th class="num">Qty</th>
          <th class="num">Unit Price</th>
          <th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>${itemsRows}</tbody>
    </table>

    <div class="totals">
      <div class="row"><span class="muted">Subtotal</span><span>${money(invoice.subtotal, invoice.currency)}</span></div>
      ${invoice.discount > 0 ? `<div class="row"><span class="muted">Discount</span><span>−${money(invoice.discount, invoice.currency)}</span></div>` : ""}
      ${invoice.tax > 0 ? `<div class="row"><span class="muted">Tax</span><span>${money(invoice.tax, invoice.currency)}</span></div>` : ""}
      <div class="row grand"><span>Total</span><span>${money(invoice.total, invoice.currency)}</span></div>
      ${invoice.amountPaid > 0 ? `<div class="row"><span class="muted">Paid</span><span>−${money(invoice.amountPaid, invoice.currency)}</span></div>` : ""}
      ${invoice.amountPaid > 0 ? `<div class="row due"><span>Amount Due</span><span>${money(invoice.amountDue, invoice.currency)}</span></div>` : ""}
    </div>

    <div class="foot">
      ${bankBlock}
      ${invoice.notes ? `<div class="notes"><div class="notes-title">Notes</div><div class="muted">${esc(invoice.notes)}</div></div>` : ""}
    </div>

    ${company.invoiceFooter ? `<div class="footer">${esc(company.invoiceFooter)}</div>` : ""}
  </div>
</body>
</html>`;
}
