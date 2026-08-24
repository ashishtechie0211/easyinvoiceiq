import { createServerFn } from "@tanstack/react-start";

import { extractInput, parseModelJson, SYSTEM_PROMPT } from "./invoice-extract-schema";

export const extractInvoice = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => extractInput.parse(d))
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
    return parseModelJson(json.choices?.[0]?.message?.content ?? "");
  });
