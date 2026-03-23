/**
 * Membrane generation — surfaces between appendages or around supports
 */
import * as THREE from "three";
import type { RNG } from "./rng.ts";

export function generateMembrane(
  type: string,
  _rng: RNG
): THREE.Group {
  const group = new THREE.Group();
  if (type === "none") return group;

  const material = new THREE.MeshStandardMaterial({
    color: 0xccccdd,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    roughness: 0.8,
  });

  switch (type) {
    case "webbed": {
      // Create webbed surfaces between radial points
      const count = 8;
      for (let i = 0; i < count; i++) {
        const a1 = (i / count) * Math.PI * 2;
        const a2 = ((i + 1) / count) * Math.PI * 2;
        const r = 1.2;

        const vertices = new Float32Array([
          0, 0, 0,
          Math.cos(a1) * r, 0, Math.sin(a1) * r,
          Math.cos(a2) * r, 0, Math.sin(a2) * r,
        ]);
        const geom = new THREE.BufferGeometry();
        geom.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
        geom.computeVertexNormals();
        const mesh = new THREE.Mesh(geom, material);
        group.add(mesh);
      }
      break;
    }
    case "winglike": {
      // Two wing-like shapes on sides
      for (const side of [-1, 1]) {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.quadraticCurveTo(side * 1.5, 0.8, side * 1.2, 0);
        shape.quadraticCurveTo(side * 1.5, -0.5, 0, 0);
        const shapeGeom = new THREE.ShapeGeometry(shape);
        const mesh = new THREE.Mesh(shapeGeom, material);
        mesh.rotation.x = -Math.PI / 2;
        group.add(mesh);
      }
      break;
    }
    case "gelatinous_fill": {
      // Large transparent sphere
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(1.3, 24, 24),
        new THREE.MeshStandardMaterial({
          color: 0xaabbcc,
          transparent: true,
          opacity: 0.15,
          side: THREE.DoubleSide,
          roughness: 0.9,
        })
      );
      group.add(sphere);
      break;
    }
  }

  return group;
}
