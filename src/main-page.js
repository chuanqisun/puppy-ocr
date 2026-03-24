import { clear as idbClear, get as idbGet, set as idbSet } from "idb-keyval";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { images as demoImages } from "./assets/assets.js";
import { buildRenderCacheKey, RenderQueue } from "./render-queue.js";
import { playMorphSfx, playRevealSfx, primeSfx, stopAllSfx } from "./sfx.js";

const imageApiBaseUrl = (import.meta.env.VITE_IMAGE_API_BASE_URL ?? window.location.origin).trim();
const captureRequested = new URLSearchParams(window.location.search).get("capture") === "true";
const publicBaseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);

// Clear idb-keyval cache on app start
idbClear();
const PARAMETER_IDS = ["order", "warp", "fold", "spike", "chaos"];

const APP = {
  camera: { fov: 50, near: 0.1, far: 100, position: [0, 0, 30] },
  renderer: { clearColor: 0x000000, pixelRatioMax: 2 },
  timing: {
    mutationInterpMs: 2000,
    mutationHoldMs: 500,
    overlayFadeInMs: 500,
    overlayHoldMs: 1000,
  },
  mutation: {
    futureBufferSize: 3,
  },
  api: {
    baseUrl: imageApiBaseUrl,
    apiKeyStorageKey: "life-config.replicate-api-key",
    livePreviewStorageKey: "life-config.live-preview",
    renderStyleStorageKey: "life-config.render-style",
    snapshotSize: 512,
  },
  mesh: {
    color: 0xffffff,
    solidOpacity: 1.0,
    meshOpacity: 0.1,
    pointOpacity: 0.9,
    pointSize: 0.02,
    uSeg: 220,
    vSeg: 100,
    xzScale: 1.28,
    yFoldScale: 0.55,
    layerBaseScale: 1.1,
    layerScaleStep: 0.42,
    layerPhaseStep: 0.45,
    rotXStep: 0.19,
    rotYStep: 0.41,
    rotZStep: 0.13,
  },
  dna: {
    defaults: { layers: 3 },
    ranges: {
      order: { min: 1, max: 8, step: 0.01 },
      warp: { min: 0, max: 3, step: 0.01 },
      fold: { min: 0, max: 1.6, step: 0.01 },
      spike: { min: 0, max: 0.5, step: 0.01 },
      chaos: { min: 0, max: 1.2, step: 0.01 },
      layers: { min: 1, max: 6, step: 1 },
    },
  },
};

const scene = new THREE.Scene();

const INTRINSIC_SIZE = 3072;

const camera = new THREE.PerspectiveCamera(APP.camera.fov, 1, APP.camera.near, APP.camera.far);
camera.position.set(...APP.camera.position);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(INTRINSIC_SIZE, INTRINSIC_SIZE, false);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(APP.renderer.clearColor, 1);
renderer.domElement.addEventListener("pointerdown", (event) => {
  void primeSfx();
  if (event.pointerType === "mouse") lastPointerButton = event.button;
});
window.addEventListener("keydown", () => {
  void primeSfx();
});
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
// controls.enableDamping = true;
controls.enablePan = false;
controls.mouseButtons.RIGHT = null;
renderer.domElement.removeEventListener("contextmenu", controls._onContextMenu);

const ambient = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
keyLight.position.set(4, 5, 7);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 0.7);
fillLight.position.set(-5, -2, 4);
scene.add(fillLight);

const RENDER_MODE_SEQUENCE = ["point", "mesh", "solid"];
const RENDER_STYLE_SEQUENCE = ["organ", "flora", "liquid", "ribbon", "mineral"];
const APP_MODE_SEQUENCE = ["manual", "preview", "demo"];
const SPACE_HOLD_DELAY_MS = 180;
const LIVE_PREVIEW_REFRESH_DELAY_MS = 500;
const MOBILE_VIEWPORT_MEDIA_QUERY = "(max-width: 767px)";
const UI_VALUE_FIELDS = ["order", "warp", "fold", "spike", "chaos"];
const RENDER_MODE_SELECTOR = 'input[name="renderMode"]';
const RENDER_STYLE_SELECTOR = 'input[name="renderStyle"]';
const APP_MODE_SELECTOR = "[data-mode]";

const world = new THREE.Group();
scene.add(world);

const dom = {
  apiKey: document.getElementById("apiKey"),
  beginButton: document.getElementById("beginBtn"),
  hideButton: document.getElementById("hideBtn"),
  launchOverlay: document.getElementById("launchOverlay"),
  randomizeButton: document.getElementById("randomizeBtn"),
  status: document.getElementById("status"),
  snapshotOverlay: document.getElementById("snapshotOverlay"),
  snapshotImage: document.getElementById("snapshotImage"),
  uiShell: document.getElementById("uiShell"),
  canvas: renderer.domElement,
};

let mutateOn = false;
let mutationState = null;
const futureMutationQueue = [];
let renderMode = "point";
let renderStyle = getStoredRenderStyle();
let menuHidden = isMobileViewport();
let statusMessage = "";
let keyboardHoldTimer = 0;
let keyboardSpacePressed = false;
let keyboardHoldActive = false;
let holdOverlayToken = 0;
let lastPointerButton = null;
let livePreviewEnabled = getStoredLivePreview();
let livePreviewRefreshTimer = 0;
let livePreviewToken = 0;
let cameraInteracting = false;
let appMode = getInitialAppMode();
let forwardedOverlayPointerId = null;
let captureDirectoryHandle = null;
let captureInitializationPromise = null;
let captureWriteQueue = Promise.resolve();
let demoAssetOrder = shuffleArray(demoImages.map((_, index) => index));
let demoAssetCursor = 0;
let appStarted = false;

const renderQueue = new RenderQueue({
  concurrency: 3,
  cache: {
    get: async (key) => {
      try {
        const cached = await idbGet(key);
        return cached && cached.trim() ? cached : null;
      } catch {
        return null;
      }
    },
    set: async (key, value) => {
      try {
        await idbSet(key, value);
      } catch (error) {
        console.warn("Unable to cache render result:", error);
      }
    },
  },
});

function getRenderCacheKey(dna, rotation, style = renderStyle) {
  return buildRenderCacheKey({
    style,
    source: getStoredApiKey() ? "ai" : "reference",
    dna,
    rotation,
    camera: {
      position: camera.position,
      quaternion: camera.quaternion,
    },
  });
}

function cloneVector3(vector) {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function cloneQuaternion(quaternion) {
  return { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w };
}

function shuffleArray(values) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const nextIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[nextIndex]] = [shuffled[nextIndex], shuffled[index]];
  }
  return shuffled;
}

function cloneCameraStateValue(cameraState) {
  return {
    position: { ...cameraState.position },
    target: { ...cameraState.target },
    quaternion: { ...cameraState.quaternion },
  };
}

