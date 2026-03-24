import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { playMorphSfx, playRevealSfx, primeSfx, stopAllSfx } from "./sfx.js";

const imageApiBaseUrl = (import.meta.env.VITE_IMAGE_API_BASE_URL ?? window.location.origin).trim();
const PARAMETER_IDS = ["order", "warp", "fold", "spike", "chaos"];

const APP = {
  camera: { fov: 50, near: 0.1, far: 100, position: [0, 0, 20] },
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
    renderStyleStorageKey: "life-config.render-style",
    snapshotSize: 768,
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
  animation: {
    worldRotY: 0.00012,
    worldRotXFreq: 0.00018,
    worldRotXAmp: 0.06,
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

const camera = new THREE.PerspectiveCamera(APP.camera.fov, innerWidth / innerHeight, APP.camera.near, APP.camera.far);
camera.position.set(...APP.camera.position);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, APP.renderer.pixelRatioMax));
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
controls.enableDamping = true;
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
const SPACE_HOLD_DELAY_MS = 180;

const world = new THREE.Group();
scene.add(world);

const $ = (id) => document.getElementById(id);

let mutateOn = false;
let mutationState = null;
const futureMutationQueue = [];
let renderMode = "point";
let renderStyle = getStoredRenderStyle();
let menuHidden = false;
let statusMessage = "";
let rotationPauseStartedAt = null;
let rotationTimelineOffsetMs = 0;
let keyboardHoldTimer = 0;
let keyboardSpacePressed = false;
let keyboardHoldActive = false;
let holdOverlayToken = 0;
let lastPointerButton = null;
let autoRotationEnabled = true;

function roundForCacheKey(value, precision = 4) {
  return Number(value.toFixed(precision));
}

function buildHeldRenderCacheKey(dna, rotation, style = renderStyle) {
  return JSON.stringify({
    style,
    dna: {
      order: roundForCacheKey(dna.order),
      warp: roundForCacheKey(dna.warp),
      fold: roundForCacheKey(dna.fold),
      spike: roundForCacheKey(dna.spike),
      chaos: roundForCacheKey(dna.chaos),
      layers: dna.layers,
    },
    rotation: {
      x: roundForCacheKey(rotation.x),
      y: roundForCacheKey(rotation.y),
    },
  });
}

function getHeldRenderCache(key) {
  try {
    const cached = window.sessionStorage.getItem(key);
    return cached && cached.trim() ? cached : null;
  } catch {
    return null;
  }
}

function setHeldRenderCache(key, imageUrl) {
  if (!imageUrl) return;

  try {
    window.sessionStorage.setItem(key, imageUrl);
  } catch (error) {
    console.warn("Unable to cache held render result:", error);
  }
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

function getSfxIntensity(dna) {
  return Math.min(1.8, Math.max(0.75, 0.85 + dna.fold * 0.22 + dna.spike * 0.9 + dna.chaos * 0.35));
}

function getRevealSfxIntensity(dna) {
  return Math.min(2.1, getSfxIntensity(dna) + 0.35 + dna.fold * 0.12 + dna.chaos * 0.18);
}

function applyTimingConstants() {
  const root = document.documentElement;
  root.style.setProperty("--snapshot-overlay-fade-in-ms", `${APP.timing.overlayFadeInMs}ms`);
}

function applyGroupRotation(group, rotation) {
  group.rotation.x = rotation.x;
  group.rotation.y = rotation.y;
}

function applyWorldRotation(rotation) {
  applyGroupRotation(world, rotation);
}

function disableAutoRotation() {
  autoRotationEnabled = false;
}

function enableAutoRotation() {
  autoRotationEnabled = true;
}

function getStoredApiKey() {
  return window.localStorage.getItem(APP.api.apiKeyStorageKey) ?? "";
}

function setStoredApiKey(value) {
  window.localStorage.setItem(APP.api.apiKeyStorageKey, value.trim());
}

function getStoredRenderStyle() {
  const value = window.localStorage.getItem(APP.api.renderStyleStorageKey);
  return value === "organ" || value === "flora" ? value : "illustration";
}

function setStoredRenderStyle(value) {
  renderStyle = value === "organ" || value === "flora" ? value : "illustration";
  window.localStorage.setItem(APP.api.renderStyleStorageKey, renderStyle);
}

function setStatusMessage(message) {
  statusMessage = message;
  $("status").textContent = message;
}

function syncUI() {
  $("orderVal").textContent = (+$("order").value).toFixed(2);
  $("warpVal").textContent = (+$("warp").value).toFixed(2);
  $("foldVal").textContent = (+$("fold").value).toFixed(2);
  $("spikeVal").textContent = (+$("spike").value).toFixed(2);
  $("chaosVal").textContent = (+$("chaos").value).toFixed(2);
  $("mutate").textContent = mutateOn ? "Mutate: On" : "Mutate: Off";
  document.querySelectorAll('input[name="renderMode"]').forEach((el) => {
    el.checked = el.value === renderMode;
  });
  document.querySelectorAll('input[name="renderStyle"]').forEach((el) => {
    el.checked = el.value === renderStyle;
  });
  $("hideBtn").textContent = menuHidden ? "Show" : "Hide";
  $("apiKey").value = getStoredApiKey();
  $("uiShell").classList.toggle("collapsed", menuHidden);
  $("status").textContent = statusMessage;
}

function readDNAFromUI() {
  return {
    order: +$("order").value,
    warp: +$("warp").value,
    fold: +$("fold").value,
    spike: +$("spike").value,
    chaos: +$("chaos").value,
    layers: APP.dna.defaults.layers,
  };
}

function writeDNAControls(d) {
  $("order").value = d.order.toFixed(2);
  $("warp").value = d.warp.toFixed(2);
  $("fold").value = d.fold.toFixed(2);
  $("spike").value = d.spike.toFixed(2);
  $("chaos").value = d.chaos.toFixed(2);
}

function setDNAValues(d) {
  writeDNAControls(d);
  syncUI();
  buildMorphology();
}

function stopMutationMode() {
  clearFutureMutationQueue();
  if (mutationState?.imageUrl) revokeMutationImageUrl(mutationState);
  mutationState = null;
  mutateOn = false;
  stopAllSfx();
  hideSnapshotOverlay({ immediate: true, status: "" });
}

function getCurrentRotationTimelineTime(now = performance.now()) {
  if (rotationPauseStartedAt !== null) return rotationPauseStartedAt - rotationTimelineOffsetMs;
  return now - rotationTimelineOffsetMs;
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

function getNextRenderMode(mode = renderMode) {
  const currentIndex = RENDER_MODE_SEQUENCE.indexOf(mode);
  if (currentIndex === -1) return RENDER_MODE_SEQUENCE[0];
  return RENDER_MODE_SEQUENCE[(currentIndex + 1) % RENDER_MODE_SEQUENCE.length];
}

function isFormFieldTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("input, textarea, select, button, [contenteditable='true']"));
}

