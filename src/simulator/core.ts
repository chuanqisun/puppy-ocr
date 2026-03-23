/**
 * Core shape generation — creates the main body mesh
 */
import * as THREE from "three";
import type { RNG } from "./rng.ts";
import { deformVertices, createMaterial } from "./helpers.ts";

export function generateCore(
  shape: string,
  surfaceForm: string,
  rng: RNG
): THREE.Mesh {
  let geometry: THREE.BufferGeometry;

  switch (shape) {
    case "ellipsoid":
      geometry = new THREE.SphereGeometry(1, 32, 24);
      geometry.scale(1, 1.4, 0.8);
      break;
    case "torus":
      geometry = new THREE.TorusGeometry(0.7, 0.3, 16, 32);
      break;
    case "blob": {
      geometry = new THREE.SphereGeometry(1, 32, 24);
      // Deform into blob shape
      const pos = geometry.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const noise = 0.85 + rng() * 0.3;
        pos.setXYZ(i, x * noise, y * noise, z * noise);
      }
      pos.needsUpdate = true;
      geometry.computeVertexNormals();
      break;
    }
    case "capsule":
      geometry = new THREE.CapsuleGeometry(0.5, 1.0, 16, 16);
      break;
    case "star": {
      // Star-like shape using icosahedron with spiky deformation
      geometry = new THREE.IcosahedronGeometry(1, 1);
      const starPos = geometry.getAttribute("position");
      for (let i = 0; i < starPos.count; i++) {
        const x = starPos.getX(i);
        const y = starPos.getY(i);
        const z = starPos.getZ(i);
        const r = Math.sqrt(x * x + y * y + z * z);
        if (r > 0.001) {
          const spike = 0.7 + 0.6 * Math.abs(Math.sin(Math.atan2(z, x) * 5));
          starPos.setXYZ(i, x / r * spike, y / r * spike, z / r * spike);
        }
      }
      starPos.needsUpdate = true;
      geometry.computeVertexNormals();
      break;
    }
    case "sphere":
    default:
      geometry = new THREE.SphereGeometry(1, 32, 24);
      break;
  }

  // Apply surface deformation
  if (surfaceForm !== "smooth") {
    deformVertices(geometry, surfaceForm, rng);
  }

  const mesh = new THREE.Mesh(geometry, createMaterial(0xbbbbbb));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
