import { PDFDocument } from "pdf-lib";
import { from, lastValueFrom, mergeMap, toArray } from "rxjs";
import "./style.css";

// DOM elements
const apiBaseUrl = (import.meta.env.VITE_IMAGE_API_BASE_URL as string | undefined)?.trim().replace(/\/$/, "") ?? "";
const apiKeyStorageKey = "puppy-ocr-api-key";
const form = getRequiredElement<HTMLFormElement>("ocr-form");
const apiKeyInput = getRequiredElement<HTMLInputElement>("api-key");
const fileInput = getRequiredElement<HTMLInputElement>("pdf-file");
const fileNameOutput = getRequiredElement<HTMLOutputElement>("pdf-file-name");
const startButton = getRequiredElement<HTMLButtonElement>("start-ocr");
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

type ResultTable = {
  header: ResultHeaderRow;
  rows: PageResultRow[];
};

type ResultHeaderRow = {
  setSummary: (value: string) => void;
  syncControls: () => void;
};

type PageResultRow = {
  setStatus: (value: string) => void;
  setContent: (value: string) => void;
  setDownloadName: (value: string) => void;
  setExpanded: (value: boolean) => void;
  isExpanded: () => boolean;
  hasContent: () => boolean;
  getContent: () => string;
  getPageNumber: () => number;
};

main();
async function main() {
  apiKeyInput.value = loadApiKey();
  clearResults();
  syncFileSelection();
  updateStartButton();

  apiKeyInput.addEventListener("input", () => {
    saveApiKey(apiKeyInput.value);
  });

  fileInput.addEventListener("change", () => {
    clearResults();
    syncFileSelection();
    updateStartButton();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const file = getSelectedPdf();
    const apiKey = apiKeyInput.value.trim();

    if (!file) {
      return;
    }

    if (!apiKey) {
      apiKeyInput.setCustomValidity("Enter an API key before starting.");
      apiKeyInput.reportValidity();
      apiKeyInput.setCustomValidity("");
      apiKeyInput.focus();
      return;
    }

    startButton.disabled = true;
    clearResults();

    try {
      await splitAndOcrPdf(file, apiKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : "OCR request failed.";
      clearResults();
      appendRunError(message);
    } finally {
      updateStartButton();
    }
  });
}

async function splitAndOcrPdf(file: File, apiKey: string): Promise<OcrRunSummary> {
  const sourcePdf = await PDFDocument.load(await file.arrayBuffer());
  const pageCount = sourcePdf.getPageCount();
  const resultTable = createPageResultRows(pageCount);
  let splitCompleted = 0;
  let ocrCompleted = 0;
  let failedPages = 0;

  resultTable.header.setSummary(getProgressMessage(splitCompleted, ocrCompleted, pageCount));

  const pageIndices = Array.from({ length: pageCount }, (_, pageIndex) => pageIndex);
  await lastValueFrom(
    from(pageIndices).pipe(
      mergeMap(async (pageIndex) => {
        resultTable.rows[pageIndex].setStatus("running");
        const page = await splitPdfPage(sourcePdf, file.name, pageIndex);
        resultTable.rows[page.pageIndex].setDownloadName(createDownloadFilename(file.name, page.pageNumber, pageCount));
        splitCompleted += 1;
        resultTable.header.setSummary(getProgressMessage(splitCompleted, ocrCompleted, pageCount, failedPages));
        return page;
      }),
      mergeMap(async (page) => {
        const pageRow = resultTable.rows[page.pageIndex];
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
          resultTable.header.setSummary(getProgressMessage(splitCompleted, ocrCompleted, pageCount, failedPages));
          resultTable.header.syncControls();
        }
      }, 3),
      toArray()
    )
  );

  const summary = {
    failedPages,
    pageCount,
  };

  resultTable.header.setSummary(getCompletionMessage(summary));

  return summary;
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
  result.hidden = true;
}

function createPageResultRows(pageCount: number): ResultTable {
  let syncHeaderControls = () => {};
  const rows = Array.from({ length: pageCount }, (_, pageIndex) => createPageResultRow(pageIndex + 1, pageCount, () => syncHeaderControls()));
  clearResults();
  const header = createResultHeader(pageCount, rows);
  syncHeaderControls = header.syncControls;
  result.hidden = false;
  result.append(header.element, ...rows.map((row) => row.element));
  header.syncControls();
  return { header, rows };
}

