import type { InvoiceRecord } from "./invoice-types";

const HEADERS = [
  "file",
  "status",
  "supplier_name",
  "customer_name",
  "invoice_number",
  "issue_date",
  "due_date",
  "currency",
  "subtotal",
  "tax_amount",
  "total_amount",
  "line_items",
  "issues",
];

function cell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function recordsToCsv(records: InvoiceRecord[]): string {
  const rows = records.map((r) =>
    [
      r.fileName,
      r.status,
      r.data.supplier_name,
      r.data.customer_name,
      r.data.invoice_number,
      r.data.issue_date,
      r.data.due_date,
      r.data.currency,
      r.data.subtotal,
      r.data.tax_amount,
      r.data.total_amount,
      r.data.line_items
        .map((li) => `${li.description ?? ""} x${li.quantity ?? ""} = ${li.amount ?? ""}`)
        .join(" | "),
      r.issues.join("; "),
    ].map(cell),
  );
  return [HEADERS.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

export function downloadCsv(records: InvoiceRecord[]) {
  const blob = new Blob([recordsToCsv(records)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
