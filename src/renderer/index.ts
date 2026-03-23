/**
 * Renderer module
 * Sets up a three.js scene with camera, lights, and orbit controls.
 * Takes geometry from the simulator and renders it in 3D.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { OrganismGeometry } from "../simulator/index.ts";

export interface Renderer {
  mount(container: HTMLElement): void;
  setOrganism(geometry: OrganismGeometry): void;
  dispose(): void;
  resize(): void;
  getRenderer(): THREE.WebGLRenderer;
}

export function createRenderer(): Renderer {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0f);

  // Camera
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 1.5, 4);
  camera.lookAt(0, 0, 0);

  // Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  // Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0, 0);
  controls.maxDistance = 15;
  controls.minDistance = 1;

  // Lights
  const ambientLight = new THREE.AmbientLight(0x404050, 0.8);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
  directionalLight.position.set(5, 8, 5);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 1024;
  directionalLight.shadow.mapSize.height = 1024;
  scene.add(directionalLight);

  const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
  fillLight.position.set(-3, -2, -5);
  scene.add(fillLight);

  // Ground reference — subtle grid
  const gridHelper = new THREE.GridHelper(6, 12, 0x222233, 0x181822);
  gridHelper.position.y = -1.5;
  scene.add(gridHelper);

  let currentOrganism: THREE.Group | null = null;
  let animationId: number | null = null;

  function animate() {
    animationId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  return {
    mount(container: HTMLElement) {
      container.appendChild(renderer.domElement);
      const rect = container.getBoundingClientRect();
      renderer.setSize(rect.width, rect.height);
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
      animate();
    },

    setOrganism(geometry: OrganismGeometry) {
      // Remove previous organism
      if (currentOrganism) {
        scene.remove(currentOrganism);
        currentOrganism.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach((m) => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
      }

      currentOrganism = geometry.group;
      scene.add(currentOrganism);

      // Reset camera
      controls.reset();
      camera.position.set(0, 1.5, 4);
      camera.lookAt(0, 0, 0);
    },

    resize() {
      const parent = renderer.domElement.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      renderer.setSize(rect.width, rect.height);
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
    },

    dispose() {
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
      }
      controls.dispose();
      renderer.dispose();
    },

    getRenderer() {
      return renderer;
    },
  };
}
