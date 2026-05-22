import { PDFDocument } from "pdf-lib";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const PAGE_MARGIN = 24;

function decodeDataUrl(dataUrl: string)
{
  const [header, encoded] = dataUrl.split(",", 2);
  if (!header || !encoded)
  {
    throw new Error("Invalid image data.");
  }

  const bytes = Uint8Array.from(atob(encoded), (value) => value.charCodeAt(0));
  const isPng = header.includes("image/png");
  return { bytes, isPng };
}

export async function exportPngDataUrlToPdf(dataUrl: string, fileName: string)
{
  const pdf = await PDFDocument.create();
  const { bytes, isPng } = decodeDataUrl(dataUrl);
  const image = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const maxWidth = PAGE_WIDTH - (PAGE_MARGIN * 2);
  const maxHeight = PAGE_HEIGHT - (PAGE_MARGIN * 2);
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  const width = image.width * scale;
  const height = image.height * scale;

  page.drawImage(image, {
    x: (PAGE_WIDTH - width) / 2,
    y: (PAGE_HEIGHT - height) / 2,
    width,
    height,
  });

  const pdfBytes = await pdf.save();
  const blobBytes = new Uint8Array(pdfBytes.byteLength);
  blobBytes.set(pdfBytes);
  const blob = new Blob([blobBytes], { type: "application/pdf" });
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(blobUrl);
}