function serializeCaptureRecord({ dna, rotation = null, camera = null, style = null }) {
  return JSON.stringify({
    dna: roundCaptureDNA(dna),
    rotation: rotation
      ? {
          x: roundCaptureValue(rotation.x),
          y: roundCaptureValue(rotation.y),
        }
      : null,
    camera: camera
      ? {
          position: {
            x: roundCaptureValue(camera.position.x),
            y: roundCaptureValue(camera.position.y),
            z: roundCaptureValue(camera.position.z),
          },
          target: {
            x: roundCaptureValue(camera.target.x),
            y: roundCaptureValue(camera.target.y),
            z: roundCaptureValue(camera.target.z),
          },
          quaternion: {
            x: roundCaptureValue(camera.quaternion.x),
            y: roundCaptureValue(camera.quaternion.y),
            z: roundCaptureValue(camera.quaternion.z),
            w: roundCaptureValue(camera.quaternion.w),
          },
        }
      : null,
    ...(style ? { style: normalizeRenderStyle(style) } : {}),
  });
}

function getDemoAssetStyle(asset) {
  return normalizeRenderStyle(asset?.style ?? "mineral");
}

function getDemoAssetHashInput(asset) {
  return serializeCaptureRecord({
    dna: asset.dna,
    rotation: asset.rotation,
    camera: asset.camera,
    style: getDemoAssetStyle(asset),
  });
}

function getNextDemoAsset() {
  if (!demoImages.length) return null;

  if (demoAssetCursor >= demoAssetOrder.length) {
    demoAssetOrder = shuffleArray(demoImages.map((_, index) => index));
    demoAssetCursor = 0;
  }

  return demoImages[demoAssetOrder[demoAssetCursor++]];
}

function getDemoOutputUrl(hash) {
  return new URL(`output/${hash}.webp`, publicBaseUrl).toString();
}

function shouldUseLocalDemoAssets() {
  return mutateOn && !captureRequested;
}

function applyCameraState(cameraState) {
  if (!cameraState) return;

  camera.position.set(cameraState.position.x, cameraState.position.y, cameraState.position.z);
  camera.quaternion.set(cameraState.quaternion.x, cameraState.quaternion.y, cameraState.quaternion.z, cameraState.quaternion.w);
  controls.target.set(cameraState.target.x, cameraState.target.y, cameraState.target.z);
  camera.updateMatrixWorld();
  controls.update();
}

function preloadImageUrl(imageUrl, signal) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener("abort", handleAbort);
    };
    const handleAbort = () => {
      cleanup();
      reject(new DOMException("Image preload aborted", "AbortError"));
    };

    image.onload = () => {
      cleanup();
      resolve(imageUrl);
    };
    image.onerror = () => {
      cleanup();
      reject(new Error(`Missing demo image: ${imageUrl}`));
    };

    if (signal?.aborted) {
      handleAbort();
      return;
    }

    signal?.addEventListener("abort", handleAbort, { once: true });
    image.src = imageUrl;
  });
}

function roundCaptureValue(value) {
  return Number(value.toFixed(3));
}

function roundCaptureVector3(vector) {
  return {
    x: roundCaptureValue(vector.x),
    y: roundCaptureValue(vector.y),
    z: roundCaptureValue(vector.z),
  };
}

function roundCaptureQuaternion(quaternion) {
  return {
    x: roundCaptureValue(quaternion.x),
    y: roundCaptureValue(quaternion.y),
    z: roundCaptureValue(quaternion.z),
    w: roundCaptureValue(quaternion.w),
  };
}

function roundCaptureDNA(dna) {
  return {
    order: roundCaptureValue(dna.order),
    warp: roundCaptureValue(dna.warp),
    fold: roundCaptureValue(dna.fold),
    spike: roundCaptureValue(dna.spike),
    chaos: roundCaptureValue(dna.chaos),
    layers: dna.layers,
  };
}

function getCameraState() {
  return {
    position: roundCaptureVector3(camera.position),
    target: roundCaptureVector3(controls.target),
    quaternion: roundCaptureQuaternion(camera.quaternion),
  };
}

function buildCaptureRecord(state) {
  return JSON.parse(
    serializeCaptureRecord({
      dna: state.to,
      rotation: state.revealRotation,
      camera: state.camera,
      style: state.renderStyle,
    })
  );
}

async function computeCaptureHash(input) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function dataUrlToPngBlob(dataUrl) {
  const image = new Image();
  image.decoding = "async";
  image.src = dataUrl;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create capture canvas");
  context.drawImage(image, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Unable to encode capture image as PNG"));
    }, "image/png");
  });
}

async function appendTextFile(directoryHandle, fileName, content) {
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const existingFile = await fileHandle.getFile();
  const writable = await fileHandle.createWritable({ keepExistingData: true });

  try {
    await writable.seek(existingFile.size);
    await writable.write(content);
    await writable.close();
  } catch (error) {
    await writable.abort();
    throw error;
  }
}

async function saveCapturedSnapshot(state, imageUrl) {
  if (!captureRequested || !captureDirectoryHandle || !imageUrl || state.captureSaved) return;

  const record = buildCaptureRecord(state);
  const hash = await computeCaptureHash(JSON.stringify(record));
  const imageFile = `${hash}.png`;
  const imageBlob = await dataUrlToPngBlob(imageUrl);
  const imageFileHandle = await captureDirectoryHandle.getFileHandle(imageFile, { create: true });
  const imageWritable = await imageFileHandle.createWritable();

  try {
    await imageWritable.write(imageBlob);
    await imageWritable.close();
    await appendTextFile(captureDirectoryHandle, "index.jsonl", `${JSON.stringify(record)}\n`);
    state.captureSaved = true;
  } catch (error) {
    await imageWritable.abort();
    throw error;
  }
}

function enqueueCapturedSnapshotSave(state, imageUrl) {
  if (!captureRequested || !captureDirectoryHandle || !imageUrl || state.captureSaved || state.captureQueued) return;

  state.captureQueued = true;
  captureWriteQueue = captureWriteQueue
    .then(() => saveCapturedSnapshot(state, imageUrl))
    .catch((error) => {
      console.error("Failed to save captured snapshot:", error);
      setStatusMessage(error instanceof Error ? error.message : "capture save failed");
    })
    .finally(() => {
      state.captureQueued = false;
    });
}

async function ensureCaptureDirectoryReady() {
  if (!captureRequested) return true;

  if (!window.showDirectoryPicker) {
    setStatusMessage("capture mode requires File System Access API support");
    return false;
  }

  if (captureDirectoryHandle) return true;
  if (captureInitializationPromise) return captureInitializationPromise;

  captureInitializationPromise = (async () => {
    try {
      captureDirectoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      setStatusMessage("capture directory ready");
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatusMessage("capture directory selection cancelled");
        return false;
      }

      console.error("Failed to initialize capture directory:", error);
      setStatusMessage(error instanceof Error ? error.message : "capture setup failed");
      return false;
    } finally {
      captureInitializationPromise = null;
    }
  })();

  return captureInitializationPromise;
}

