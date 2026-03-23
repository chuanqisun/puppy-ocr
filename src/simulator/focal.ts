/**
 * Focal feature — adds a prominent visible motif
 */
import * as THREE from "three";
import type { RNG } from "./rng.ts";
import { createMaterial, createLineMaterial } from "./helpers.ts";

export function generateFocalFeature(
  type: string,
  _rng: RNG
): THREE.Group {
  const group = new THREE.Group();
  if (type === "none") return group;

  switch (type) {
    case "eye": {
      const outer = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 16, 16),
        createMaterial(0xffffff)
      );
      group.add(outer);
      const iris = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 16, 16),
        createMaterial(0x446688)
      );
      iris.position.z = 0.1;
      group.add(iris);
      const pupil = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 12, 12),
        createMaterial(0x111111)
      );
      pupil.position.z = 0.15;
      group.add(pupil);
      break;
    }
    case "orb": {
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 20, 20),
        new THREE.MeshStandardMaterial({
          color: 0xeeeeff,
          emissive: 0x334455,
          emissiveIntensity: 0.4,
          roughness: 0.2,
          metalness: 0.3,
        })
      );
      group.add(orb);
      break;
    }
    case "spiral": {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < 80; i++) {
        const t = (i / 80) * 4 * Math.PI;
        const r = 0.02 + i * 0.002;
        pts.push(new THREE.Vector3(Math.cos(t) * r, Math.sin(t) * r, 0.01));
      }
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      group.add(new THREE.Line(geom, createLineMaterial(0xffffff)));
      break;
    }
    case "sigil": {
      // Simple geometric sigil — concentric rings + cross lines
      const ring1 = new THREE.Mesh(
        new THREE.TorusGeometry(0.15, 0.01, 8, 32),
        createMaterial(0xffffff)
      );
      group.add(ring1);
      const ring2 = new THREE.Mesh(
        new THREE.TorusGeometry(0.1, 0.008, 8, 24),
        createMaterial(0xcccccc)
      );
      group.add(ring2);
      // Cross lines
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI;
        const pts = [
          new THREE.Vector3(Math.cos(a) * 0.05, Math.sin(a) * 0.05, 0.01),
          new THREE.Vector3(Math.cos(a) * 0.15, Math.sin(a) * 0.15, 0.01),
        ];
        const geom = new THREE.BufferGeometry().setFromPoints(pts);
        group.add(new THREE.Line(geom, createLineMaterial(0xdddddd)));
      }
      break;
    }
  }

  // Position focal feature at front of organism
  group.position.set(0, 0, 1.05);

  return group;
}
