export type LineItem = {
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
};

export type InvoiceData = {
  supplier_name: string | null;
  customer_name: string | null;
  invoice_number: string | null;
  issue_date: string | null;
  due_date: string | null;
  currency: string | null;
  subtotal: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  line_items: LineItem[];
  confidence: number;
  notes: string | null;
};

export type InvoiceStatus = "ok" | "check" | "review" | "error";

export type InvoiceRecord = {
  id: string;
  fileName: string;
  status: InvoiceStatus;
  issues: string[];
  data: InvoiceData;
};

export const EMPTY_INVOICE: InvoiceData = {
  supplier_name: null,
  customer_name: null,
  invoice_number: null,
  issue_date: null,
  due_date: null,
  currency: null,
  subtotal: null,
  tax_amount: null,
  total_amount: null,
  line_items: [],
  confidence: 0,
  notes: null,
};

/** Simple accuracy checks: arithmetic + missing critical fields. */
export function validateInvoice(data: InvoiceData): {
  status: InvoiceStatus;
  issues: string[];
} {
  const issues: string[] = [];
  const missing = (["supplier_name", "invoice_number", "total_amount"] as const).filter(
    (k) => data[k] === null || data[k] === "",
  );
  if (missing.length) issues.push(`Missing: ${missing.join(", ").replace(/_/g, " ")}`);

  const lineSum = data.line_items.reduce((s, li) => s + (li.amount ?? 0), 0);
  if (data.total_amount !== null && data.line_items.length > 0) {
    const expected = (data.subtotal ?? lineSum) + (data.tax_amount ?? 0);
    if (Math.abs(expected - data.total_amount) > 0.05) {
      issues.push(`Total doesn't match line items (${expected.toFixed(2)} vs ${data.total_amount.toFixed(2)})`);
    }
  }
  if (data.total_amount !== null && data.total_amount < 0) issues.push("Negative total");

  if (issues.length) return { status: "review", issues };
  if (data.confidence < 0.92) return { status: "check", issues: ["Low confidence — please verify"] };
  return { status: "ok", issues: [] };
}

export function findDuplicates(records: InvoiceRecord[]): Set<string> {
  const seen = new Map<string, string>();
  const dupes = new Set<string>();
  for (const r of records) {
    const key = `${(r.data.supplier_name ?? "").toLowerCase()}|${r.data.invoice_number ?? ""}|${r.data.total_amount ?? ""}`;
    if (key === "||") continue;
    if (seen.has(key)) {
      dupes.add(r.id);
      dupes.add(seen.get(key)!);
    } else seen.set(key, r.id);
  }
  return dupes;
}
