import { toPng } from "html-to-image";

export async function renderElementToPngDataUrl(element: HTMLElement)
{
  return toPng(element, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: "#ffffff",
  });
}

export function downloadDataUrl(dataUrl: string, fileName: string)
{
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = fileName;
  anchor.click();
}

export async function exportElementToPng(element: HTMLElement, fileName: string)
{
  const dataUrl = await renderElementToPngDataUrl(element);
  downloadDataUrl(dataUrl, fileName);
}
