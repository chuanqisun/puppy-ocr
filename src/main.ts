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

type PageOcrStatus = "queued" | "running" | "success" | "error";

type ResultTable = {
  header: ResultHeaderRow;
  rows: PageResultRow[];
};

type ResultHeaderRow = {
  setSummary: (value: string) => void;
  syncControls: () => void;
};

type PageResultRow = {
  setStatus: (value: PageOcrStatus) => void;
  setContent: (value: string) => void;
  setDownloadName: (value: string) => void;
  setRetryAction: (value: (() => void | Promise<void>) | null) => void;
  setExpanded: (value: boolean) => void;
  isExpanded: () => boolean;
  hasContent: () => boolean;
  getContent: () => string;
  getPageNumber: () => number;
  getStatus: () => PageOcrStatus;
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
  const splitPages = new Array<SplitPageResult>(pageCount);

  updateResultSummary(resultTable.rows, resultTable.header, pageCount);

  const pageIndices = Array.from({ length: pageCount }, (_, pageIndex) => pageIndex);
  await lastValueFrom(
    from(pageIndices).pipe(
      mergeMap(async (pageIndex) => {
        resultTable.rows[pageIndex].setStatus("running");
        const page = await splitPdfPage(sourcePdf, file.name, pageIndex);
        splitPages[pageIndex] = page;
        resultTable.rows[page.pageIndex].setDownloadName(createDownloadFilename(file.name, page.pageNumber, pageCount));
        resultTable.rows[page.pageIndex].setRetryAction(() => retryPageOcr(page.pageIndex, splitPages, resultTable, apiKey, pageCount));
        return page;
      }),
      mergeMap(async (page) => {
        await processPageOcr(page, resultTable, apiKey, pageCount);
      }, 10),
      toArray()
    )
  );

  const summary = {
    failedPages: countRowsWithStatus(resultTable.rows, "error"),
    pageCount,
  };

  updateResultSummary(resultTable.rows, resultTable.header, pageCount);

  return summary;
}

async function processPageOcr(page: SplitPageResult, resultTable: ResultTable, apiKey: string, pageCount: number): Promise<void> {
  const pageRow = resultTable.rows[page.pageIndex];
  pageRow.setStatus("running");

  try {
    const text = await runOcrRequest(page.file, apiKey);
    pageRow.setContent(text || "[No text returned]");
    pageRow.setStatus("success");
  } catch (error) {
    const message = error instanceof Error ? error.message : "OCR request failed.";
    pageRow.setContent(message);
    pageRow.setStatus("error");
  } finally {
    updateResultSummary(resultTable.rows, resultTable.header, pageCount);
    resultTable.header.syncControls();
  }
}

async function retryPageOcr(
  pageIndex: number,
  splitPages: Array<SplitPageResult | undefined>,
  resultTable: ResultTable,
  apiKey: string,
  pageCount: number
): Promise<void> {
  const page = splitPages[pageIndex];

  if (!page) {
    return;
  }

  await processPageOcr(page, resultTable, apiKey, pageCount);
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
  progress.textContent = getStatusSummaryMessage(0, 0, pageCount);

  const actions = document.createElement("div");
  actions.className = "result-header-actions";

  const toggleAllButton = document.createElement("button");
  toggleAllButton.type = "button";

  const downloadCombinedButton = document.createElement("button");
  downloadCombinedButton.type = "button";
  downloadCombinedButton.textContent = "Download combined";

  const downloadPagedButton = document.createElement("button");
  downloadPagedButton.type = "button";
  downloadPagedButton.textContent = "Download paged";

  actions.append(toggleAllButton, downloadCombinedButton, downloadPagedButton);
  row.append(progress, actions);

  toggleAllButton.addEventListener("click", () => {
    const shouldExpand = !rows.every((currentRow) => currentRow.isExpanded());
    rows.forEach((currentRow) => currentRow.setExpanded(shouldExpand));
    syncControls();
  });

  downloadCombinedButton.addEventListener("click", () => {
    const combinedContent = buildCombinedOutput(rows);

    if (!combinedContent) {
      return;
    }

    downloadTextFile("ocr-output.txt", combinedContent);
  });

  downloadPagedButton.addEventListener("click", () => {
    const pagedContent = buildPagedOutput(rows);

    if (!pagedContent) {
      return;
    }

    downloadTextFile("ocr-output-paged.txt", pagedContent);
  });

  function syncControls(): void {
    const hasContent = rows.some((currentRow) => currentRow.hasContent());
    toggleAllButton.disabled = !hasContent;
    downloadCombinedButton.disabled = !hasContent;
    downloadPagedButton.disabled = !hasContent;
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

  const retryButton = document.createElement("button");
  retryButton.type = "button";
  retryButton.textContent = "Retry";
  retryButton.hidden = true;

  actions.append(toggleButton, downloadButton, retryButton);

  const body = document.createElement("pre");
  body.className = "page-result-body";
  body.hidden = true;

  let currentContent = "";
  let downloadName = "ocr-output.txt";
  let expanded = false;
  let contentAvailable = false;
  let currentStatus: PageOcrStatus = "queued";
  let retryAction: (() => void | Promise<void>) | null = null;

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

  retryButton.addEventListener("click", () => {
    void retryAction?.();
  });

  row.append(details, actions, body);

  return {
    element: row,
    setStatus(value: PageOcrStatus) {
      currentStatus = value;
      rowStatus.textContent = formatStatusLabel(value);
      retryButton.hidden = value !== "error" || retryAction === null;
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
    setRetryAction(value: (() => void | Promise<void>) | null) {
      retryAction = value;
      retryButton.hidden = currentStatus !== "error" || retryAction === null;
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
    getStatus() {
      return currentStatus;
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

function buildCombinedOutput(rows: PageResultRow[]): string {
  return rows
    .filter((row) => row.hasContent())
    .map((row) => row.getContent())
    .join("\n\n")
    .trim();
}

function buildPagedOutput(rows: PageResultRow[]): string {
  return rows
    .filter((row) => row.hasContent())
    .map((row) => `<!-- Page ${row.getPageNumber()} -->\n${row.getContent()}`)
    .join("\n\n")
    .trim();
}

function updateResultSummary(rows: PageResultRow[], header: ResultHeaderRow, pageCount: number): void {
  header.setSummary(getStatusSummaryMessage(countRowsWithStatus(rows, "success"), countRowsWithStatus(rows, "error"), pageCount));
}

function countRowsWithStatus(rows: PageResultRow[], status: PageOcrStatus): number {
  return rows.filter((row) => row.getStatus() === status).length;
}

function getStatusSummaryMessage(successPages: number, failedPages: number, totalPages: number): string {
  return `${successPages} success, ${failedPages} error, ${totalPages} total`;
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
