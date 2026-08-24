import type { InvoiceData } from "./invoice-types";

export type DraftLine = {
  id: string;
  description: string;
  quantity: string;
  unit_price: string;
};

export type InvoiceDraft = {
  supplier_name: string;
  supplier_details: string;
  customer_name: string;
  customer_email: string;
  customer_details: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  currency: string;
  tax_rate: string;
  notes: string;
  line_items: DraftLine[];
};

const HANDOFF_KEY = "easyinvoiceiq:draft";

export function newLine(): DraftLine {
  return { id: crypto.randomUUID(), description: "", quantity: "1", unit_price: "" };
}

export function blankDraft(): InvoiceDraft {
  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  return {
    supplier_name: "",
    supplier_details: "",
    customer_name: "",
    customer_email: "",
    customer_details: "",
    invoice_number: `INV-${new Date().getFullYear()}-001`,
    issue_date: today,
    due_date: due,
    currency: "$",
    tax_rate: "0",
    notes: "Thank you for your business.",
    line_items: [newLine()],
  };
}

export function draftFromExtracted(data: InvoiceData, fallback: InvoiceDraft): InvoiceDraft {
  const lines: DraftLine[] = data.line_items.length
    ? data.line_items.map((li) => ({
        id: crypto.randomUUID(),
        description: li.description ?? "",
        quantity: li.quantity === null ? "1" : String(li.quantity),
        unit_price:
          li.unit_price !== null
            ? String(li.unit_price)
            : li.amount !== null && li.quantity
              ? String(li.amount / li.quantity)
              : li.amount !== null
                ? String(li.amount)
                : "",
      }))
    : [newLine()];

  const sub = data.subtotal ?? lines.reduce((s, l) => s + num(l.quantity) * num(l.unit_price), 0);
  const taxRate = data.tax_amount && sub ? ((data.tax_amount / sub) * 100).toFixed(2) : "0";

  return {
    ...fallback,
    supplier_name: data.supplier_name ?? "",
    customer_name: data.customer_name ?? "",
    invoice_number: data.invoice_number ?? fallback.invoice_number,
    issue_date: data.issue_date ?? fallback.issue_date,
    due_date: data.due_date ?? fallback.due_date,
    currency: data.currency ?? fallback.currency,
    tax_rate: taxRate,
    notes: data.notes ?? fallback.notes,
    line_items: lines,
  };
}

export function num(v: string): number {
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function totals(draft: InvoiceDraft) {
  const subtotal = draft.line_items.reduce((s, l) => s + num(l.quantity) * num(l.unit_price), 0);
  const tax = (subtotal * num(draft.tax_rate)) / 100;
  return { subtotal, tax, total: subtotal + tax };
}

export function fmt(v: number, currency: string) {
  return `${currency}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function stashDraft(draft: InvoiceDraft) {
  sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(draft));
}

export function takeDraft(): InvoiceDraft | null {
  const raw = sessionStorage.getItem(HANDOFF_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(HANDOFF_KEY);
  try {
    return JSON.parse(raw) as InvoiceDraft;
  } catch {
    return null;
  }
}

export function fileName(draft: InvoiceDraft) {
  const safe = (draft.invoice_number || "invoice").replace(/[^a-z0-9-_]+/gi, "-");
  return `${safe}.pdf`;
}

export function emailDraft(draft: InvoiceDraft) {
  const { total } = totals(draft);
  const subject = `Invoice ${draft.invoice_number} from ${draft.supplier_name || "us"} — ${fmt(total, draft.currency)}`;
  const body = [
    `Hi ${draft.customer_name || "there"},`,
    "",
    `Please find attached invoice ${draft.invoice_number} for ${fmt(total, draft.currency)}, dated ${draft.issue_date}.`,
    `Payment is due by ${draft.due_date}.`,
    "",
    draft.notes ? `${draft.notes}` : "",
    "",
    "Do let me know if anything needs adjusting and I'll sort it right away.",
    "",
    "Best regards,",
    draft.supplier_name || "",
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");

  const mailto = `mailto:${encodeURIComponent(draft.customer_email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { subject, body, mailto };
}
