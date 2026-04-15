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
  setExpanded: (value: boolean) => void;
  isExpanded: () => boolean;
  hasContent: () => boolean;
  getContent: () => string;
  getPageNumber: () => number;
  getStatus: () => PageOcrStatus;
};

type SseEvent = {
  event: string;
  data: string;
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
      await streamOcrPdf(file, apiKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : "OCR request failed.";
      clearResults();
      appendRunError(message);
    } finally {
      updateStartButton();
    }
  });
}

async function streamOcrPdf(file: File, apiKey: string): Promise<void> {
  const statusMessage = showStatusMessage("Uploading PDF...");

  const formData = new FormData();
  formData.set("file", file);

  const response = await fetch(`${apiBaseUrl}/api/ocr/stream`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    statusMessage.remove();
    const errorText = await response.text();
    throw new Error(errorText || `OCR request failed with status ${response.status}.`);
  }

  if (!response.body) {
    statusMessage.remove();
    throw new Error("No response stream available.");
  }

  let resultTable: ResultTable | null = null;
  let totalPages = 0;

  for await (const { event, data } of parseSseStream(response.body)) {
    const payload = JSON.parse(data);

    switch (event) {
      case "job-created":
        statusMessage.update("Job created, waiting for processing...");
        break;

      case "progress":
        if (payload.state === "pending") {
          statusMessage.update("Waiting in queue...");
        } else if (payload.state === "running") {
          const extracted = payload.extractedPages ?? 0;
          const total = payload.totalPages ?? 0;
          statusMessage.update(`Processing: ${extracted} of ${total} pages extracted...`);
        }
        break;

      case "total-pages":
        totalPages = payload.totalPages;
        statusMessage.remove();
        resultTable = createPageResultRows(totalPages, file.name);
        updateResultSummary(resultTable.rows, resultTable.header, totalPages);
        break;

      case "page": {
        if (!resultTable) break;
        const pageIndex = payload.pageIndex as number;
        const pageRow = resultTable.rows[pageIndex];
        if (pageRow) {
          const text = (payload.text as string) || "[No text returned]";
          pageRow.setContent(text);
          pageRow.setStatus("success");
          updateResultSummary(resultTable.rows, resultTable.header, totalPages);
          resultTable.header.syncControls();
        }
        break;
      }

      case "done":
        if (resultTable) {
          for (const row of resultTable.rows) {
            if (row.getStatus() === "queued") {
              row.setContent("[No text returned]");
              row.setStatus("error");
            }
          }
          updateResultSummary(resultTable.rows, resultTable.header, totalPages);
          resultTable.header.syncControls();
        }
        break;

      case "error":
        statusMessage.remove();
        throw new Error(payload.message || "OCR processing failed.");
    }
  }
}

function showStatusMessage(text: string): { update: (text: string) => void; remove: () => void } {
  const message = document.createElement("p");
  message.className = "status-message";
  message.textContent = text;
  result.hidden = false;
  result.append(message);

  return {
    update(newText: string) {
      message.textContent = newText;
    },
    remove() {
      message.remove();
    },
  };
}

async function* parseSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      const parsed = parseSseEventBlock(part);
      if (parsed) yield parsed;
    }
  }

  if (buffer.trim()) {
    const parsed = parseSseEventBlock(buffer);
    if (parsed) yield parsed;
  }
}

function parseSseEventBlock(block: string): SseEvent | null {
  let event = "";
  let data = "";

  for (const line of block.split("\n")) {
    if (line.startsWith("event: ")) {
      event = line.slice(7);
    } else if (line.startsWith("data: ")) {
      data = line.slice(6);
    }
  }

  return event && data ? { event, data } : null;
}

function clearResults(): void {
  result.replaceChildren();
  result.hidden = true;
}

function createPageResultRows(pageCount: number, filename: string): ResultTable {
  let syncHeaderControls = () => {};
  const rows = Array.from({ length: pageCount }, (_, pageIndex) => {
    const row = createPageResultRow(pageIndex + 1, pageCount, () => syncHeaderControls());
    row.setDownloadName(createDownloadFilename(filename, pageIndex + 1, pageCount));
    return row;
  });
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

  actions.append(toggleButton, downloadButton);

  const body = document.createElement("pre");
  body.className = "page-result-body";
  body.hidden = true;

  let currentContent = "";
  let downloadName = "ocr-output.txt";
  let expanded = false;
  let contentAvailable = false;
  let currentStatus: PageOcrStatus = "queued";

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
    setStatus(value: PageOcrStatus) {
      currentStatus = value;
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

function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(objectUrl);
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
