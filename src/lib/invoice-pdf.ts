import { fmt, fileName, num, totals, type InvoiceDraft } from "./invoice-draft";

/** Builds a clean one-page A4 invoice PDF in the browser and downloads it. */
export async function downloadInvoicePdf(draft: InvoiceDraft) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 48;
  let y = 64;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text("INVOICE", M, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`No. ${draft.invoice_number || "—"}`, W - M, y - 12, { align: "right" });
  doc.text(`Issued ${draft.issue_date || "—"}`, W - M, y + 2, { align: "right" });
  doc.text(`Due ${draft.due_date || "—"}`, W - M, y + 16, { align: "right" });

  y += 40;
  doc.setDrawColor(210);
  doc.line(M, y, W - M, y);
  y += 26;

  const colW = (W - M * 2) / 2;
  const block = (title: string, name: string, details: string, x: number) => {
    let yy = y;
    doc.setFontSize(8);
    doc.setTextColor(130);
    doc.text(title.toUpperCase(), x, yy);
    doc.setTextColor(20);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    yy += 15;
    doc.text(name || "—", x, yy);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    for (const line of doc.splitTextToSize(details || "", colW - 20) as string[]) {
      yy += 13;
      doc.text(line, x, yy);
    }
    return yy;
  };
  const y1 = block("From", draft.supplier_name, draft.supplier_details, M);
  const y2 = block(
    "Bill to",
    draft.customer_name,
    [draft.customer_details, draft.customer_email].filter(Boolean).join("\n"),
    M + colW,
  );
  y = Math.max(y1, y2) + 34;

  // table head
  doc.setFillColor(244, 241, 236);
  doc.rect(M, y - 14, W - M * 2, 22, "F");
  doc.setFontSize(8.5);
  doc.setTextColor(110);
  doc.text("DESCRIPTION", M + 8, y);
  doc.text("QTY", W - M - 210, y, { align: "right" });
  doc.text("UNIT PRICE", W - M - 110, y, { align: "right" });
  doc.text("AMOUNT", W - M - 8, y, { align: "right" });
  y += 22;

  doc.setTextColor(20);
  doc.setFontSize(10);
  for (const li of draft.line_items) {
    const amount = num(li.quantity) * num(li.unit_price);
    const wrapped = doc.splitTextToSize(li.description || "—", W - M * 2 - 260) as string[];
    doc.text(wrapped, M + 8, y);
    doc.text(String(li.quantity || "0"), W - M - 210, y, { align: "right" });
    doc.text(fmt(num(li.unit_price), draft.currency), W - M - 110, y, { align: "right" });
    doc.text(fmt(amount, draft.currency), W - M - 8, y, { align: "right" });
    y += 14 * wrapped.length + 8;
    doc.setDrawColor(232);
    doc.line(M, y - 10, W - M, y - 10);
  }

  const t = totals(draft);
  y += 12;
  const row = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 12 : 10);
    doc.text(label, W - M - 130, y, { align: "right" });
    doc.text(value, W - M - 8, y, { align: "right" });
    y += bold ? 20 : 17;
  };
  row("Subtotal", fmt(t.subtotal, draft.currency));
  row(`Tax (${num(draft.tax_rate)}%)`, fmt(t.tax, draft.currency));
  doc.setDrawColor(210);
  doc.line(W - M - 220, y - 10, W - M, y - 10);
  y += 6;
  row("Total due", fmt(t.total, draft.currency), true);

  if (draft.notes) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(110);
    const notes = doc.splitTextToSize(draft.notes, W - M * 2) as string[];
    doc.text(notes, M, Math.max(y + 24, 720));
  }

  doc.save(fileName(draft));
}
