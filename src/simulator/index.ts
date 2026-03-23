/**
 * Simulator module
 * Takes a config JSON and generates 3D geometry (procedural + seeded randomness).
 */
import * as THREE from "three";
import type { OrganismConfig } from "../configurator/index.ts";
import { createRNG } from "./rng.ts";
import { generateCore } from "./core.ts";
import { generateAppendages } from "./appendages.ts";
import { generateSegments } from "./segments.ts";
import { generateBranches } from "./branching.ts";
import { generateMembrane } from "./membrane.ts";
import { generateFocalFeature } from "./focal.ts";
import { applySymmetry } from "./symmetry.ts";

export interface OrganismGeometry {
  group: THREE.Group;
}

/**
 * Generate a complete organism from config.
 * This is deterministic for the same config + seed.
 */
export function generateOrganism(config: OrganismConfig): OrganismGeometry {
  const rng = createRNG(config.seed);

  // 1. Generate core body
  const core = generateCore(
    config.core_shape ?? "sphere",
    config.core_surface_form ?? "smooth",
    rng
  );

  // 2. Create a unit group (pre-symmetry)
  const unit = new THREE.Group();
  unit.add(core);

  // 3. Generate appendages
  const appendages = generateAppendages(
    config.appendage_family ?? "none",
    config.appendage_layout ?? "all_around",
    config.appendage_length_type ?? "medium",
    config.appendage_motion_impression ?? "curved",
    config.body_plan ?? "radial",
    rng
  );
  unit.add(appendages);

  // 4. Generate segmentation
  const segments = generateSegments(
    config.segmentation_type ?? "none",
    rng
  );
  unit.add(segments);

  // 5. Generate branching
  const branches = generateBranches(
    config.branching_type ?? "none",
    rng
  );
  unit.add(branches);

  // 6. Generate membrane
  const membrane = generateMembrane(
    config.membrane_type ?? "none",
    rng
  );
  unit.add(membrane);

  // 7. Generate focal feature
  const focal = generateFocalFeature(
    config.focal_feature ?? "none",
    rng
  );
  unit.add(focal);

  // 8. Apply symmetry
  const organism = applySymmetry(unit, config.symmetry_type ?? "none", rng);
  organism.name = "organism";

  return { group: organism };
}
