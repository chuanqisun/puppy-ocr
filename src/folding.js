import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const imageApiBaseUrl = (import.meta.env.VITE_IMAGE_API_BASE_URL ?? window.location.origin).trim();

const APP = {
  camera: { fov: 50, near: 0.1, far: 100, position: [0, 0, 20] },
  renderer: { clearColor: 0x000000, pixelRatioMax: 2 },
  api: {
    baseUrl: imageApiBaseUrl,
    apiKeyStorageKey: "life-config.replicate-api-key",
    overlayDisplayMs: 500,
    snapshotSize: 768,
  },
  mutation: { interpMs: 1600, holdMs: 1000 },
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
    defaults: { order: 6.0, warp: 1.2, fold: 0.68, spike: 0.0, chaos: 0.22, layers: 3 },
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

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, APP.renderer.pixelRatioMax));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(APP.renderer.clearColor, 1);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const ambient = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
keyLight.position.set(4, 5, 7);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 0.7);
fillLight.position.set(-5, -2, 4);
scene.add(fillLight);

const world = new THREE.Group();
scene.add(world);

const $ = (id) => document.getElementById(id);

let mutateOn = false;
let mutationState = null;
let renderMode = "solid";
let menuHidden = false;
let statusMessage = "";

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

function getWorldRotationAtTime(timeMs) {
  return {
    x: Math.sin(timeMs * APP.animation.worldRotXFreq) * APP.animation.worldRotXAmp,
    y: timeMs * APP.animation.worldRotY,
  };
}

function applyGroupRotation(group, rotation) {
  group.rotation.x = rotation.x;
  group.rotation.y = rotation.y;
}

function applyWorldRotation(rotation) {
  applyGroupRotation(world, rotation);
}

function getStoredApiKey() {
  return window.localStorage.getItem(APP.api.apiKeyStorageKey) ?? "";
}

