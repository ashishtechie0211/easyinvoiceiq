import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  fileName: z.string(),
  images: z.array(z.string()).min(1).max(8),
});

const SYSTEM_PROMPT = `You are an invoice data-extraction engine. You are given page images of ONE invoice.
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

export const extractInvoice = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: `Extract the invoice from file "${data.fileName}".` },
              ...data.images.map((url) => ({ type: "image_url" as const, image_url: { url } })),
            ],
          },
        ],
      }),
    });

    if (res.status === 429) throw new Error("Rate limit reached — please retry in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Please top up in Settings.");
    if (!res.ok) throw new Error(`Extraction failed (${res.status})`);

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = json.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("Could not read invoice data");
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  });
