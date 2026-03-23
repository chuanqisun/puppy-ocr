/**
 * Appendage generation — creates limbs, tentacles, spines, etc.
 */
import * as THREE from "three";
import type { RNG } from "./rng.ts";
import { createMaterial, createLineMaterial } from "./helpers.ts";

/** Get appendage length scalar from type */
function getLength(lengthType: string): number {
  switch (lengthType) {
    case "stubby": return 0.4;
    case "long": return 1.4;
    default: return 0.8; // medium
  }
}

/** Generate curved points along a direction */
function curvedPoints(
  start: THREE.Vector3,
  dir: THREE.Vector3,
  length: number,
  steps: number,
  motion: string,
  rng: RNG
): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(dir, up).normalize();
  if (side.length() < 0.01) side.set(1, 0, 0);

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = start.clone().add(dir.clone().normalize().multiplyScalar(length * t));

    switch (motion) {
      case "curved":
        p.add(side.clone().multiplyScalar(0.2 * Math.sin(Math.PI * t)));
        break;
      case "wavy":
        p.add(side.clone().multiplyScalar(0.12 * Math.sin(6 * t * Math.PI)));
        break;
      case "drooping":
        p.y -= 0.3 * t * t;
        break;
      case "coiling":
        p.add(side.clone().multiplyScalar(0.15 * Math.sin(8 * t * Math.PI)));
        p.y += 0.08 * Math.cos(8 * t * Math.PI);
        break;
      default: // rigid
        break;
    }
    // Add slight randomness
    p.x += (rng() - 0.5) * 0.02;
    p.z += (rng() - 0.5) * 0.02;
    pts.push(p);
  }
  return pts;
}

/** Create a single appendage */
function createAppendage(
  family: string,
  start: THREE.Vector3,
  dir: THREE.Vector3,
  length: number,
  motion: string,
  rng: RNG
): THREE.Object3D {
  const group = new THREE.Group();

  if (family === "spines") {
    // Simple line from start to end
    const end = start.clone().add(dir.clone().normalize().multiplyScalar(length));
    const geom = new THREE.BufferGeometry().setFromPoints([start, end]);
    group.add(new THREE.Line(geom, createLineMaterial(0xdddddd)));
    // Add small cone at tip
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.03, length * 0.3, 8),
      createMaterial(0xdddddd)
    );
    const mid = start.clone().add(dir.clone().normalize().multiplyScalar(length * 0.85));
    cone.position.copy(mid);
    cone.lookAt(end);
    cone.rotateX(Math.PI / 2);
    group.add(cone);
    return group;
  }

  if (family === "tentacles" || family === "antennae") {
    const pts = curvedPoints(start, dir, length, 12, motion, rng);
    // Create tube geometry along the path
    const curve = new THREE.CatmullRomCurve3(pts);
    const radius = family === "antennae" ? 0.02 : 0.04;
    const tubeGeom = new THREE.TubeGeometry(curve, 16, radius, 6, false);
    const tube = new THREE.Mesh(tubeGeom, createMaterial(0xaaaaaa));
    tube.castShadow = true;
    group.add(tube);

    if (family === "antennae") {
      // Add small sphere at tip
      const tip = pts[pts.length - 1];
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 8),
        createMaterial(0xeeeeee)
      );
      sphere.position.copy(tip);
      group.add(sphere);
    }
    return group;
  }

  if (family === "petals") {
    // Create petal-like flat shape
    const petalShape = new THREE.Shape();
    const w = length * 0.3;
    petalShape.moveTo(0, 0);
    petalShape.quadraticCurveTo(w, length * 0.5, 0, length);
    petalShape.quadraticCurveTo(-w, length * 0.5, 0, 0);
    const shapeGeom = new THREE.ShapeGeometry(petalShape);
    const petal = new THREE.Mesh(shapeGeom, createMaterial(0xccaacc));
    petal.castShadow = true;

    // Orient petal along direction
    petal.position.copy(start);
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    petal.quaternion.copy(quaternion);
    group.add(petal);
    return group;
  }

  return group;
}

/** Generate appendage anchor points based on layout */
function generateAnchors(
  layout: string,
  bodyPlan: string,
  _rng: RNG
): { position: THREE.Vector3; direction: THREE.Vector3 }[] {
  const anchors: { position: THREE.Vector3; direction: THREE.Vector3 }[] = [];

  switch (layout) {
    case "all_around":
    case "ring_layer": {
      const count = layout === "ring_layer" ? 12 : 8;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const pos = new THREE.Vector3(Math.cos(a) * 1.05, 0, Math.sin(a) * 1.05);
        anchors.push({ position: pos, direction: pos.clone().normalize() });
      }
      break;
    }
    case "side_paired": {
      const count = bodyPlan === "axial" ? 5 : 3;
      for (let i = 0; i < count; i++) {
        const y = -0.6 + i * (1.2 / Math.max(1, count - 1));
        anchors.push({
          position: new THREE.Vector3(1.05, y, 0),
          direction: new THREE.Vector3(1, 0, 0),
        });
        anchors.push({
          position: new THREE.Vector3(-1.05, y, 0),
          direction: new THREE.Vector3(-1, 0, 0),
        });
      }
      break;
    }
    case "along_spine": {
      for (let i = 0; i < 5; i++) {
        const y = -0.8 + i * 0.4;
        anchors.push({
          position: new THREE.Vector3(0, y, 1.05),
          direction: new THREE.Vector3(0, 0, 1),
        });
      }
      break;
    }
    case "tip_only": {
      anchors.push({
        position: new THREE.Vector3(0, 1.05, 0),
        direction: new THREE.Vector3(0, 1, 0),
      });
      break;
    }
    case "top_cluster": {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        anchors.push({
          position: new THREE.Vector3(Math.cos(a) * 0.4, 1.05, Math.sin(a) * 0.4),
          direction: new THREE.Vector3(Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3).normalize(),
        });
      }
      break;
    }
    default:
      break;
  }
  return anchors;
}

/** Generate all appendages for an organism */
export function generateAppendages(
  family: string,
  layout: string,
  lengthType: string,
  motion: string,
  bodyPlan: string,
  rng: RNG
): THREE.Group {
  const group = new THREE.Group();
  if (family === "none") return group;

  const length = getLength(lengthType);
  const anchors = generateAnchors(layout, bodyPlan, rng);

  for (const anchor of anchors) {
    const appendage = createAppendage(
      family,
      anchor.position,
      anchor.direction,
      length,
      motion,
      rng
    );
    group.add(appendage);
  }

  return group;
}