function setStoredApiKey(value) {
  window.localStorage.setItem(APP.api.apiKeyStorageKey, value.trim());
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
  if (mode === "points") {
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

function startMutationCycle(now) {
  const current = readDNAFromUI();
  const target = randomMutationTarget(APP.dna.ranges);

  mutationState = {
    phase: "preparing",
    phaseStart: now,
    from: {
      order: current.order,
      warp: current.warp,
      fold: current.fold,
      spike: current.spike,
      chaos: current.chaos,
      layers: current.layers,
    },
    to: target,
    fromRotation: null,
    toRotation: null,
    imageUrl: null,
    imageSettled: false,
    requestToken: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  };

  prepareMutationSnapshot(mutationState);
}

function updateMutation(now) {
  if (!mutateOn) return;

  if (!mutationState) {
    startMutationCycle(now);
    return;
  }

  const elapsed = now - mutationState.phaseStart;

  if (mutationState.phase === "preparing") {
    return;
  }

  if (mutationState.phase === "interp") {
    const t = Math.min(elapsed / APP.mutation.interpMs, 1);
    const e = smoothstep01(t);

    setDNAValues(interpolateMutationState(mutationState.from, mutationState.to, e));
    applyWorldRotation(interpolateWorldRotation(mutationState.fromRotation, mutationState.toRotation, e));

    if (t >= 1) {
      setDNAValues(mutationState.to);
      applyWorldRotation(mutationState.toRotation);
      if (mutationState.imageUrl) {
        showSnapshotOverlay(mutationState.imageUrl, mutationState);
      } else if (mutationState.imageSettled) {
        startMutationCycle(now);
      } else {
        mutationState.phase = "awaitingImage";
        mutationState.phaseStart = now;
        setStatusMessage("waiting for generated image");
      }
    }
  } else if (mutationState.phase === "hold") {
    if (elapsed >= APP.mutation.holdMs) startMutationCycle(now);
  } else if (mutationState.phase === "overlay") {
    if (elapsed >= APP.api.overlayDisplayMs) {
      hideSnapshotOverlay();
      startMutationCycle(now);
    }
  }
}

async function prepareMutationSnapshot(state) {
  setStatusMessage("capturing target snapshot");

  try {
    const apiKey = getStoredApiKey();
    const interpStart = performance.now();
    state.fromRotation = { x: world.rotation.x, y: world.rotation.y };
    state.toRotation = getWorldRotationAtTime(interpStart + APP.mutation.interpMs);
    const referenceImage = await captureReferenceImageForDNA(state.to, state.toRotation);

    if (mutationState !== state || !mutateOn) return;

    setStatusMessage(apiKey ? "requesting generated image" : "animating without image");

    const imagePromise = apiKey ? requestGeneratedImage(referenceImage, state.to) : Promise.resolve(null);

    imagePromise
      .then((imageUrl) => {
        if (mutationState !== state) return;
        state.imageUrl = imageUrl;
        state.imageSettled = true;
        if (state.phase === "awaitingImage") {
          if (imageUrl) showSnapshotOverlay(imageUrl, state);
          else startMutationCycle(performance.now());
        }
      })
      .catch((error) => {
        if (mutationState !== state) return;
        state.imageSettled = true;
        console.error("Image request failed:", error);
        setStatusMessage(error instanceof Error ? error.message : "image request failed");
        if (state.phase === "awaitingImage") startMutationCycle(performance.now());
      });

    state.phase = "interp";
    state.phaseStart = interpStart;
    setStatusMessage(apiKey ? "animating to next target" : "missing api key; animating only");
  } catch (error) {
    if (mutationState !== state) return;
    console.error("Snapshot capture failed:", error);
    state.imageSettled = true;
    state.phase = "interp";
    state.phaseStart = performance.now();
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
      prompt: buildRenderPrompt(dna),
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
  return URL.createObjectURL(blob);
}

function buildRenderPrompt(dna) {
  return [
    "Colorize the provided image using pastel cel-shaded sci-fi fantasy illustration with fine line art and a Moebius-inspired graphic aesthetic.",
    "Keep the shape unchanged and use a pure black background",
  ].join(", ");
}

async function captureReferenceImageForDNA(dna, rotation) {
  const snapshotRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  snapshotRenderer.setSize(APP.api.snapshotSize, APP.api.snapshotSize);
  snapshotRenderer.setPixelRatio(1);
  snapshotRenderer.outputColorSpace = THREE.SRGBColorSpace;
  snapshotRenderer.setClearColor(APP.renderer.clearColor, 1);

  const snapshotScene = new THREE.Scene();
  const snapshotCamera = new THREE.PerspectiveCamera(APP.camera.fov, 1, APP.camera.near, APP.camera.far);
  snapshotCamera.position.set(...APP.camera.position);

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

function showSnapshotOverlay(imageUrl, state) {
  $("snapshotImage").src = imageUrl;
  $("snapshotOverlay").classList.add("visible");
  state.phase = "overlay";
  state.phaseStart = performance.now();
  setStatusMessage("showing generated image");
}

function hideSnapshotOverlay() {
  const image = $("snapshotImage");
  if (image.src.startsWith("blob:")) URL.revokeObjectURL(image.src);
  image.removeAttribute("src");
  $("snapshotOverlay").classList.remove("visible");
  setStatusMessage("animating to next target");
}

["order", "warp", "fold", "spike", "chaos"].forEach((id) => {
  $(id).addEventListener("input", () => {
    if (["order", "warp", "fold", "spike", "chaos"].includes(id) && mutateOn) {
      mutateOn = false;
      mutationState = null;
      hideSnapshotOverlay();
    }
    syncUI();
    buildMorphology();
  });
});

$("apiKey").addEventListener("input", (event) => {
  setStoredApiKey(event.target.value);
});

document.querySelectorAll('input[name="renderMode"]').forEach((el) => {
  el.addEventListener("change", () => {
    if (el.checked) {
      renderMode = el.value;
      syncUI();
      buildMorphology();
    }
  });
});

$("hideBtn").addEventListener("click", () => {
  menuHidden = !menuHidden;
  syncUI();
});

$("mutate").addEventListener("click", () => {
  mutateOn = !mutateOn;
  mutationState = null;
  hideSnapshotOverlay();
  if (!mutateOn) setStatusMessage("");
  syncUI();
});

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

writeDNAControls(randomInitialDNA(APP.dna.ranges));
syncUI();
buildMorphology();

function animate(t) {
  requestAnimationFrame(animate);
  updateMutation(t);
  if (!mutateOn || !mutationState || mutationState.phase === "preparing") applyWorldRotation(getWorldRotationAtTime(t));
  controls.update();
  renderer.render(scene, camera);
}
animate(0);

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

    for (let x = 0; x <= meshConfig.uSeg; x++) {
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
      const a = y * (meshConfig.uSeg + 1) + x;
      const b = a + meshConfig.uSeg + 1;
      indices.push(a, b, a + 1);
      indices.push(b, b + 1, a + 1);
    }
  }

  return { positions, indices };
}
