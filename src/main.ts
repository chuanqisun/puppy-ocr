import { PDFDocument } from "pdf-lib";
import { from, lastValueFrom, mergeMap, toArray } from "rxjs";
import "./style.css";

// DOM elements
const apiBaseUrl = (import.meta.env.VITE_IMAGE_API_BASE_URL as string | undefined)?.trim().replace(/\/$/, "") ?? "";
const apiKeyInput = getRequiredElement<HTMLInputElement>("api-key");
const fileInput = getRequiredElement<HTMLInputElement>("pdf-file");
const selectedFile = getRequiredElement<HTMLParagraphElement>("selected-file");
const startButton = getRequiredElement<HTMLButtonElement>("start-ocr");
const status = getRequiredElement<HTMLParagraphElement>("status");
const result = getRequiredElement<HTMLDivElement>("result");

type SplitPageResult = {
  pageIndex: number;
  pageNumber: number;
  file: File;
};

type OcrRunSummary = {
  failedPages: number;
  pageCount: number;
};

type PageResultRow = {
  setStatus: (value: string) => void;
  setContent: (value: string) => void;
  setDownloadName: (value: string) => void;
};

main();
async function main() {
  fileInput.addEventListener("change", () => {
    const file = getSelectedPdf();
    selectedFile.textContent = file ? `Selected file: ${file.name}` : "No file selected.";
    status.textContent = file ? "Ready to start OCR." : "Select a PDF to begin.";
    clearResults();
    updateStartButton();
  });

  startButton.addEventListener("click", async () => {
    const file = getSelectedPdf();
    const apiKey = apiKeyInput.value.trim();

    if (!file) {
      status.textContent = "Choose a PDF file before starting.";
      return;
    }

    if (!apiKey) {
      status.textContent = "Enter an API key before starting.";
      apiKeyInput.focus();
      return;
    }

    startButton.disabled = true;
    status.textContent = "Uploading PDF and waiting for OCR output...";
    clearResults();

    try {
      const summary = await splitAndOcrPdf(file, apiKey);
      status.textContent = getCompletionMessage(summary);
    } catch (error) {
      const message = error instanceof Error ? error.message : "OCR request failed.";
      clearResults();
      appendRunError(message);
      status.textContent = "OCR request failed.";
    } finally {
      updateStartButton();
    }
  });
}

async function splitAndOcrPdf(file: File, apiKey: string): Promise<OcrRunSummary> {
  const sourcePdf = await PDFDocument.load(await file.arrayBuffer());
  const pageCount = sourcePdf.getPageCount();
  const pageRows = createPageResultRows(pageCount);
  let splitCompleted = 0;
  let ocrCompleted = 0;
  let failedPages = 0;

  status.textContent = `Preparing ${pageCount} page${pageCount === 1 ? "" : "s"} for OCR...`;

  const pageIndices = Array.from({ length: pageCount }, (_, pageIndex) => pageIndex);
  await lastValueFrom(
    from(pageIndices).pipe(
      mergeMap(async (pageIndex) => {
        pageRows[pageIndex].setStatus("running");
        const page = await splitPdfPage(sourcePdf, file.name, pageIndex);
        pageRows[page.pageIndex].setDownloadName(createDownloadFilename(file.name, page.pageNumber, pageCount));
        splitCompleted += 1;
        status.textContent = getProgressMessage(splitCompleted, ocrCompleted, pageCount);
        return page;
      }),
      mergeMap(async (page) => {
        const pageRow = pageRows[page.pageIndex];
        pageRow.setStatus("running");

        try {
          const text = await runOcrRequest(page.file, apiKey);
          pageRow.setContent(text || "[No text returned]");
          pageRow.setStatus("success");
        } catch (error) {
          failedPages += 1;
          const message = error instanceof Error ? error.message : "OCR request failed.";
          pageRow.setContent(message);
          pageRow.setStatus("error");
        } finally {
          ocrCompleted += 1;
          status.textContent = getProgressMessage(splitCompleted, ocrCompleted, pageCount, failedPages);
        }
      }, 3),
      toArray()
    )
  );

  return {
    failedPages,
    pageCount,
  };
}

async function splitPdfPage(sourcePdf: PDFDocument, originalFilename: string, pageIndex: number): Promise<SplitPageResult> {
  const pageNumber = pageIndex + 1;
  const splitPdf = await PDFDocument.create();
  const [copiedPage] = await splitPdf.copyPages(sourcePdf, [pageIndex]);
  splitPdf.addPage(copiedPage);
  const splitPdfBytes = await splitPdf.save();

  return {
    pageIndex,
    pageNumber,
    file: new File([toArrayBuffer(splitPdfBytes)], createPageFilename(originalFilename, pageNumber), {
      type: "application/pdf",
    }),
  };
}

