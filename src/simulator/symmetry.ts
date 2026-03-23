/**
 * Symmetry transforms — duplicate and mirror/rotate geometry
 */
import * as THREE from "three";
import type { RNG } from "./rng.ts";

export function applySymmetry(
  group: THREE.Group,
  type: string,
  rng: RNG
): THREE.Group {
  const result = new THREE.Group();

  switch (type) {
    case "none":
      result.add(group);
      break;
    case "bilateral": {
      result.add(group);
      const mirror = group.clone();
      mirror.scale.x = -1;
      result.add(mirror);
      break;
    }
    case "radial_4":
    case "radial_6": {
      const count = type === "radial_4" ? 4 : 6;
      for (let i = 0; i < count; i++) {
        const copy = group.clone();
        copy.rotation.y = (i / count) * Math.PI * 2;
        result.add(copy);
      }
      break;
    }
    case "approximate": {
      result.add(group);
      const approxMirror = group.clone();
      // Slight offset for "approximate" symmetry
      approxMirror.scale.x = -1;
      approxMirror.scale.y = 1 + (rng() - 0.5) * 0.05;
      approxMirror.position.y += (rng() - 0.5) * 0.05;
      result.add(approxMirror);
      break;
    }
    default:
      result.add(group);
  }

  return result;
}
