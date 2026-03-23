import "./style.css";
import {
  createDefaultConfig,
  randomizeConfig,
  configToJSON,
  configFromJSON,
  structuralParameters,
  aiAppearanceParameters,
} from "./configurator/index.ts";
import type { OrganismConfig, ParameterDef } from "./configurator/index.ts";
import { generateOrganism } from "./simulator/index.ts";
import { createRenderer } from "./renderer/index.ts";
import { applyAIAppearance, applyAIPostProcessing } from "./ai/index.ts";

// --- State ---
let config: OrganismConfig = createDefaultConfig();
const renderer = createRenderer();

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
  let html = "";

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
    if (target.id === "seed-input") {
      config.seed = parseInt(target.value, 10) || 0;
    } else if (target.dataset.param) {
      config[target.dataset.param] = target.value;
    }
    regenerate();
  });
}

function buildParamSelect(param: ParameterDef, disabled: boolean = false): string {
  const value = config[param.name] ?? param.defaultValue;
  const options = param.values
    .map((v) => `<option value="${v}" ${v === value ? "selected" : ""}>${v.replace(/_/g, " ")}</option>`)
    .join("");
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

  document.getElementById("btn-save")!.addEventListener("click", saveConfig);
  document.getElementById("btn-load")!.addEventListener("click", loadConfig);
  document.getElementById("btn-export")!.addEventListener("click", exportImage);
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
  if (bar) bar.textContent = `seed: ${config.seed}`;
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
      } catch {
        console.error("Invalid config file");
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