async function runOcrRequest(file: File, apiKey: string): Promise<string> {
  const formData = new FormData();
  formData.set("file", file);

  const response = await fetch(`${apiBaseUrl}/api/ocr`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
    },
    body: formData,
  });

  const output = await response.text();

  if (!response.ok) {
    throw new Error(output || `OCR request failed with status ${response.status}.`);
  }

  return output.trim();
}

function clearResults(): void {
  result.replaceChildren();
}

function createPageResultRows(pageCount: number): PageResultRow[] {
  const rows = Array.from({ length: pageCount }, (_, pageIndex) => createPageResultRow(pageIndex + 1, pageCount));
  clearResults();
  result.append(...rows.map((row) => row.element));
  return rows;
}

function createPageResultRow(pageNumber: number, pageCount: number): PageResultRow & { element: HTMLElement } {
  const row = document.createElement("article");
  row.className = "page-result";

  const details = document.createElement("div");
  details.className = "page-result-details";

  const heading = document.createElement("strong");
  heading.textContent = `Page ${formatPageNumber(pageNumber, pageCount)}`;

  const rowStatus = document.createElement("span");
  rowStatus.textContent = "queued";

  details.append(heading, rowStatus);

  const actions = document.createElement("div");
  actions.className = "page-result-actions";

  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.textContent = "Show";
  toggleButton.disabled = true;

  const downloadButton = document.createElement("button");
  downloadButton.type = "button";
  downloadButton.textContent = "Download";
  downloadButton.disabled = true;

  actions.append(toggleButton, downloadButton);

  const body = document.createElement("pre");
  body.className = "page-result-body";
  body.hidden = true;

  let currentContent = "";
  let downloadName = "ocr-output.txt";

  toggleButton.addEventListener("click", () => {
    const shouldShow = body.hidden;
    body.hidden = !shouldShow;
    toggleButton.textContent = shouldShow ? "Hide" : "Show";
  });

  downloadButton.addEventListener("click", () => {
    downloadTextFile(downloadName, currentContent);
  });

  row.append(details, actions, body);

  return {
    element: row,
    setStatus(value: string) {
      rowStatus.textContent = value;
    },
    setContent(value: string) {
      currentContent = value;
      body.textContent = value;
      toggleButton.disabled = false;
      downloadButton.disabled = false;
    },
    setDownloadName(value: string) {
      downloadName = value;
    },
  };
}

function appendRunError(message: string): void {
  const errorMessage = document.createElement("p");
  errorMessage.textContent = message;
  result.append(errorMessage);
}

function getProgressMessage(splitCompleted: number, ocrCompleted: number, pageCount: number, failedPages = 0): string {
  const failureMessage = failedPages === 0 ? "" : ` Failed ${failedPages}.`;
  return `Split ${splitCompleted}/${pageCount} pages. OCR ${ocrCompleted}/${pageCount} pages.${failureMessage}`;
}

function getCompletionMessage(summary: OcrRunSummary): string {
  if (summary.failedPages === 0) {
    return `OCR complete for ${summary.pageCount} page${summary.pageCount === 1 ? "" : "s"}.`;
  }

  return `OCR finished with ${summary.failedPages} failed page${summary.failedPages === 1 ? "" : "s"}.`;
}

function formatPageNumber(pageNumber: number, pageCount: number): string {
  return String(pageNumber).padStart(String(pageCount).length, "0");
}

function createDownloadFilename(originalFilename: string, pageNumber: number, pageCount: number): string {
  const baseName = originalFilename.replace(/\.pdf$/i, "") || "document";
  return `${baseName}-ocr-${formatPageNumber(pageNumber, pageCount)}.txt`;
}

function createPageFilename(originalFilename: string, pageNumber: number): string {
  const baseName = originalFilename.replace(/\.pdf$/i, "") || "document";
  return `${baseName}-page-${pageNumber}.pdf`;
}

function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(objectUrl);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

function getRequiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing required element: #${id}`);
  }

  return element as T;
}

function getSelectedPdf(): File | null {
  return fileInput.files?.[0] ?? null;
}

function updateStartButton(): void {
  startButton.disabled = getSelectedPdf() === null;
}
