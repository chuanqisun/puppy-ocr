import "./style.css";

const apiBaseUrl = (import.meta.env.VITE_IMAGE_API_BASE_URL as string | undefined)?.trim().replace(/\/$/, "") ?? "";

const app = document.createElement("main");
const heading = document.createElement("h1");
const intro = document.createElement("p");
const apiKeyLabel = document.createElement("label");
const apiKeyInput = document.createElement("input");
const fileLabel = document.createElement("label");
const fileInput = document.createElement("input");
const selectedFile = document.createElement("p");
const startButton = document.createElement("button");
const status = document.createElement("p");
const resultHeading = document.createElement("h2");
const result = document.createElement("pre");

heading.textContent = "Puppy OCR";
intro.textContent = "Upload one PDF, then send it to the worker for OCR.";

apiKeyLabel.htmlFor = "api-key";
apiKeyLabel.textContent = "API key";

apiKeyInput.id = "api-key";
apiKeyInput.name = "apiKey";
apiKeyInput.type = "password";
apiKeyInput.autocomplete = "off";

fileLabel.htmlFor = "pdf-file";
fileLabel.textContent = "PDF file";

fileInput.id = "pdf-file";
fileInput.name = "file";
fileInput.type = "file";
fileInput.accept = "application/pdf";

selectedFile.textContent = "No file selected.";

startButton.type = "button";
startButton.textContent = "Start OCR";
startButton.disabled = true;

status.setAttribute("aria-live", "polite");
status.textContent = "Select a PDF to begin.";

resultHeading.textContent = "Result";
result.textContent = "";

app.append(heading, intro, apiKeyLabel, apiKeyInput, fileLabel, fileInput, selectedFile, startButton, status, resultHeading, result);

document.body.replaceChildren(app);

function getSelectedPdf(): File | null {
  return fileInput.files?.[0] ?? null;
}

function updateStartButton(): void {
  startButton.disabled = getSelectedPdf() === null;
}

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
