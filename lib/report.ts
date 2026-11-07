function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function jpegToPdf(jpeg: Uint8Array, width: number, height: number): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const push = (text: string) => chunks.push(encoder.encode(text));
  const offsets: number[] = [];
  let size = 0;
  const add = (bytes: Uint8Array) => {
    chunks.push(bytes);
    size += bytes.length;
  };
  const mark = () => {
    offsets.push(size);
  };
  add(encoder.encode("%PDF-1.4\n"));
  mark();
  add(encoder.encode("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"));
  mark();
  add(encoder.encode("2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj\n"));
  mark();
  add(
    encoder.encode(
      `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >> endobj\n`,
    ),
  );
  const content = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q\n`;
  mark();
  add(encoder.encode(`4 0 obj << /Length ${encoder.encode(content).length} >> stream\n${content}endstream endobj\n`));
  mark();
  add(
    encoder.encode(
      `5 0 obj << /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >> stream\n`,
    ),
  );
  add(jpeg);
  add(encoder.encode("\nendstream endobj\n"));
  const xrefAt = size;
  push("xref\n");
  push(`0 6\n`);
  push("0000000000 65535 f \n");
  for (const offset of offsets) push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  push(`trailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`);
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  return out;
}

export async function exportReport(filename: string, title: string, lines: string[], kind: "pdf" | "image" | "both") {
  await document.fonts.ready;
  const width = 900;
  const lineHeight = 28;
  const height = Math.max(320, 96 + lines.length * lineHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("無法建立報告畫面");
  ctx.fillStyle = "#fffaf3";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#8f2d2d";
  ctx.fillRect(0, 0, width, 10);
  ctx.fillStyle = "#1c1612";
  ctx.font = "700 28px 'WenQuanYi Micro Hei', sans-serif";
  ctx.fillText(title, 36, 52);
  ctx.font = "18px 'WenQuanYi Micro Hei', sans-serif";
  lines.forEach((line, index) => {
    ctx.fillStyle = line.includes("市場風險") || line.includes("必過核心") ? "#9c1c1c" : "#1c1612";
    ctx.fillText(line.slice(0, 72), 36, 96 + index * lineHeight);
  });
  const jpeg = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("圖片失敗"))), "image/jpeg", 0.92);
  });
  if (kind === "image" || kind === "both") downloadBlob(jpeg, `${filename}.jpg`);
  if (kind === "pdf" || kind === "both") {
    const bytes = new Uint8Array(await jpeg.arrayBuffer());
    const pdf = jpegToPdf(bytes, width, height);
    downloadBlob(new Blob([pdf.buffer as ArrayBuffer], { type: "application/pdf" }), `${filename}.pdf`);
  }
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

export function lineHref(text: string): string {
  return `https://line.me/R/msg/text/?${encodeURIComponent(text)}`;
}