function createRenderTask(dna, rotation, style = renderStyle) {
  return async (signal) => {
    const referenceImage = await captureReferenceImageForDNA(dna, rotation, getReferenceRenderModeForAi());
    const apiKey = getStoredApiKey();
    if (!apiKey) return referenceImage;
    return requestGeneratedImage(referenceImage, style, signal);
  };
}

function createDemoAssetTask(state) {
  return async (signal) => {
    const hash = await computeCaptureHash(state.demoAssetHashInput);
    return preloadImageUrl(getDemoOutputUrl(hash), signal);
  };
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Unable to encode generated image"));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Unable to read generated image blob"));
    };
    reader.readAsDataURL(blob);
  });
}

function applyTimingConstants() {
  const root = document.documentElement;
  root.style.setProperty("--snapshot-overlay-fade-in-ms", `${APP.timing.overlayFadeInMs}ms`);
}

function applyGroupRotation(group, rotation) {
  group.rotation.x = rotation.x;
  group.rotation.y = rotation.y;
}

function getStoredApiKey() {
  return window.localStorage.getItem(APP.api.apiKeyStorageKey) ?? "";
}

function setStoredApiKey(value) {
  window.localStorage.setItem(APP.api.apiKeyStorageKey, value.trim());
}

function getStoredRenderStyle() {
  const value = window.localStorage.getItem(APP.api.renderStyleStorageKey);
  if (value === "powder") return "liquid";
  if (value === "supernova") return "ribbon";
  return value === "organ" || value === "flora" || value === "liquid" || value === "ribbon" || value === "mineral" ? value : "mineral";
}

function getStoredLivePreview() {
  return false;
}

function isMobileViewport() {
  return window.matchMedia(MOBILE_VIEWPORT_MEDIA_QUERY).matches;
}

function getInitialAppMode() {
  if (!livePreviewEnabled) return "demo";
  if (mutateOn) return "demo";
  if (livePreviewEnabled) return "preview";
  return "manual";
}

function setStoredRenderStyle(value) {
  renderStyle = normalizeRenderStyle(value);
  window.localStorage.setItem(APP.api.renderStyleStorageKey, renderStyle);
}

function setStoredLivePreview(value) {
  window.localStorage.setItem(APP.api.livePreviewStorageKey, value ? "true" : "false");
}

function setStatusMessage(message) {
  statusMessage = message;
  dom.status.textContent = message || getModeHint(appMode);
}

function syncAppModeFromState() {
  appMode = mutateOn ? "demo" : livePreviewEnabled ? "preview" : "manual";
}

function syncParameterValueLabels() {
  UI_VALUE_FIELDS.forEach((id) => {
    document.getElementById(`${id}Val`).textContent = (+document.getElementById(id).value).toFixed(2);
  });
}

function syncCheckedInputs(selector, selectedValue) {
  document.querySelectorAll(selector).forEach((input) => {
    input.checked = input.value === selectedValue;
  });
}

function syncUI() {
  syncAppModeFromState();
  syncParameterValueLabels();
  syncCheckedInputs(RENDER_MODE_SELECTOR, renderMode);
  syncCheckedInputs(RENDER_STYLE_SELECTOR, renderStyle);
  document.querySelectorAll(APP_MODE_SELECTOR).forEach((button) => {
    const isActive = button.dataset.mode === appMode;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
  dom.hideButton.textContent = menuHidden ? "Menu" : "Hide";
  dom.apiKey.value = getStoredApiKey();
  dom.uiShell.classList.toggle("collapsed", menuHidden);
  dom.launchOverlay.classList.toggle("hidden", appStarted);
  dom.status.textContent = statusMessage || getModeHint(appMode);
}

async function startApp() {
  if (appStarted) return;

  appStarted = true;
  syncUI();

  try {
    await primeSfx();
  } catch (error) {
    console.warn("Unable to prime audio:", error);
  }

  await setAppMode("demo");
}

function readDNAFromUI() {
  return {
    order: +document.getElementById("order").value,
    warp: +document.getElementById("warp").value,
    fold: +document.getElementById("fold").value,
    spike: +document.getElementById("spike").value,
    chaos: +document.getElementById("chaos").value,
    layers: APP.dna.defaults.layers,
  };
}

function writeDNAControls(d) {
  document.getElementById("order").value = d.order.toFixed(2);
  document.getElementById("warp").value = d.warp.toFixed(2);
  document.getElementById("fold").value = d.fold.toFixed(2);
  document.getElementById("spike").value = d.spike.toFixed(2);
  document.getElementById("chaos").value = d.chaos.toFixed(2);
}

function setDNAValues(d) {
  writeDNAControls(d);
  syncUI();
  buildMorphology();
}

function stopMutationMode() {
  clearFutureMutationQueue();
  if (mutationState?.imageUrl) revokeMutationImageUrl(mutationState);
  if (mutationState?.renderCacheKey) renderQueue.cancel(mutationState.renderCacheKey);
  mutationState = null;
  mutateOn = false;
  syncAppModeFromState();
  stopAllSfx();
  hideSnapshotOverlay({ immediate: true, status: "" });
}

function getMutationDurationMs() {
  return APP.timing.mutationInterpMs;
}

function getMutationHoldDurationMs() {
  return APP.timing.mutationHoldMs;
}

function getMutationRevealDelayMs() {
  return getMutationDurationMs() + getMutationHoldDurationMs();
}

function getMutationCycleDurationMs() {
  return getMutationRevealDelayMs() + APP.timing.overlayFadeInMs + APP.timing.overlayHoldMs;
}

function getOverlayFadeInDurationMs() {
  return APP.timing.overlayFadeInMs;
}

function getOverlayHoldDurationMs() {
  return APP.timing.overlayHoldMs;
}

function isFormFieldTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("input, textarea, select, button, [contenteditable='true']"));
}

function getCurrentWorldRotation() {
  return { x: world.rotation.x, y: world.rotation.y };
}

function revokeMutationImageUrl(state) {
  if (state?.imageUrl?.startsWith("blob:")) URL.revokeObjectURL(state.imageUrl);
}

function clearFutureMutationQueue() {
  while (futureMutationQueue.length) {
    const state = futureMutationQueue.pop();
    if (state.renderCacheKey) renderQueue.cancel(state.renderCacheKey);
    revokeMutationImageUrl(state);
  }
}

function clearKeyboardHoldTimer() {
  if (!keyboardHoldTimer) return;
  window.clearTimeout(keyboardHoldTimer);
  keyboardHoldTimer = 0;
}

function clearLivePreviewRefreshTimer() {
  if (!livePreviewRefreshTimer) return;
  window.clearTimeout(livePreviewRefreshTimer);
  livePreviewRefreshTimer = 0;
}

function cancelPendingLivePreviewRequest() {
  livePreviewToken += 1;
  clearLivePreviewRefreshTimer();
}

function shouldRestartMutationAfterControlEnd() {
  const shouldRestart = lastPointerButton !== 2;
  lastPointerButton = null;
  return shouldRestart;
}

function disposeMaterial(mat) {
  if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
  else mat.dispose();
}

