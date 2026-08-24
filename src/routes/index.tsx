import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useRef, useState } from "react";
import { FileText, Upload, Download, X, Check, AlertTriangle, Loader2, Copy } from "lucide-react";

import { extractInvoice } from "@/lib/extract-invoice.functions";
import { fileToImages } from "@/lib/file-to-images";
import { downloadCsv } from "@/lib/export-csv";
import {
  EMPTY_INVOICE,
  findDuplicates,
  validateInvoice,
  type InvoiceData,
  type InvoiceRecord,
} from "@/lib/invoice-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "InvoiceIQ — Turn 10 invoices into one clean sheet" },
      {
        name: "description",
        content:
          "Drop in up to 10 invoices. InvoiceIQ reads every field, checks the maths, flags what needs a look, and exports one CSV.",
      },
      { property: "og:title", content: "InvoiceIQ — Turn 10 invoices into one clean sheet" },
      {
        property: "og:description",
        content: "Upload up to 10 invoices, review flagged fields, export one clean CSV.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const MAX_FILES = 10;

type Pending = { id: string; file: File };

function money(v: number | null, currency: string | null) {
  if (v === null) return "—";
  return `${currency ?? ""}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatusPill({ record }: { record: InvoiceRecord }) {
  const map = {
    ok: { label: "Clean", cls: "bg-success/12 text-success border-success/25", Icon: Check },
    check: { label: "Verify", cls: "bg-warning/15 text-warning-foreground border-warning/40", Icon: AlertTriangle },
    review: { label: "Review", cls: "bg-destructive/10 text-destructive border-destructive/25", Icon: AlertTriangle },
    error: { label: "Failed", cls: "bg-destructive/10 text-destructive border-destructive/25", Icon: X },
  }[record.status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${map.cls}`}
    >
      <map.Icon className="size-3.5" />
      {map.label}
    </span>
  );
}

