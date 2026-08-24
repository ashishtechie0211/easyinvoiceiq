import { z } from "zod";

export const extractInput = z.object({
  fileName: z.string(),
  images: z.array(z.string()).min(1).max(8),
});

const num = z.union([z.number(), z.string(), z.null()]).optional().transform((v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
});
const str = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v) => (v === null || v === undefined || v === "" ? null : String(v)));

export const extractOutput = z.object({
  supplier_name: str,
  customer_name: str,
  invoice_number: str,
  issue_date: str,
  due_date: str,
  currency: str,
  subtotal: num,
  tax_amount: num,
  total_amount: num,
  notes: str,
  confidence: z
    .union([z.number(), z.null()])
    .optional()
    .transform((v) => (typeof v === "number" ? v : 0)),
  line_items: z
    .array(
      z.object({
        description: str,
        quantity: num,
        unit_price: num,
        amount: num,
      }),
    )
    .optional()
    .transform((v) => v ?? []),
});

export const SYSTEM_PROMPT = `You are an invoice data-extraction engine. You are given page images of ONE invoice.
Return ONLY valid JSON, no prose, no markdown fences, matching:
{
 "supplier_name": string|null,
 "customer_name": string|null,
 "invoice_number": string|null,
 "issue_date": "YYYY-MM-DD"|null,
 "due_date": "YYYY-MM-DD"|null,
 "currency": string|null,
 "subtotal": number|null,
 "tax_amount": number|null,
 "total_amount": number|null,
 "line_items": [{"description": string|null, "quantity": number|null, "unit_price": number|null, "amount": number|null}],
 "confidence": number,
 "notes": string|null
}
Rules:
- Never guess. If a value is not clearly readable, return null.
- Numbers must be plain numbers (no currency symbols or thousand separators).
- currency is the ISO code or symbol exactly as printed.
- confidence is 0-1: the LOWEST confidence across the critical fields (supplier, invoice number, total).`;

export function parseModelJson(raw: string) {
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Could not read invoice data");
  return extractOutput.parse(JSON.parse(cleaned.slice(start, end + 1)));
}