function clearGroup(group) {
  while (group.children.length) {
    const obj = group.children.pop();
    obj.traverse?.((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) disposeMaterial(child.material);
    });
  }
}

function createLayerObject(geo, mode = renderMode) {
  if (mode === "point") {
    return new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: APP.mesh.color,
        transparent: true,
        opacity: APP.mesh.pointOpacity,
        size: APP.mesh.pointSize,
        sizeAttenuation: true,
      })
    );
  }

  return new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: APP.mesh.color,
      transparent: true,
      opacity: mode === "mesh" ? APP.mesh.meshOpacity : APP.mesh.solidOpacity,
      roughness: 0.55,
      metalness: 0.0,
      side: THREE.DoubleSide,
      wireframe: mode === "mesh",
    })
  );
}

function buildLayer(d, layerIndex, group = world, mode = renderMode) {
  const { positions, indices } = buildLayerGeometryData(d, layerIndex, APP.mesh);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const obj = createLayerObject(geo, mode);
  obj.rotation.x = layerIndex * APP.mesh.rotXStep;
  obj.rotation.y = layerIndex * APP.mesh.rotYStep;
  obj.rotation.z = layerIndex * APP.mesh.rotZStep;
  group.add(obj);
}

function buildMorphology() {
  clearGroup(world);
  const d = readDNAFromUI();
  for (let i = 0; i < d.layers; i++) buildLayer(d, i);
}

function setRenderMode(mode) {
  renderMode = mode;
  syncUI();
  buildMorphology();
}

function triggerSingleMutationTransition() {
  if (mutateOn) stopMutationMode();
  const shouldUseLivePreview = livePreviewEnabled;
  appMode = shouldUseLivePreview ? "preview" : "manual";
  releaseHoldOverlay();
  clearFutureMutationQueue();
  if (shouldUseLivePreview) suspendLivePreview("animating to buffered target");
  beginQueuedMutation(performance.now(), {
    shouldLoop: false,
    prepareImage: shouldUseLivePreview,
  });
  syncUI();
}

function beginQueuedMutation(now = performance.now(), options = {}) {
  const { shouldLoop = mutateOn, prepareImage = shouldLoop } = options;

  if (mutationState?.renderCacheKey) renderQueue.cancel(mutationState.renderCacheKey);
  if (mutationState?.imageUrl) revokeMutationImageUrl(mutationState);
  mutationState = null;

  if (!futureMutationQueue.length) queueFutureMutation(now, { prepareImage });
  else if (mutateOn) ensureFutureMutationBuffer(now);

  const nextState = futureMutationQueue.shift();
  if (!nextState) return false;

  mutationState = nextState;
  renderStyle = normalizeRenderStyle(mutationState.renderStyle);
  applyGroupRotation(world, mutationState.revealRotation);
  applyCameraState(mutationState.camera);
  mutationState.phase = "interp";
  mutationState.phaseStart = now;
  mutationState.shouldLoop = shouldLoop;

  if (mutateOn) ensureFutureMutationBuffer(now);
  syncUI();
  playMorphSfx({
    durationMs: getMutationDurationMs(),
    intensity: getSfxIntensity(mutationState.to),
  });
  setStatusMessage(getStoredApiKey() ? "animating to buffered target" : "missing api key; animating only");
  return true;
}

function continueAfterHeldMutation(now = performance.now()) {
  if (!mutationState) return;

  if (mutationState.imageUrl) {
    showSnapshotOverlay(mutationState.imageUrl, mutationState);
    return;
  }

  if (mutationState.imageSettled) {
    const shouldLoop = mutationState.shouldLoop;
    mutationState = null;
    if (shouldLoop) startMutationCycle(now);
    else if (livePreviewEnabled) refreshLivePreview({ status: "capturing live preview" });
    else setStatusMessage("loaded next parameter set");
    return;
  }

  mutationState.phase = "awaitingImage";
  mutationState.phaseStart = now;
  setStatusMessage("waiting for generated image");
}

function suspendLivePreview(status = "") {
  cancelPendingLivePreviewRequest();
  hideSnapshotOverlay({ immediate: true, status });
}

function queueLivePreviewRefresh(debounceMs = LIVE_PREVIEW_REFRESH_DELAY_MS, status = "capturing live preview") {
  if (!livePreviewEnabled) return;
  suspendLivePreview("");
  refreshLivePreview({ debounceMs, status });
}

function refreshLivePreview(options = {}) {
  const { debounceMs = 0, status = "capturing live preview" } = options;

  if (!livePreviewEnabled || mutateOn || keyboardHoldActive || cameraInteracting) return;

  cancelPendingLivePreviewRequest();
  const requestToken = ++livePreviewToken;
  const startRequest = () => {
    if (!livePreviewEnabled || mutateOn || keyboardHoldActive || cameraInteracting || requestToken !== livePreviewToken) return;

    const rotation = getCurrentWorldRotation();
    const dna = cloneDNAState(readDNAFromUI());

    hideSnapshotOverlay({ immediate: true, status });

    requestOverlayForState(dna, rotation)
      .then((imageUrl) => {
        if (!livePreviewEnabled || mutateOn || keyboardHoldActive || cameraInteracting || requestToken !== livePreviewToken) {
          if (typeof imageUrl === "string" && imageUrl.startsWith("blob:")) URL.revokeObjectURL(imageUrl);
          return;
        }
        showSnapshotOverlay(imageUrl, null, "showing live preview");
      })
      .catch((error) => {
        if (!livePreviewEnabled || requestToken !== livePreviewToken) return;
        setStatusMessage(error instanceof Error ? error.message : "live preview failed");
      });
  };

  if (debounceMs > 0) {
    livePreviewRefreshTimer = window.setTimeout(() => {
      livePreviewRefreshTimer = 0;
      startRequest();
    }, debounceMs);
    return;
  }

  startRequest();
}

function setLivePreviewEnabled(enabled) {
  if (enabled && mutateOn) {
    releaseHoldOverlay();
    stopMutationMode();
  }

  livePreviewEnabled = enabled;
  setStoredLivePreview(enabled);
  syncAppModeFromState();

  if (enabled) {
    releaseHoldOverlay();
    refreshLivePreview();
  } else {
    suspendLivePreview("");
  }

  syncUI();
}

async function setAppMode(mode) {
  const modeAlreadyApplied =
    (mode === "demo" && appMode === mode && mutateOn) ||
    (mode === "preview" && appMode === mode && livePreviewEnabled) ||
    (mode === "manual" && appMode === mode && !mutateOn && !livePreviewEnabled);

  if (!APP_MODE_SEQUENCE.includes(mode) || modeAlreadyApplied) {
    syncUI();
    return;
  }

  releaseHoldOverlay();

  if (mode !== "demo" && mutateOn) stopMutationMode();

  if (mode !== "preview" && livePreviewEnabled) {
    livePreviewEnabled = false;
    setStoredLivePreview(false);
    suspendLivePreview("");
  }

  appMode = mode;

  if (mode === "preview") {
    setLivePreviewEnabled(true);
    return;
  }

  if (mode === "demo") {
    const captureReady = await ensureCaptureDirectoryReady();
    if (!captureReady) {
      syncAppModeFromState();
      syncUI();
      return;
    }

    mutateOn = true;
    await primeSfx();
    playMorphSfx({
      durationMs: getMutationDurationMs(),
      intensity: getSfxIntensity(readDNAFromUI()),
    });
    ensureFutureMutationBuffer(performance.now());
  }

  syncUI();
}