function adjustMutationTimingForPause(now) {
  if (rotationPauseStartedAt === null) return;
  const pausedDuration = now - rotationPauseStartedAt;
  if (mutationState) mutationState.phaseStart += pausedDuration;
}

function beginRotationPause(now = performance.now()) {
  if (rotationPauseStartedAt !== null) return;
  rotationPauseStartedAt = now;
}

function endRotationPause(now = performance.now()) {
  if (rotationPauseStartedAt === null) return;
  adjustMutationTimingForPause(now);
  rotationTimelineOffsetMs += now - rotationPauseStartedAt;
  rotationPauseStartedAt = null;
}

function getCurrentWorldRotation() {
  return { x: world.rotation.x, y: world.rotation.y };
}

function getRotationForTimestamp(timeMs) {
  return getWorldRotationAtTime(getCurrentRotationTimelineTime(timeMs));
}

function revokeMutationImageUrl(state) {
  if (state?.imageUrl?.startsWith("blob:")) URL.revokeObjectURL(state.imageUrl);
}

function clearFutureMutationQueue() {
  while (futureMutationQueue.length) revokeMutationImageUrl(futureMutationQueue.pop());
}

function clearKeyboardHoldTimer() {
  if (!keyboardHoldTimer) return;
  window.clearTimeout(keyboardHoldTimer);
  keyboardHoldTimer = 0;
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

function beginQueuedMutation(now = performance.now(), options = {}) {
  const { shouldLoop = mutateOn } = options;

  if (mutationState?.imageUrl) revokeMutationImageUrl(mutationState);
  mutationState = null;

  if (!futureMutationQueue.length) queueFutureMutation(now, { prepareImage: shouldLoop });
  else if (mutateOn) ensureFutureMutationBuffer(now);

  const nextState = futureMutationQueue.shift();
  if (!nextState) return false;

  mutationState = nextState;
  mutationState.phase = "interp";
  mutationState.phaseStart = now;
  mutationState.shouldLoop = shouldLoop;

  if (mutateOn) ensureFutureMutationBuffer(now);
  playMorphSfx({
    durationMs: getMutationDurationMs(),
    intensity: getSfxIntensity(mutationState.to),
  });
  setStatusMessage(getStoredApiKey() ? "animating to buffered target" : "missing api key; animating only");
  return true;
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
    else setStatusMessage("loaded next parameter set");
    return;
  }

  mutationState.phase = "awaitingImage";
  mutationState.phaseStart = now;
  setStatusMessage("waiting for generated image");
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
  const { prepareImage = mutateOn } = options;
  const seed = getQueueSeed(now);
  const target = randomMutationTarget(APP.dna.ranges);
  const fromRotation = getRotationForTimestamp(seed.plannedStart);
  const toRotation = getRotationForTimestamp(seed.plannedStart + getMutationDurationMs());
  const holdRotation = getRotationForTimestamp(seed.plannedStart + getMutationRevealDelayMs());
  const queuedState = {
    phase: "queued",
    phaseStart: 0,
    plannedStart: seed.plannedStart,
    from: seed.from,
    to: target,
    fromRotation,
    toRotation,
    holdRotation,
    revealRotation: holdRotation,
    imageUrl: null,
    imageSettled: !prepareImage,
    shouldPrepareImage: prepareImage,
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
  if (rotationPauseStartedAt !== null) return;
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
    applyWorldRotation(interpolateWorldRotation(mutationState.fromRotation, mutationState.toRotation, e));

    if (t >= 1) {
      setDNAValues(mutationState.to);
      applyWorldRotation(mutationState.toRotation);
      mutationState.phase = "hold";
      mutationState.phaseStart = now;
      setStatusMessage(mutationState.imageSettled ? "rotating on mutated form" : "rotating on mutated form while preparing image");
    }
  } else if (mutationState.phase === "hold") {
    const t = Math.min(elapsed / getMutationHoldDurationMs(), 1);
    applyWorldRotation(interpolateWorldRotation(mutationState.toRotation, mutationState.holdRotation, t));

    if (t >= 1) {
      applyWorldRotation(mutationState.holdRotation);
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
  try {
    if (!state.shouldPrepareImage) {
      state.imageSettled = true;
      return;
    }

    const apiKey = getStoredApiKey();
    const referenceImage = await captureReferenceImageForDNA(state.to, state.revealRotation);

    if (!mutateOn) return;

    const imagePromise = apiKey ? requestGeneratedImage(referenceImage, state.to) : Promise.resolve(null);

    imagePromise
      .then((imageUrl) => {
        if (!mutateOn) {
          if (imageUrl?.startsWith("blob:")) URL.revokeObjectURL(imageUrl);
          return;
        }
        state.imageUrl = imageUrl;
        state.imageSettled = true;
        if (state.phase === "awaitingImage") {
          continueAfterHeldMutation(performance.now());
        }
      })
      .catch((error) => {
        if (!mutateOn) return;
        state.imageSettled = true;
        console.error("Image request failed:", error);
        setStatusMessage(error instanceof Error ? error.message : "image request failed");
        if (state.phase === "awaitingImage") {
          const shouldLoop = state.shouldLoop;
          mutationState = null;
          if (shouldLoop) startMutationCycle(performance.now());
        }
      });
  } catch (error) {
    if (!mutateOn) return;
    console.error("Snapshot capture failed:", error);
    state.imageSettled = true;
    setStatusMessage(error instanceof Error ? error.message : "snapshot capture failed");
  }
}

async function requestGeneratedImage(referenceImage, dna) {
  const response = await fetch(new URL("/api/generate", APP.api.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getStoredApiKey(),
    },
    body: JSON.stringify({
      prompt: buildRenderPrompt(),
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

async function captureReferenceImageForDNA(dna, rotation) {
  const snapshotRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  snapshotRenderer.setSize(APP.api.snapshotSize, APP.api.snapshotSize);
  snapshotRenderer.setPixelRatio(1);
  snapshotRenderer.outputColorSpace = THREE.SRGBColorSpace;
  snapshotRenderer.setClearColor(APP.renderer.clearColor, 1);

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

  for (let i = 0; i < dna.layers; i++) buildLayer(dna, i, snapshotWorld, "solid");

  snapshotRenderer.render(snapshotScene, snapshotCamera);
  const dataUrl = snapshotRenderer.domElement.toDataURL("image/png");

  snapshotWorld.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) disposeMaterial(child.material);
  });
  snapshotRenderer.dispose();

  return dataUrl;
}

async function requestOverlayForState(dna, rotation) {
  const cacheKey = buildHeldRenderCacheKey(dna, rotation);
  const cachedImage = getHeldRenderCache(cacheKey);
  if (cachedImage) return cachedImage;

  const referenceImage = await captureReferenceImageForDNA(dna, rotation);
  const imageUrl = getStoredApiKey() ? await requestGeneratedImage(referenceImage, dna) : referenceImage;
  setHeldRenderCache(cacheKey, imageUrl);
  return imageUrl;
}

function showSnapshotOverlay(imageUrl, state = null, status = "fading in generated image") {
  $("snapshotOverlay").classList.remove("no-transition");
  $("snapshotImage").src = imageUrl;
  $("snapshotOverlay").classList.add("visible");
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
  const overlay = $("snapshotOverlay");
  hideSnapshotOverlay({ immediate: true });
  state.phase = "overlayClearing";
  state.phaseStart = performance.now();

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.classList.remove("no-transition");
      if (!mutateOn || mutationState !== state || state.phase !== "overlayClearing") return;
      const shouldLoop = state.shouldLoop;
      mutationState = null;
      if (shouldLoop) startMutationCycle(performance.now());
      else setStatusMessage("loaded next parameter set");
    });
  });
}

