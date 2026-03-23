import { applyAIAppearance, applyAIPostProcessing } from "./ai/index.ts";
import type { OrganismConfig, ParameterDef } from "./configurator/index.ts";
import { aiAppearanceParameters, configFromJSON, configToJSON, createDefaultConfig, randomizeConfig, structuralParameters } from "./configurator/index.ts";
import { createRenderer } from "./renderer/index.ts";
import { generateOrganism } from "./simulator/index.ts";
import "./style.css";

// --- State ---
let config: OrganismConfig = createDefaultConfig();
const renderer = createRenderer();
const defaultWorkerApiBaseUrl = "http://localhost:8787";
const apiBaseUrl = (import.meta.env.VITE_IMAGE_API_BASE_URL || defaultWorkerApiBaseUrl).trim();
const apiKeyStorageKey = "life-config.replicate-api-key";
let statusMessage = "";
let isRendering = false;

function getStoredApiKey(): string {
  return window.localStorage.getItem(apiKeyStorageKey) ?? "";
}

function setStoredApiKey(value: string) {
  window.localStorage.setItem(apiKeyStorageKey, value.trim());
}

// --- UI Building ---
function buildUI() {
  const app = document.querySelector<HTMLDivElement>("#app")!;
  app.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <h1>life.config</h1>
      </div>
      <div class="panel-scroll" id="panel-scroll"></div>
      <div class="toolbar" id="toolbar"></div>
    </div>
    <div class="viewport" id="viewport">
      <div class="status-bar" id="status-bar">seed: ${config.seed}</div>
    </div>
  `;

  buildParameterPanel();
  buildToolbar();
  setupViewport();
}

function buildParameterPanel() {
  const scroll = document.getElementById("panel-scroll")!;
  const savedApiKey = getStoredApiKey();
  let html = "";

  html += `
    <div class="api-key-row">
      <label for="api-key-input">API Key</label>
      <input
        type="password"
        class="text-input"
        id="api-key-input"
        value="${savedApiKey}"
        placeholder="Enter Replicate API key"
        autocomplete="off"
        spellcheck="false"
      >
    </div>
  `;

  // Seed
  html += `
    <div class="seed-row">
      <label>Seed</label>
      <input type="number" class="seed-input" id="seed-input" value="${config.seed}">
    </div>
  `;

  // Structural parameters
  html += `<div class="param-group"><div class="param-group-title">Structure</div>`;
  for (const param of structuralParameters) {
    html += buildParamSelect(param);
  }
  html += `</div>`;

  // AI appearance parameters (with badge)
  html += `<div class="param-group"><div class="param-group-title">Appearance <span class="ai-badge">AI · v2</span></div>`;
  for (const param of aiAppearanceParameters) {
    html += buildParamSelect(param, true);
  }
  html += `</div>`;

  scroll.innerHTML = html;

  // Event listeners for parameters
  scroll.addEventListener("change", (e) => {
    const target = e.target as HTMLSelectElement | HTMLInputElement;
    if (target.id === "api-key-input") {
      setStoredApiKey(target.value);
    } else if (target.id === "seed-input") {
      config.seed = parseInt(target.value, 10) || 0;
    } else if (target.dataset.param) {
      config[target.dataset.param] = target.value;
    }
    regenerate();
  });

  scroll.addEventListener("input", (e) => {
    const target = e.target as HTMLInputElement;
    if (target.id === "api-key-input") {
      setStoredApiKey(target.value);
    }
  });
}

function buildParamSelect(param: ParameterDef, disabled: boolean = false): string {
  const value = config[param.name] ?? param.defaultValue;
  const options = param.values.map((v) => `<option value="${v}" ${v === value ? "selected" : ""}>${v.replace(/_/g, " ")}</option>`).join("");
  return `
    <div class="param-row">
      <label>${param.label}</label>
      <select data-param="${param.name}" ${disabled ? "disabled" : ""}>${options}</select>
    </div>
  `;
}

function buildToolbar() {
  const toolbar = document.getElementById("toolbar")!;
  toolbar.innerHTML = `
    <button class="primary" id="btn-generate">Generate</button>
    <button id="btn-render">Render</button>
    <button id="btn-random">Randomize</button>
    <button id="btn-save">Save</button>
    <button id="btn-load">Load</button>
    <button id="btn-export">Export</button>
  `;

  document.getElementById("btn-generate")!.addEventListener("click", () => {
    config.seed = Math.floor(Math.random() * 100000);
    updateSeedInput();
    regenerate();
  });

  document.getElementById("btn-random")!.addEventListener("click", () => {
    config = randomizeConfig();
    rebuildAndRegenerate();
  });

  document.getElementById("btn-render")!.addEventListener("click", renderImage);
  document.getElementById("btn-save")!.addEventListener("click", saveConfig);
  document.getElementById("btn-load")!.addEventListener("click", loadConfig);
  document.getElementById("btn-export")!.addEventListener("click", exportImage);
  updateRenderButton();
}

function setupViewport() {
  const viewport = document.getElementById("viewport")!;
  renderer.mount(viewport);
  window.addEventListener("resize", () => renderer.resize());
  regenerate();
}

// --- Core Workflow ---
function regenerate() {
  // 1. Configurator: config is already a JSON object
  // 2. Simulator: generate geometry from config
  const geometry = generateOrganism(config);

  // 3. Renderer: display in 3D
  renderer.setOrganism(geometry);

  // 4. AI appearance (no-op in v1)
  applyAIAppearance(config);

  // 5. AI post-processing (no-op in v1)
  const canvas = renderer.getRenderer().domElement;
  applyAIPostProcessing(canvas);

  // Update status
  updateStatusBar();
}

function rebuildAndRegenerate() {
  buildParameterPanel();
  updateSeedInput();
  regenerate();
}

function updateSeedInput() {
  const seedInput = document.getElementById("seed-input") as HTMLInputElement | null;
  if (seedInput) seedInput.value = String(config.seed);
}

function updateStatusBar() {
  const bar = document.getElementById("status-bar");
  if (!bar) return;

  bar.textContent = statusMessage ? `seed: ${config.seed} · ${statusMessage}` : `seed: ${config.seed}`;
}

function updateRenderButton() {
  const button = document.getElementById("btn-render") as HTMLButtonElement | null;
  if (!button) return;

  button.disabled = isRendering;
  button.textContent = isRendering ? "Rendering..." : "Render";
}

function setStatusMessage(message: string) {
  statusMessage = message;
  updateStatusBar();
}

function humanizeValue(value: string): string {
  return value.replace(/_/g, " ");
}

function buildRenderPrompt(currentConfig: OrganismConfig): string {
  const promptParts = [
    "Edit the provided reference image into a polished alien specimen illustration",
    "preserve the existing anatomy and composition from the reference render",
    `use a ${humanizeValue(currentConfig.aesthetic_mode)} presentation`,
    `apply a ${humanizeValue(currentConfig.palette_type)} palette`,
    `render the materials with a ${humanizeValue(currentConfig.texture_type)} texture`,
    "set the background to pure black",
    "refine lighting and fine biological detail while keeping the subject centered and clearly readable",
  ];

  return promptParts.join(", ");
}

async function renderImage() {
  if (isRendering) return;

  const apiKey = getStoredApiKey();

  if (!apiKey) {
    setStatusMessage("enter api key");
    const apiKeyInput = document.getElementById("api-key-input") as HTMLInputElement | null;
    apiKeyInput?.focus();
    return;
  }

  isRendering = true;
  updateRenderButton();
  setStatusMessage("rendering image");

  try {
    const prompt = buildRenderPrompt(config);
    const referenceImage = await renderer.captureReferenceImage();
    const url = new URL("/api/generate", apiBaseUrl);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        prompt,
        referenceImage,
      }),
    });
    if (!response.ok) {
      let message = `Image API failed with status ${response.status}`;

      try {
        const errorPayload = (await response.json()) as { error?: string };
        if (errorPayload?.error) {
          message = errorPayload.error;
        }
      } catch {
        // Leave the default status-based error in place when the response isn't JSON.
      }

      throw new Error(message);
    }

    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `life-config-render-${config.seed}.webp`;
    a.click();
    URL.revokeObjectURL(downloadUrl);

    setStatusMessage("render complete");
  } catch (error) {
    console.error("Failed to render image:", error);
    setStatusMessage(error instanceof Error ? error.message : "render failed");
  } finally {
    isRendering = false;
    updateRenderButton();
  }
}

// --- Save/Load/Export ---
function saveConfig() {
  const json = configToJSON(config);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `life-config-${config.seed}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function loadConfig() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        config = configFromJSON(reader.result as string);
        rebuildAndRegenerate();
      } catch (e) {
        console.error("Failed to load config file:", e instanceof Error ? e.message : e);
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

function exportImage() {
  const canvas = renderer.getRenderer().domElement;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `life-config-${config.seed}.png`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

// --- Initialize ---
buildUI();
