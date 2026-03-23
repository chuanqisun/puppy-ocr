/**
 * AI module — no-op placeholder for v1
 *
 * In future versions, this module will handle:
 * - AI-based appearance enhancement (aesthetic_mode, palette, textures)
 * - Post-processing after 3D geometry is generated
 * - Surface pattern generation
 * - Color and material refinement
 *
 * For v1, all AI features are left as no-op placeholders.
 */

import type { OrganismConfig } from "../configurator/index.ts";

/**
 * AI appearance enhancement — currently a no-op.
 * In future, this will modify materials, textures, and post-processing
 * based on AI-rendered appearance parameters.
 */
export function applyAIAppearance(_config: OrganismConfig): void {
  // No-op for v1
  // Future: Apply AI-generated textures, patterns, colors
}

/**
 * AI post-processing — currently a no-op.
 * In future, this will apply post-processing effects after 3D rendering.
 */
export function applyAIPostProcessing(_canvas: HTMLCanvasElement): void {
  // No-op for v1
  // Future: Apply AI-driven post-processing to the rendered output
}
