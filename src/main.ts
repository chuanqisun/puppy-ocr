import "./style.css";

// DOM elements
const apiBaseUrl = (import.meta.env.VITE_IMAGE_API_BASE_URL as string | undefined)?.trim().replace(/\/$/, "") ?? "";
const apiKeyInput = getRequiredElement<HTMLInputElement>("api-key");
const fileInput = getRequiredElement<HTMLInputElement>("pdf-file");
const selectedFile = getRequiredElement<HTMLParagraphElement>("selected-file");
const startButton = getRequiredElement<HTMLButtonElement>("start-ocr");
const status = getRequiredElement<HTMLParagraphElement>("status");
const result = getRequiredElement<HTMLPreElement>("result");

main();
async function main() {
  fileInput.addEventListener("change", () => {
    const file = getSelectedPdf();
    selectedFile.textContent = file ? `Selected file: ${file.name}` : "No file selected.";
    status.textContent = file ? "Ready to start OCR." : "Select a PDF to begin.";
    result.textContent = "";
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

    const formData = new FormData();
    formData.set("file", file);

    startButton.disabled = true;
    status.textContent = "Uploading PDF and waiting for OCR output...";
    result.textContent = "";

    try {
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

      result.textContent = output;
      status.textContent = "OCR complete.";
    } catch (error) {
      const message = error instanceof Error ? error.message : "OCR request failed.";
      result.textContent = message;
      status.textContent = "OCR request failed.";
    } finally {
      updateStartButton();
    }
  });
}

// Pure helpers
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
