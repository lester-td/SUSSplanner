import fs from "node:fs/promises";
import pdfParse from "pdf-parse";

export async function extractPdfText(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const parsed = await pdfParse(buffer);
  return parsed.text;
}

export async function downloadPdf(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; SUSS timetable planner scraper; +local-dev)"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to download PDF: ${response.status} ${response.statusText} ${url}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("pdf") && !contentType.toLowerCase().includes("octet-stream")) {
    // Some ASP.NET endpoints do not return a clean application/pdf header, so this is only a warning-worthy check.
    console.warn(`Warning: response content-type is '${contentType}' for ${url}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function extractPdfTextFromBuffer(buffer: Buffer): Promise<string> {
  const parsed = await pdfParse(buffer);
  return parsed.text;
}