function getQueueSeed(now) {
  const lastQueuedState = futureMutationQueue[futureMutationQueue.length - 1];
  if (lastQueuedState) {
    return {
      from: cloneDNAState(lastQueuedState.to),
      plannedStart: lastQueuedState.plannedStart + getMutationCycleDurationMs(),
    };
  }

  if (mutationState) {
    return {
      from: cloneDNAState(mutationState.to),
      plannedStart: mutationState.plannedStart + getMutationCycleDurationMs(),
    };
  }

  return {
    from: cloneDNAState(readDNAFromUI()),
    plannedStart: now,
  };
}

function queueFutureMutation(now, options = {}) {
  if (shouldUseLocalDemoAssets()) {
    const seed = getQueueSeed(now);
    const asset = getNextDemoAsset();
    if (!asset) return;

    const normalizedRenderStyle = getDemoAssetStyle(asset);
    const revealRotation = asset.rotation ? { x: asset.rotation.x, y: asset.rotation.y } : getCurrentWorldRotation();
    const queuedState = {
      phase: "queued",
      phaseStart: 0,
      plannedStart: seed.plannedStart,
      from: seed.from,
      to: cloneDNAState(asset.dna),
      renderStyle: normalizedRenderStyle,
      revealRotation,
      imageUrl: null,
      imageSettled: false,
      shouldPrepareImage: true,
      renderCacheKey: null,
      renderCacheKeyValue: `demo:${getDemoAssetHashInput(asset)}`,
      camera: cloneCameraStateValue(asset.camera ?? getCameraState()),
      captureQueued: false,
      captureSaved: false,
      demoAssetHashInput: getDemoAssetHashInput(asset),
    };

    futureMutationQueue.push(queuedState);
    prepareBufferedMutationAssets(queuedState);
    return;
  }

  const { prepareImage = mutateOn, style = mutateOn ? getRandomRenderStyle() : renderStyle } = options;
  const seed = getQueueSeed(now);
  const target = randomMutationTarget(APP.dna.ranges);
  const normalizedRenderStyle = normalizeRenderStyle(style);
  const revealRotation = getCurrentWorldRotation();
  const queuedState = {
    phase: "queued",
    phaseStart: 0,
    plannedStart: seed.plannedStart,
    from: seed.from,
    to: target,
    renderStyle: normalizedRenderStyle,
    revealRotation,
    imageUrl: null,
    imageSettled: !prepareImage,
    shouldPrepareImage: prepareImage,
    renderCacheKey: null,
    renderCacheKeyValue: getRenderCacheKey(target, revealRotation, normalizedRenderStyle),
    camera: getCameraState(),
    captureQueued: false,
    captureSaved: false,
  };

  futureMutationQueue.push(queuedState);
  if (prepareImage) prepareBufferedMutationAssets(queuedState);
}

function ensureFutureMutationBuffer(now = performance.now()) {
  while (mutateOn && futureMutationQueue.length < APP.mutation.futureBufferSize) queueFutureMutation(now);
}

function startMutationCycle(now) {
  beginQueuedMutation(now, { shouldLoop: true });
}

function updateMutation(now) {
  if (!mutateOn && !mutationState) return;

  if (!mutationState) {
    startMutationCycle(now);
    return;
  }

  const elapsed = now - mutationState.phaseStart;

  if (mutationState.phase === "interp") {
    const t = Math.min(elapsed / getMutationDurationMs(), 1);
    const e = smoothstep01(t);

    setDNAValues(interpolateMutationState(mutationState.from, mutationState.to, e));

    if (t >= 1) {
      setDNAValues(mutationState.to);
      mutationState.phase = "hold";
      mutationState.phaseStart = now;
      setStatusMessage(mutationState.imageSettled ? "holding mutated form" : "holding mutated form while preparing image");
    }
  } else if (mutationState.phase === "hold") {
    if (elapsed >= getMutationHoldDurationMs()) {
      continueAfterHeldMutation(now);
    }
  } else if (mutationState.phase === "awaitingImage") {
  } else if (mutationState.phase === "overlayFadeIn") {
    if (elapsed >= getOverlayFadeInDurationMs()) {
      mutationState.phase = "overlayHold";
      mutationState.phaseStart = now;
      setStatusMessage("showing generated image");
    }
  } else if (mutationState.phase === "overlayHold") {
    if (elapsed >= getOverlayHoldDurationMs()) {
      clearSnapshotOverlayAndContinue(mutationState);
    }
  }
}

async function prepareBufferedMutationAssets(state) {
  if (!state.shouldPrepareImage) {
    state.imageSettled = true;
    return;
  }

  const key = state.renderCacheKeyValue;
  state.renderCacheKey = key;
  const task = state.demoAssetHashInput ? createDemoAssetTask(state) : createRenderTask(state.to, state.revealRotation, state.renderStyle);

  renderQueue
    .enqueue(key, task)
    .then((imageUrl) => {
      if (mutationState !== state && !futureMutationQueue.includes(state)) {
        if (imageUrl?.startsWith("blob:")) URL.revokeObjectURL(imageUrl);
        return;
      }
      state.renderCacheKey = null;
      state.imageUrl = imageUrl;
      state.imageSettled = true;
      enqueueCapturedSnapshotSave(state, imageUrl);
      if (state.phase === "awaitingImage") {
        continueAfterHeldMutation(performance.now());
      }
    })
    .catch((error) => {
      state.renderCacheKey = null;
      if (mutationState !== state && !futureMutationQueue.includes(state)) return;
      state.imageSettled = true;
      console.error("Image request failed:", error);
      setStatusMessage(error instanceof Error ? error.message : "image request failed");
      if (state.phase === "awaitingImage") {
        const shouldLoop = state.shouldLoop;
        mutationState = null;
        if (shouldLoop) startMutationCycle(performance.now());
      }
    });
}

