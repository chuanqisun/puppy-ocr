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

type SseProgressEvent = { state: "pending" } | { state: "running"; totalPages: number; extractedPages: number } | { state: "done"; extractedPages: number };
type SsePageEvent = { pageNumber: number; text: string };
type SseDoneEvent = { pageCount: number };
type SseErrorEvent = { message: string };

type PageResultRow = {
  setStatus: (value: PageOcrStatus) => void;
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
      await runOcrStream(file, apiKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : "OCR request failed.";
      clearResults();
      appendRunError(message);
    } finally {
      updateStartButton();
    }
  });
}

async function runOcrStream(file: File, apiKey: string): Promise<void> {
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
    const text = await response.text();
    throw new Error(text || `OCR request failed with status ${response.status}.`);
  }

  if (!response.body) {
    throw new Error("No response body received.");
  }

  const header = createResultHeader();
  const pageRows: (PageResultRow & { element: HTMLElement })[] = [];
  result.hidden = false;
  result.append(header.element);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const { events, remainder } = parseSseBuffer(buffer);
      buffer = remainder;

      for (const { eventType, data } of events) {
        if (eventType === "progress") {
          const progress = JSON.parse(data) as SseProgressEvent;
          header.setProgress(progress);
          header.syncControls(pageRows);
        } else if (eventType === "page") {
          const page = JSON.parse(data) as SsePageEvent;
          const row = createPageResultRow(page.pageNumber, pageRows.length + 1, () => header.syncControls(pageRows));
          row.setContent(page.text || "[No text returned]");
          row.setStatus("success");
          row.setDownloadName(`ocr-page-${String(page.pageNumber).padStart(3, "0")}.txt`);
          pageRows.push(row);
          result.append(row.element);
          header.syncControls(pageRows);
        } else if (eventType === "done") {
          const doneData = JSON.parse(data) as SseDoneEvent;
          header.setDone(doneData.pageCount);
          header.syncControls(pageRows);
        } else if (eventType === "error") {
          const errorData = JSON.parse(data) as SseErrorEvent;
          throw new Error(errorData.message);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseSseBuffer(buffer: string): { events: Array<{ eventType: string; data: string }>; remainder: string } {
  const events: Array<{ eventType: string; data: string }> = [];
  const blocks = buffer.split("\n\n");
  const remainder = blocks.pop() ?? "";

  for (const block of blocks) {
    let eventType = "message";
    let data = "";

    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        data = line.slice(6);
      }
    }

    if (data) {
      events.push({ eventType, data });
    }
  }

  return { events, remainder };
}

function createResultHeader(): {
  element: HTMLElement;
  setProgress: (progress: SseProgressEvent) => void;
  setDone: (pageCount: number) => void;
  syncControls: (rows: (PageResultRow & { element: HTMLElement })[]) => void;
} {
  const row = document.createElement("article");
  row.className = "result-header";

  const progress = document.createElement("strong");
  progress.className = "result-header-summary";
  progress.textContent = "Starting OCR…";

  const actions = document.createElement("div");
  actions.className = "result-header-actions";

  const toggleAllButton = document.createElement("button");
  toggleAllButton.type = "button";
  toggleAllButton.disabled = true;

  const downloadCombinedButton = document.createElement("button");
  downloadCombinedButton.type = "button";
  downloadCombinedButton.textContent = "Download combined";
  downloadCombinedButton.disabled = true;

  const downloadPagedButton = document.createElement("button");
  downloadPagedButton.type = "button";
  downloadPagedButton.textContent = "Download paged";
  downloadPagedButton.disabled = true;

  actions.append(toggleAllButton, downloadCombinedButton, downloadPagedButton);
  row.append(progress, actions);

  function syncControls(rows: (PageResultRow & { element: HTMLElement })[]): void {
    const hasContent = rows.some((r) => r.hasContent());
    toggleAllButton.disabled = !hasContent;
    downloadCombinedButton.disabled = !hasContent;
    downloadPagedButton.disabled = !hasContent;
    toggleAllButton.textContent = rows.every((r) => r.isExpanded()) ? "Hide all" : "Show all";

    toggleAllButton.onclick = () => {
      const shouldExpand = !rows.every((r) => r.isExpanded());
      rows.forEach((r) => r.setExpanded(shouldExpand));
      syncControls(rows);
    };

    downloadCombinedButton.onclick = () => {
      const combined = rows
        .filter((r) => r.hasContent())
        .map((r) => r.getContent())
        .join("\n\n")
        .trim();
      if (combined) downloadTextFile("ocr-output.txt", combined);
    };

    downloadPagedButton.onclick = () => {
      const paged = rows
        .filter((r) => r.hasContent())
        .map((r) => `<!-- Page ${r.getPageNumber()} -->\n${r.getContent()}`)
        .join("\n\n")
        .trim();
      if (paged) downloadTextFile("ocr-output-paged.txt", paged);
    };
  }

  return {
    element: row,
    setProgress(prog: SseProgressEvent) {
      if (prog.state === "pending") {
        progress.textContent = "OCR job pending…";
      } else if (prog.state === "running") {
        progress.textContent = `OCR running: ${prog.extractedPages} / ${prog.totalPages} pages`;
      } else if (prog.state === "done") {
        progress.textContent = `OCR complete: ${prog.extractedPages} pages extracted`;
      }
    },
    setDone(pageCount: number) {
      progress.textContent = `Done — ${pageCount} page${pageCount === 1 ? "" : "s"} extracted`;
    },
    syncControls,
  };
}

function createPageResultRow(
  pageNumber: number,
  pageIndex: number,
  onExpandedChange: () => void
): PageResultRow & { element: HTMLElement } {
  const row = document.createElement("article");
  row.className = "page-result";

  const details = document.createElement("div");
  details.className = "page-result-details";

  const heading = document.createElement("strong");
  heading.textContent = `Page ${pageIndex}`;

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
    setStatus(value: PageOcrStatus) {
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

function clearResults(): void {
  result.replaceChildren();
  result.hidden = true;
}

function appendRunError(message: string): void {
  const errorMessage = document.createElement("p");
  errorMessage.textContent = message;
  result.hidden = false;
  result.append(errorMessage);
}

function formatStatusLabel(value: string): string {
  if (value === "success") return "✅";
  if (value === "error") return "⚠️";
  return value;
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
