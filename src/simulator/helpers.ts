/**
 * Shared geometry helpers for the simulator
 */
import * as THREE from "three";
import type { RNG } from "./rng.ts";

/** Generate radial anchor points in 3D (on the XZ plane) */
export function radialAnchors(count: number, radius: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  return pts;
}

/** Generate mirrored anchor points along the Y axis */
export function mirroredAnchors(count: number, offset: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const y = -0.8 + i * (1.6 / Math.max(1, count - 1));
    pts.push(new THREE.Vector3(offset, y, 0));
    pts.push(new THREE.Vector3(-offset, y, 0));
  }
  return pts;
}

/** Generate spine points along the Y axis */
export function spinePoints(count: number, length: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    pts.push(new THREE.Vector3(0, -length / 2 + t * length, 0));
  }
  return pts;
}

/** Deform a geometry's vertices with noise */
export function deformVertices(
  geometry: THREE.BufferGeometry,
  mode: string,
  _rng: RNG,
  intensity: number = 0.1
): void {
  const pos = geometry.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.sqrt(x * x + y * y + z * z);
    if (r < 0.001) continue;

    const theta = Math.atan2(z, x);
    const phi = Math.acos(Math.min(1, Math.max(-1, y / r)));
    let factor = 1.0;

    switch (mode) {
      case "wavy":
        factor += intensity * Math.sin(6 * theta) * Math.sin(4 * phi);
        break;
      case "lobed":
        factor += intensity * 1.6 * Math.sin(4 * theta);
        break;
      case "spiked":
        factor += intensity * 2.0 * Math.max(0, Math.sin(10 * theta) * Math.sin(8 * phi));
        break;
      case "scalloped":
        factor += intensity * Math.abs(Math.sin(12 * theta));
        break;
      default: // smooth
        break;
    }

    pos.setXYZ(i, x * factor, y * factor, z * factor);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

/** Create a standard organism material */
export function createMaterial(color: number = 0xcccccc, wireframe: boolean = false): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.6,
    metalness: 0.1,
    wireframe,
    side: THREE.DoubleSide,
  });
}

/** Create a line material */
export function createLineMaterial(color: number = 0xffffff): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({ color });
}