function Home() {
  const extract = useServerFn(extractInvoice);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [records, setRecords] = useState<InvoiceRecord[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = useCallback((list: FileList | null) => {
    if (!list) return;
    setError(null);
    setPending((prev) => {
      const room = MAX_FILES - prev.length;
      const incoming = Array.from(list).slice(0, Math.max(room, 0));
      if (Array.from(list).length > incoming.length) {
        setError(`You can process ${MAX_FILES} invoices at a time.`);
      }
      return [
        ...prev,
        ...incoming.map((file) => ({ id: `${file.name}-${crypto.randomUUID()}`, file })),
      ];
    });
  }, []);

  async function run() {
    setError(null);
    const queue = [...pending];
    setPending([]);
    for (const item of queue) {
      setBusy(item.file.name);
      try {
        const images = await fileToImages(item.file);
        const raw = (await extract({
          data: { fileName: item.file.name, images },
        })) as Partial<InvoiceData>;
        const data: InvoiceData = {
          ...EMPTY_INVOICE,
          ...raw,
          line_items: Array.isArray(raw.line_items) ? raw.line_items : [],
          confidence: typeof raw.confidence === "number" ? raw.confidence : 0,
        };
        const { status, issues } = validateInvoice(data);
        setRecords((r) => [...r, { id: item.id, fileName: item.file.name, status, issues, data }]);
      } catch (e) {
        setRecords((r) => [
          ...r,
          {
            id: item.id,
            fileName: item.file.name,
            status: "error",
            issues: [e instanceof Error ? e.message : "Could not read this file"],
            data: EMPTY_INVOICE,
          },
        ]);
      }
    }
    setBusy(null);
  }

  function updateField(id: string, key: keyof InvoiceData, value: string) {
    setRecords((rs) =>
      rs.map((r) => {
        if (r.id !== id) return r;
        const numeric = ["subtotal", "tax_amount", "total_amount"].includes(key);
        const parsed = value === "" ? null : numeric ? Number(value) : value;
        const data = { ...r.data, [key]: parsed } as InvoiceData;
        const { status, issues } = validateInvoice(data);
        return { ...r, data, status: status, issues };
      }),
    );
  }

  const dupes = findDuplicates(records);
  const needsAttention = records.filter((r) => r.status !== "ok").length;

  return (
    <main className="min-h-screen">
      <header className="border-b border-border/70 bg-card/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <FileText className="size-4" />
            </span>
            <span className="font-serif text-lg font-semibold">InvoiceIQ</span>
          </div>
          <span className="text-sm text-muted-foreground">10 invoices per batch</span>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">
          Drop in your invoices. Get one clean sheet back.
        </h1>
        <p className="mt-4 max-w-xl text-base text-muted-foreground">
          Up to 10 PDFs or photos at a time. Every field is read, the totals are checked, and anything
          uncertain is flagged for you — nothing is guessed.
        </p>

        <section
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          className={`mt-10 rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-border bg-card"
          }`}
        >
          <Upload className="mx-auto size-7 text-muted-foreground" />
          <p className="mt-4 text-sm font-medium">Drag invoices here, or</p>
          <Button
            variant="outline"
            className="mt-3"
            onClick={() => inputRef.current?.click()}
            disabled={pending.length >= MAX_FILES || busy !== null}
          >
            Choose files
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">
            PDF, PNG or JPG · {pending.length}/{MAX_FILES} selected
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="application/pdf,image/png,image/jpeg"
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </section>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        {pending.length > 0 && (
          <div className="mt-6 rounded-xl border border-border bg-card p-4">
            <ul className="divide-y divide-border">
              {pending.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="truncate">{p.file.name}</span>
                  <button
                    className="text-muted-foreground transition-colors hover:text-destructive"
                    onClick={() => setPending((prev) => prev.filter((x) => x.id !== p.id))}
                    aria-label={`Remove ${p.file.name}`}
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
            <Button className="mt-4 w-full" onClick={run} disabled={busy !== null}>
              {busy ? "Working…" : `Extract ${pending.length} invoice${pending.length > 1 ? "s" : ""}`}
            </Button>
          </div>
        )}

        {busy && (
          <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Reading {busy}…
          </p>
        )}

        {records.length > 0 && (
          <section className="mt-12">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold">Results</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {records.length} processed · {needsAttention} need a look
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setRecords([])}>
                  Clear
                </Button>
                <Button onClick={() => downloadCsv(records)}>
                  <Download className="size-4" /> Export CSV
                </Button>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {records.map((r) => (
                <article key={r.id} className="rounded-xl border border-border bg-card p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        Confidence {Math.round(r.data.confidence * 100)}%
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {dupes.has(r.id) && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning-foreground">
                          <Copy className="size-3.5" /> Possible duplicate
                        </span>
                      )}
                      <StatusPill record={r} />
                    </div>
                  </div>

                  {r.issues.length > 0 && (
                    <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {r.issues.map((i) => (
                        <li key={i}>• {i}</li>
                      ))}
                    </ul>
                  )}

                  {r.status !== "error" && (
                    <>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        {(
                          [
                            ["supplier_name", "Supplier"],
                            ["customer_name", "Customer"],
                            ["invoice_number", "Invoice no."],
                            ["issue_date", "Issue date"],
                            ["due_date", "Due date"],
                            ["total_amount", "Total"],
                          ] as const
                        ).map(([key, label]) => (
                          <label key={key} className="block">
                            <span className="text-xs font-medium text-muted-foreground">{label}</span>
                            <Input
                              className="mt-1 bg-background"
                              value={r.data[key] === null ? "" : String(r.data[key])}
                              placeholder="—"
                              onChange={(e) => updateField(r.id, key, e.target.value)}
                            />
                          </label>
                        ))}
                      </div>

                      {r.data.line_items.length > 0 && (
                        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                              <tr>
                                <th className="px-3 py-2 font-medium">Description</th>
                                <th className="px-3 py-2 font-medium">Qty</th>
                                <th className="px-3 py-2 font-medium">Unit</th>
                                <th className="px-3 py-2 text-right font-medium">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.data.line_items.map((li, i) => (
                                <tr key={i} className="border-t border-border">
                                  <td className="px-3 py-2">{li.description ?? "—"}</td>
                                  <td className="px-3 py-2">{li.quantity ?? "—"}</td>
                                  <td className="px-3 py-2">{money(li.unit_price, r.data.currency)}</td>
                                  <td className="px-3 py-2 text-right">
                                    {money(li.amount, r.data.currency)}
                                  </td>
                                </tr>
                              ))}
                              <tr className="border-t border-border bg-muted/40 font-medium">
                                <td className="px-3 py-2" colSpan={3}>
                                  Total (tax {money(r.data.tax_amount, r.data.currency)})
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {money(r.data.total_amount, r.data.currency)}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