async function requestGeneratedImage(referenceImage, style, signal) {
  const response = await fetch(new URL("/api/generate", APP.api.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getStoredApiKey(),
    },
    signal,
    body: JSON.stringify({
      prompt: buildRenderPrompt(style),
      referenceImage,
    }),
  });

  if (!response.ok) {
    let message = `Image API failed with status ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.error) message = payload.error;
    } catch {
      // Keep the default message when the response isn't JSON.
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  return blobToDataUrl(blob);
}

const snapshotRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
snapshotRenderer.setSize(APP.api.snapshotSize, APP.api.snapshotSize);
snapshotRenderer.setPixelRatio(1);
snapshotRenderer.outputColorSpace = THREE.SRGBColorSpace;
snapshotRenderer.setClearColor(APP.renderer.clearColor, 1);

function getReferenceRenderModeForAi(style = renderStyle) {
  return "solid";
}

async function captureReferenceImageForDNA(dna, rotation, mode = "solid") {
  const snapshotScene = new THREE.Scene();
  const snapshotCamera = new THREE.PerspectiveCamera(APP.camera.fov, 1, APP.camera.near, APP.camera.far);
  snapshotCamera.position.copy(camera.position);
  snapshotCamera.quaternion.copy(camera.quaternion);
  snapshotCamera.updateMatrixWorld();

  snapshotScene.add(new THREE.AmbientLight(0xffffff, 0.8));

  const snapshotKeyLight = new THREE.DirectionalLight(0xffffff, 1.5);
  snapshotKeyLight.position.set(4, 5, 7);
  snapshotScene.add(snapshotKeyLight);

  const snapshotFillLight = new THREE.DirectionalLight(0xffffff, 0.7);
  snapshotFillLight.position.set(-5, -2, 4);
  snapshotScene.add(snapshotFillLight);

  const snapshotWorld = new THREE.Group();
  snapshotScene.add(snapshotWorld);
  if (rotation) applyGroupRotation(snapshotWorld, rotation);

  for (let i = 0; i < dna.layers; i++) buildLayer(dna, i, snapshotWorld, mode);

  snapshotRenderer.render(snapshotScene, snapshotCamera);
  const dataUrl = snapshotRenderer.domElement.toDataURL("image/png");

  snapshotWorld.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) disposeMaterial(child.material);
  });

  return dataUrl;
}

async function requestOverlayForState(dna, rotation) {
  const key = getRenderCacheKey(dna, rotation);
  return renderQueue.enqueue(key, createRenderTask(dna, rotation));
}

function showSnapshotOverlay(imageUrl, state = null, status = "fading in generated image") {
  dom.snapshotOverlay.classList.remove("no-transition");
  dom.snapshotImage.src = imageUrl;
  dom.snapshotOverlay.classList.add("visible");
  playRevealSfx({
    durationMs: getOverlayFadeInDurationMs() + getOverlayHoldDurationMs(),
    intensity: getRevealSfxIntensity(state?.to ?? readDNAFromUI()),
  });
  if (state) {
    state.phase = "overlayFadeIn";
    state.phaseStart = performance.now();
  }
  setStatusMessage(status);
}

function clearSnapshotOverlayAndContinue(state) {
  const overlay = dom.snapshotOverlay;
  const shouldLoop = state.shouldLoop;
  const keepOverlay = !shouldLoop && livePreviewEnabled && state.imageUrl;

  if (keepOverlay) {
    mutationState = null;
    setStatusMessage("showing live preview");
    return;
  }

  hideSnapshotOverlay({ immediate: true });
  state.phase = "overlayClearing";
  state.phaseStart = performance.now();

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.classList.remove("no-transition");
      if (mutationState !== state || state.phase !== "overlayClearing") return;
      mutationState = null;
      if (shouldLoop) startMutationCycle(performance.now());
      else if (livePreviewEnabled) refreshLivePreview({ status: "capturing live preview" });
      else setStatusMessage("loaded next parameter set");
    });
  });
}

function hideSnapshotOverlay(options = {}) {
  const { immediate = false, status = "animating to next target" } = options;
  const overlay = dom.snapshotOverlay;
  const image = dom.snapshotImage;
  if (immediate) overlay.classList.add("no-transition");
  if (image.src.startsWith("blob:")) URL.revokeObjectURL(image.src);
  image.removeAttribute("src");
  overlay.classList.remove("visible");
  setStatusMessage(status);
}

function activateHoldOverlay() {
  const overlayToken = ++holdOverlayToken;
  const heldRotation = getCurrentWorldRotation();
  const heldDna = cloneDNAState(readDNAFromUI());

  keyboardHoldActive = true;
  hideSnapshotOverlay({ immediate: true, status: "capturing held render" });

  requestOverlayForState(heldDna, heldRotation)
    .then((imageUrl) => {
      if (!keyboardHoldActive || overlayToken !== holdOverlayToken) {
        if (typeof imageUrl === "string" && imageUrl.startsWith("blob:")) URL.revokeObjectURL(imageUrl);
        return;
      }
      showSnapshotOverlay(imageUrl, null, "showing held render overlay");
    })
    .catch((error) => {
      if (!keyboardHoldActive || overlayToken !== holdOverlayToken) return;
      setStatusMessage(error instanceof Error ? error.message : "render overlay failed");
    });
}

function releaseHoldOverlay() {
  if (!keyboardHoldActive) return;
  keyboardHoldActive = false;
  holdOverlayToken += 1;
  stopAllSfx();
  hideSnapshotOverlay({ immediate: true, status: mutateOn ? "animating to next target" : "" });
}

function relayOverlayPointerEventToCanvas(event) {
  if (!dom.snapshotOverlay.classList.contains("visible")) return;

  const forwardedEvent = new PointerEvent(event.type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: event.pointerId,
    width: event.width,
    height: event.height,
    pressure: event.pressure,
    tangentialPressure: event.tangentialPressure,
    tiltX: event.tiltX,
    tiltY: event.tiltY,
    twist: event.twist,
    pointerType: event.pointerType,
    isPrimary: event.isPrimary,
    clientX: event.clientX,
    clientY: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
    button: event.button,
    buttons: event.buttons,
  });

  dom.canvas.dispatchEvent(forwardedEvent);
}

function relayOverlayWheelEventToCanvas(event) {
  if (!dom.snapshotOverlay.classList.contains("visible")) return;

  const forwardedEvent = new WheelEvent(event.type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    deltaZ: event.deltaZ,
    deltaMode: event.deltaMode,
    clientX: event.clientX,
    clientY: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
  });

  dom.canvas.dispatchEvent(forwardedEvent);
}

function handleOverlayPointerDown(event) {
  if (event.button !== 0) return;
  forwardedOverlayPointerId = event.pointerId;
  event.preventDefault();
  event.stopPropagation();
  relayOverlayPointerEventToCanvas(event);
}

function handleOverlayPointerMove(event) {
  if (event.pointerId !== forwardedOverlayPointerId) return;
  event.preventDefault();
  event.stopPropagation();
  relayOverlayPointerEventToCanvas(event);
}

function handleOverlayPointerEnd(event) {
  if (event.pointerId !== forwardedOverlayPointerId) return;
  event.preventDefault();
  event.stopPropagation();
  relayOverlayPointerEventToCanvas(event);
  forwardedOverlayPointerId = null;
}

function handleOverlayWheel(event) {
  event.preventDefault();
  event.stopPropagation();
  relayOverlayWheelEventToCanvas(event);
}

PARAMETER_IDS.forEach((id) => {
  document.getElementById(id).addEventListener("input", () => {
    if (mutateOn) {
      releaseHoldOverlay();
      stopMutationMode();
    }
    syncUI();
    buildMorphology();
    queueLivePreviewRefresh();
  });
});

dom.apiKey.addEventListener("input", (event) => {
  setStoredApiKey(event.target.value);
  if (mutateOn) {
    releaseHoldOverlay();
    stopMutationMode();
    syncUI();
  }
  queueLivePreviewRefresh();
});

document.querySelectorAll(APP_MODE_SELECTOR).forEach((button) => {
  button.addEventListener("click", () => {
    void setAppMode(button.dataset.mode);
  });
});

document.querySelectorAll(RENDER_MODE_SELECTOR).forEach((el) => {
  el.addEventListener("change", () => {
    if (el.checked) {
      if (mutateOn) {
        releaseHoldOverlay();
        stopMutationMode();
      }
      releaseHoldOverlay();
      setRenderMode(el.value);
      queueLivePreviewRefresh();
    }
  });
});

document.querySelectorAll(RENDER_STYLE_SELECTOR).forEach((el) => {
  el.addEventListener("change", () => {
    if (!el.checked) return;
    if (mutateOn) {
      releaseHoldOverlay();
      stopMutationMode();
    }
    setStoredRenderStyle(el.value);
    syncUI();
    queueLivePreviewRefresh();
  });
});

dom.hideButton.addEventListener("click", () => {
  menuHidden = !menuHidden;
  syncUI();
});

dom.randomizeButton.addEventListener("click", () => {
  triggerSingleMutationTransition();
});

dom.beginButton.addEventListener("click", () => {
  void startApp();
});

dom.snapshotImage.draggable = false;
dom.snapshotImage.addEventListener("dragstart", (event) => {
  event.preventDefault();
});
dom.snapshotImage.addEventListener("pointerdown", handleOverlayPointerDown);
dom.snapshotImage.addEventListener("pointermove", handleOverlayPointerMove);
dom.snapshotImage.addEventListener("pointerup", handleOverlayPointerEnd);
dom.snapshotImage.addEventListener("pointercancel", handleOverlayPointerEnd);
dom.snapshotImage.addEventListener("wheel", handleOverlayWheel, { passive: false });

controls.addEventListener("start", () => {
  cameraInteracting = true;
  if (livePreviewEnabled) suspendLivePreview("");
});

controls.addEventListener("end", () => {
  cameraInteracting = false;
  if (!controls.enabled) return;
  if (!shouldRestartMutationAfterControlEnd()) return;
  if (!mutateOn) return;
  releaseHoldOverlay();
  stopMutationMode();
  syncUI();
});

controls.addEventListener("end", () => {
  if (!controls.enabled) return;
  queueLivePreviewRefresh();
});

addEventListener("keydown", (event) => {
  if (!appStarted) return;
  if (isFormFieldTarget(event.target)) return;

  if (event.key === "Tab") {
    event.preventDefault();
    if (mutateOn) stopMutationMode();
    releaseHoldOverlay();
    setRenderMode(getNextRenderMode(renderMode));
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    triggerSingleMutationTransition();
    return;
  }

  if (event.code !== "Space") return;
  if (event.repeat) {
    event.preventDefault();
    return;
  }

  event.preventDefault();
  keyboardSpacePressed = true;
  if (mutateOn) {
    releaseHoldOverlay();
    stopMutationMode();
    appMode = "manual";
    syncUI();
  }
  clearKeyboardHoldTimer();
  keyboardHoldTimer = window.setTimeout(() => {
    if (!keyboardSpacePressed) return;
    activateHoldOverlay();
  }, SPACE_HOLD_DELAY_MS);
});

addEventListener("keyup", (event) => {
  if (!appStarted) return;
  if (isFormFieldTarget(event.target)) return;
  if (event.code !== "Space") return;

  event.preventDefault();
  const wasHolding = keyboardHoldActive;
  keyboardSpacePressed = false;
  clearKeyboardHoldTimer();

  if (wasHolding) {
    releaseHoldOverlay();
  }
});

writeDNAControls(randomInitialDNA(APP.dna.ranges));
applyTimingConstants();
syncUI();
buildMorphology();

function animate(t) {
  requestAnimationFrame(animate);
  updateMutation(t);
  controls.update();
  renderer.render(scene, camera);
}
animate(0);

function pickMineralColorStyle() {
  const mineralColorStyles = [
    { color: "dark red", reference: "ruby" },
    { color: "dark orange", reference: "spessartine garnet" },
    { color: "deep yellow", reference: "citrine" },
    { color: "deep green", reference: "emerald" },
    { color: "deep blue", reference: "sapphire" },
    { color: "deep indigo", reference: "iolite" },
    { color: "deep violet", reference: "amethyst" },
  ];

  return mineralColorStyles[Math.floor(Math.random() * mineralColorStyles.length)];
}

function buildRenderPrompt(style = renderStyle) {
  const mineralColorStyle = pickMineralColorStyle();
  const organPrompt = [
    "Colorize the provided image using Visceral bio-organic body horror, organ-like fleshy textures, sinewy muscle fibers, exposed tissue, veiny membranes, wet glossy surface, translucent skin, grotesque organic folds, tumorous growths, raw anatomical forms",
    "Keep the shape unchanged and use a pure black background",
  ].join(", ");

  const mineralPrompt = [
    `Colorize the provided image as an exotic alien ${mineralColorStyle.reference} mineral specimen with a single pure saturated ${mineralColorStyle.color} body color, densely clustered crystalline facets, fractured planes, sharp mineral edges, intricate lapidary geometry, fine surface striations, subtle crystalline inclusions, rich mineral micro-texture, translucent depth, luminous internal glow, high contrast against pure black, and no surface reflections, no glossy glare, no mirror-like highlights.`,
    "Keep the shape unchanged and use a pure black background",
  ].join(", ");

  const floraPrompt = [
    "Colorize the provided image as surreal alien flower specimen, lush petals, layered leaves, fine veins, subtle translucency, organic coloration, crisp depth-rich plant textures, no stems, photorealistic lighting, macro lens",
    "Keep the shape unchanged and use a pure black background",
  ].join(", ");

  const waterSplashPrompt = [
    "Restyle the provided image as a suspended viscous milk splash, high-speed photography, dense creamy liquid, thick flowing ribbons, sculptural splash crowns, glossy white fluid, smooth rounded contours, rich viscosity, crisp fluid detail, high contrast cinematic lighting, no droplets, no colorization",
    "Keep the shape unchanged and use a pure black background",
  ].join(", ");

  const ribbonPrompt = [
    "Colorize the provided image as a biomorphic sculpture with fluid organic form, folded ribbon aesthetic, continuous flowing surfaces, smooth anatomical curvature, layered folds, tensile membrane-like contours, sculpted creases, subtle material depth, elegant museum-scale object design, map the existing shape directly to the folded ribbon structure and organic surface articulation, extreme macro realism",
    "Keep the shape unchanged and use a pure black background",
  ].join(", ");

  if (style === "organ") return organPrompt;
  if (style === "flora") return floraPrompt;
  if (style === "liquid") return waterSplashPrompt;
  if (style === "ribbon") return ribbonPrompt;
  return mineralPrompt;
}

function normalizeRenderStyle(value) {
  return RENDER_STYLE_SEQUENCE.includes(value) ? value : "mineral";
}

function getRandomRenderStyle() {
  return RENDER_STYLE_SEQUENCE[Math.floor(Math.random() * RENDER_STYLE_SEQUENCE.length)];
}

function getSfxIntensity(dna) {
  return Math.min(1.8, Math.max(0.75, 0.85 + dna.fold * 0.22 + dna.spike * 0.9 + dna.chaos * 0.35));
}

function getRevealSfxIntensity(dna) {
  return Math.min(2.1, getSfxIntensity(dna) + 0.35 + dna.fold * 0.12 + dna.chaos * 0.18);
}

function getModeHint(mode = appMode) {
  if (mode === "manual") return "Hold space to render";
  if (mode === "preview") return "Auto render when you stop";
  return "";
}

function getNextRenderMode(mode = renderMode) {
  const currentIndex = RENDER_MODE_SEQUENCE.indexOf(mode);
  if (currentIndex === -1) return RENDER_MODE_SEQUENCE[0];
  return RENDER_MODE_SEQUENCE[(currentIndex + 1) % RENDER_MODE_SEQUENCE.length];
}

function cloneDNAState(dna) {
  return {
    order: dna.order,
    warp: dna.warp,
    fold: dna.fold,
    spike: dna.spike,
    chaos: dna.chaos,
    layers: dna.layers,
  };
}

function randomInitialDNA(ranges) {
  return {
    order: ranges.order.min + Math.random() * (ranges.order.max - ranges.order.min),
    warp: ranges.warp.min + Math.random() * (ranges.warp.max - ranges.warp.min),
    fold: ranges.fold.min + Math.random() * (ranges.fold.max - ranges.fold.min),
    spike: ranges.spike.min + Math.random() * (ranges.spike.max - ranges.spike.min),
    chaos: ranges.chaos.min + Math.random() * (ranges.chaos.max - ranges.chaos.min),
    layers: APP.dna.defaults.layers,
  };
}

function randomMutationTarget(ranges) {
  return {
    order: ranges.order.min + Math.random() * (ranges.order.max - ranges.order.min),
    warp: ranges.warp.min + Math.random() * (ranges.warp.max - ranges.warp.min),
    fold: ranges.fold.min + Math.random() * (ranges.fold.max - ranges.fold.min),
    spike: ranges.spike.min + Math.random() * (ranges.spike.max - ranges.spike.min),
    chaos: ranges.chaos.min + Math.random() * (ranges.chaos.max - ranges.chaos.min),
    layers: APP.dna.defaults.layers,
  };
}

function smoothstep01(t) {
  return t * t * (3 - 2 * t);
}

function interpolateMutationState(from, to, t) {
  return {
    order: from.order + (to.order - from.order) * t,
    warp: from.warp + (to.warp - from.warp) * t,
    fold: from.fold + (to.fold - from.fold) * t,
    spike: from.spike + (to.spike - from.spike) * t,
    chaos: from.chaos + (to.chaos - from.chaos) * t,
    layers: to.layers,
  };
}

function scalarField(theta, phi, layer, d) {
  const m1 = Math.sin(theta * d.order + phi * (1.0 + d.warp) + layer * 0.9);
  const m2 = Math.cos(theta * (d.order * 0.5 + 1.7) - phi * (2.7 + d.warp * 1.3));
  const m3 = Math.sin((theta + phi * 0.7) * (3.0 + d.fold * 4.5) + layer * 1.8);
  const m4 = Math.cos((theta - phi) * (2.0 + layer));

  const spikeWaveA = Math.abs(Math.sin(theta * (d.order * 1.5 + 2.0) + phi * 4.0 + layer * 0.6));
  const spikeWaveB = Math.abs(Math.cos(phi * (d.order * 0.9 + 3.0) - theta * 2.5));
  const spikeField = Math.pow(Math.max(0, 0.55 * spikeWaveA + 0.45 * spikeWaveB), 1.0 + d.spike * 5.0);

  const asym = d.chaos * (Math.sin(theta * 1.31 + layer * 0.8) * 0.5 + Math.cos(phi * 2.17 - layer * 0.6) * 0.5);

  return 1.0 + m1 * (0.18 + d.fold * 0.28) + m2 * (0.14 + d.warp * 0.12) + m3 * 0.12 + m4 * 0.08 + spikeField * d.spike * 0.55 + asym * 0.38;
}

function buildLayerGeometryData(d, layerIndex, meshConfig) {
  const positions = [];
  const indices = [];
  const baseScale = meshConfig.layerBaseScale + layerIndex * meshConfig.layerScaleStep;
  const phase = layerIndex * meshConfig.layerPhaseStep;

  for (let y = 0; y <= meshConfig.vSeg; y++) {
    const v = y / meshConfig.vSeg;
    const phi = v * Math.PI;

    for (let x = 0; x < meshConfig.uSeg; x++) {
      const u = x / meshConfig.uSeg;
      const theta = u * Math.PI * 2;

      let r = scalarField(theta + phase, phi, layerIndex, d) * baseScale;

      const seam = Math.sin(phi * d.order * 0.5 + theta * 0.5 + layerIndex);
      const cavity = Math.cos(phi * 3.0 - theta * d.order);
      const collapse = Math.max(0, cavity) * d.fold * 0.22;

      const spikeNeedle = Math.pow(Math.abs(Math.sin(theta * (d.order + 3.0) - phi * 6.0 + layerIndex)), 10.0 - Math.min(d.spike * 3.0, 5.5));
      const spikeGain = 1.0 + spikeNeedle * d.spike * 0.35;

      r *= (1.0 + seam * 0.08 - collapse) * spikeGain;

      const twist = d.warp * 0.75 * Math.sin(phi * 2.0 + layerIndex * 0.7);
      const sx = Math.sin(phi) * Math.cos(theta + twist);
      const sy = Math.cos(phi);
      const sz = Math.sin(phi) * Math.sin(theta - twist * 0.8);

      const anisotropy = 1 + Math.sin(phi * (layerIndex + 2)) * d.fold * 0.32;

      positions.push(sx * r * anisotropy * meshConfig.xzScale, sy * r * (1.0 + d.fold * meshConfig.yFoldScale), sz * r * anisotropy * meshConfig.xzScale);
    }
  }

  for (let y = 0; y < meshConfig.vSeg; y++) {
    for (let x = 0; x < meshConfig.uSeg; x++) {
      const rowStart = y * meshConfig.uSeg;
      const nextRowStart = rowStart + meshConfig.uSeg;
      const nextX = (x + 1) % meshConfig.uSeg;
      const a = rowStart + x;
      const b = nextRowStart + x;
      const c = rowStart + nextX;
      const dIndex = nextRowStart + nextX;
      indices.push(a, b, c);
      indices.push(b, dIndex, c);
    }
  }

  return { positions, indices };
}
