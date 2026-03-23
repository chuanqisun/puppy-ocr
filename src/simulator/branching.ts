/**
 * Branching — recursive visible branch generation
 */
import * as THREE from "three";
import type { RNG } from "./rng.ts";
import { createLineMaterial } from "./helpers.ts";

function branchRecursive(
  group: THREE.Group,
  start: THREE.Vector3,
  dir: THREE.Vector3,
  length: number,
  depth: number,
  style: string,
  rng: RNG
): void {
  if (depth <= 0 || length < 0.02) return;

  const end = start.clone().add(dir.clone().normalize().multiplyScalar(length));

  // Draw branch segment as a line
  const geom = new THREE.BufferGeometry().setFromPoints([start, end]);
  group.add(new THREE.Line(geom, createLineMaterial(0xcccccc)));

  // Determine branching angles based on style
  let angles: number[];
  let taper: number;

  switch (style) {
    case "coral":
      angles = [-0.5, 0.5];
      taper = 0.72;
      break;
    case "vascular":
      angles = [-0.35, 0.35];
      taper = 0.78;
      break;
    case "lightning":
      angles = [-0.9, 0.6];
      taper = 0.65;
      break;
    default:
      angles = [-0.5, 0.5];
      taper = 0.72;
  }

  // Add slight randomness
  for (const angle of angles) {
    const jitter = (rng() - 0.5) * 0.3;
    const axis = new THREE.Vector3(0, 0, 1);
    const newDir = dir.clone().applyAxisAngle(axis, angle + jitter);
    // Also rotate around Y for 3D spread
    newDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), (rng() - 0.5) * 0.5);

    branchRecursive(group, end, newDir, length * taper, depth - 1, style, rng);
  }
}

export function generateBranches(
  type: string,
  rng: RNG
): THREE.Group {
  const group = new THREE.Group();
  if (type === "none") return group;

  const maxDepth = 4;
  const initialLength = 0.5;

  // Generate 3-4 main branches from different directions
  const branchCount = type === "lightning" ? 3 : 4;
  for (let i = 0; i < branchCount; i++) {
    const angle = (i / branchCount) * Math.PI * 2;
    const dir = new THREE.Vector3(
      Math.cos(angle),
      0.5 + rng() * 0.5,
      Math.sin(angle)
    ).normalize();

    const start = new THREE.Vector3(
      Math.cos(angle) * 0.3,
      rng() * 0.5,
      Math.sin(angle) * 0.3
    );

    branchRecursive(group, start, dir, initialLength, maxDepth, type, rng);
  }

  return group;
}