function hideSnapshotOverlay(options = {}) {
  const { immediate = false, status = "animating to next target" } = options;
  const overlay = $("snapshotOverlay");
  const image = $("snapshotImage");
  if (immediate) overlay.classList.add("no-transition");
  if (image.src.startsWith("blob:")) URL.revokeObjectURL(image.src);
  image.removeAttribute("src");
  overlay.classList.remove("visible");
  setStatusMessage(status);
}

function activateHoldOverlay() {
  const now = performance.now();
  const overlayToken = ++holdOverlayToken;
  const heldRotation = getCurrentWorldRotation();
  const heldDna = cloneDNAState(readDNAFromUI());

  keyboardHoldActive = true;
  beginRotationPause(now);
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
  endRotationPause(performance.now());
  stopAllSfx();
  hideSnapshotOverlay({ immediate: true, status: mutateOn ? "animating to next target" : "" });
}

PARAMETER_IDS.forEach((id) => {
  $(id).addEventListener("input", () => {
    if (mutateOn) {
      releaseHoldOverlay();
      stopMutationMode();
    }
    syncUI();
    buildMorphology();
  });
});

$("apiKey").addEventListener("input", (event) => {
  setStoredApiKey(event.target.value);
  if (mutateOn) {
    releaseHoldOverlay();
    stopMutationMode();
    syncUI();
  }
});

