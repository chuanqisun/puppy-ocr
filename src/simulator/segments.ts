/**
 * Segmentation — repeats body modules along an axis
 */
import * as THREE from "three";
import type { RNG } from "./rng.ts";
import { createMaterial } from "./helpers.ts";

export function generateSegments(
  type: string,
  rng: RNG
): THREE.Group {
  const group = new THREE.Group();
  if (type === "none") return group;

  const count = type === "vertebrae" ? 8 : 5;

  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const y = -1.0 + t * 2.0;

    let mesh: THREE.Mesh;

    switch (type) {
      case "beaded": {
        const r = 0.15 + rng() * 0.05;
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(r, 12, 12),
          createMaterial(0xaaaaaa)
        );
        break;
      }
      case "stacked_disks": {
        const r = 0.3 - Math.abs(t - 0.5) * 0.2;
        mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(r, r, 0.08, 16),
          createMaterial(0x999999)
        );
        break;
      }
      case "vertebrae": {
        const r = 0.22 - i * 0.015;
        mesh = new THREE.Mesh(
          new THREE.TorusGeometry(Math.max(0.05, r), 0.04, 8, 16),
          createMaterial(0xbbbbbb)
        );
        break;
      }
      default:
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.15, 12, 12),
          createMaterial(0xaaaaaa)
        );
    }

    mesh.position.y = y;
    mesh.castShadow = true;
    group.add(mesh);
  }

  return group;
}