function createResultHeader(pageCount: number, rows: PageResultRow[]): ResultHeaderRow & { element: HTMLElement } {
  const row = document.createElement("article");
  row.className = "result-header";

  const progress = document.createElement("strong");
  progress.className = "result-header-summary";
  progress.textContent = getProgressMessage(0, 0, pageCount);

  const actions = document.createElement("div");
  actions.className = "result-header-actions";

  const toggleAllButton = document.createElement("button");
  toggleAllButton.type = "button";

  const downloadCombinedButton = document.createElement("button");
  downloadCombinedButton.type = "button";
  downloadCombinedButton.textContent = "Download combined";

  const pageNumberLabel = document.createElement("label");
  pageNumberLabel.className = "result-header-checkbox";

  const includePageNumbersInput = document.createElement("input");
  includePageNumbersInput.type = "checkbox";
  includePageNumbersInput.checked = true;

  const pageNumberText = document.createElement("span");
  pageNumberText.textContent = "Page number";

  pageNumberLabel.append(includePageNumbersInput, pageNumberText);
  actions.append(toggleAllButton, downloadCombinedButton, pageNumberLabel);
  row.append(progress, actions);

  toggleAllButton.addEventListener("click", () => {
    const shouldExpand = !rows.every((currentRow) => currentRow.isExpanded());
    rows.forEach((currentRow) => currentRow.setExpanded(shouldExpand));
    syncControls();
  });

  downloadCombinedButton.addEventListener("click", () => {
    const combinedContent = buildCombinedOutput(rows, includePageNumbersInput.checked);

    if (!combinedContent) {
      return;
    }

    downloadTextFile("ocr-output.txt", combinedContent);
  });

  function syncControls(): void {
    const hasContent = rows.some((currentRow) => currentRow.hasContent());
    toggleAllButton.disabled = !hasContent;
    downloadCombinedButton.disabled = !hasContent;
    toggleAllButton.textContent = rows.every((currentRow) => currentRow.isExpanded()) ? "Hide all" : "Show all";
  }

  return {
    element: row,
    setSummary(value: string) {
      progress.textContent = value;
    },
    syncControls,
  };
}

function createPageResultRow(pageNumber: number, pageCount: number, onExpandedChange: () => void): PageResultRow & { element: HTMLElement } {
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
  let expanded = false;
  let contentAvailable = false;

  function syncExpandedState(): void {
    body.hidden = !(contentAvailable && expanded);
    toggleButton.textContent = expanded ? "Hide" : "Show";
  }

  toggleButton.addEventListener("click", () => {
    expanded = !expanded;
    syncExpandedState();
    onExpandedChange();
  });

  downloadButton.addEventListener("click", () => {
    downloadTextFile(downloadName, currentContent);
  });

  row.append(details, actions, body);

  return {
    element: row,
    setStatus(value: string) {
      rowStatus.textContent = formatStatusLabel(value);
    },
    setContent(value: string) {
      currentContent = value;
      body.textContent = value;
      contentAvailable = true;
      toggleButton.disabled = false;
      downloadButton.disabled = false;
      syncExpandedState();
    },
    setDownloadName(value: string) {
      downloadName = value;
    },
    setExpanded(value: boolean) {
      expanded = value;
      syncExpandedState();
    },
    isExpanded() {
      return expanded;
    },
    hasContent() {
      return contentAvailable;
    },
    getContent() {
      return currentContent;
    },
    getPageNumber() {
      return pageNumber;
    },
  };
}

function appendRunError(message: string): void {
  const errorMessage = document.createElement("p");
  errorMessage.textContent = message;
  result.hidden = false;
  result.append(errorMessage);
}

function formatStatusLabel(value: string): string {
  if (value === "success") {
    return "✅";
  }

  if (value === "error") {
    return "⚠️";
  }

  return value;
}

function buildCombinedOutput(rows: PageResultRow[], includePageNumbers: boolean): string {
  return rows
    .filter((row) => row.hasContent())
    .map((row) => {
      if (!includePageNumbers) {
        return row.getContent();
      }

      return `<!-- Page ${row.getPageNumber()} -->\n${row.getContent()}`;
    })
    .join("\n\n")
    .trim();
}

function getProgressMessage(splitCompleted: number, ocrCompleted: number, pageCount: number, failedPages = 0): string {
  const failureMessage = failedPages === 0 ? "" : ` Failed ${failedPages}.`;

  if (splitCompleted >= pageCount) {
    return `OCR ${ocrCompleted}/${pageCount} pages ${failureMessage}`;
  }

  return `Split ${splitCompleted}/${pageCount} pages. OCR ${ocrCompleted}/${pageCount} pages ${failureMessage}`;
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

function syncFileSelection(): void {
  const selectedFile = getSelectedPdf();
  const label = selectedFile?.name ?? "No file selected";
  fileNameOutput.value = label;
  fileNameOutput.textContent = label;
}

function updateStartButton(): void {
  startButton.disabled = getSelectedPdf() === null;
}

function loadApiKey(): string {
  try {
    return localStorage.getItem(apiKeyStorageKey) ?? "";
  } catch {
    return "";
  }
}

function saveApiKey(value: string): void {
  try {
    if (value) {
      localStorage.setItem(apiKeyStorageKey, value);
      return;
    }

    localStorage.removeItem(apiKeyStorageKey);
  } catch {
    // Ignore storage failures and keep the UI functional.
  }
}