document.querySelectorAll('input[name="renderMode"]').forEach((el) => {
  el.addEventListener("change", () => {
    if (el.checked) {
      if (mutateOn) {
        releaseHoldOverlay();
        stopMutationMode();
      }
      releaseHoldOverlay();
      setRenderMode(el.value);
    }
  });
});

document.querySelectorAll('input[name="renderStyle"]').forEach((el) => {
  el.addEventListener("change", () => {
    if (!el.checked) return;
    if (mutateOn) {
      releaseHoldOverlay();
      stopMutationMode();
    }
    setStoredRenderStyle(el.value);
    syncUI();
  });
});

$("hideBtn").addEventListener("click", () => {
  menuHidden = !menuHidden;
  syncUI();
});

$("mutate").addEventListener("click", async () => {
  mutateOn = !mutateOn;
  releaseHoldOverlay();
  if (mutateOn) {
    enableAutoRotation();
    await primeSfx();
    playMorphSfx({
      durationMs: getMutationDurationMs(),
      intensity: getSfxIntensity(readDNAFromUI()),
    });
    ensureFutureMutationBuffer(performance.now());
  } else {
    stopMutationMode();
  }
  syncUI();
});

controls.addEventListener("start", () => {
  disableAutoRotation();
});

controls.addEventListener("end", () => {
  if (!controls.enabled) return;
  disableAutoRotation();
  if (!shouldRestartMutationAfterControlEnd()) return;
  if (!mutateOn) return;
  releaseHoldOverlay();
  stopMutationMode();
  syncUI();
});

addEventListener("keydown", (event) => {
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
    if (mutateOn) stopMutationMode();
    releaseHoldOverlay();
    beginQueuedMutation(performance.now(), { shouldLoop: false });
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
    syncUI();
  }
  clearKeyboardHoldTimer();
  keyboardHoldTimer = window.setTimeout(() => {
    if (!keyboardSpacePressed) return;
    activateHoldOverlay();
  }, SPACE_HOLD_DELAY_MS);
});

addEventListener("keyup", (event) => {
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

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

writeDNAControls(randomInitialDNA(APP.dna.ranges));
applyTimingConstants();
syncUI();
buildMorphology();

function animate(t) {
  requestAnimationFrame(animate);
  updateMutation(t);
  if (autoRotationEnabled && (!mutateOn || !mutationState)) {
    applyWorldRotation(getWorldRotationAtTime(getCurrentRotationTimelineTime(t)));
  }
  controls.update();
  renderer.render(scene, camera);
}
animate(0);

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

function getWorldRotationAtTime(timeMs) {
  return {
    x: Math.sin(timeMs * APP.animation.worldRotXFreq) * APP.animation.worldRotXAmp,
    y: timeMs * APP.animation.worldRotY,
  };
}

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

function buildRenderPrompt() {
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

  if (renderStyle === "organ") return organPrompt;
  if (renderStyle === "flora") return floraPrompt;
  return mineralPrompt;
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

function interpolateWorldRotation(from, to, t) {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
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
