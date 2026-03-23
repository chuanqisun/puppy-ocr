/**
 * Configurator module
 * Generates a JSON config object representing a life form.
 */

import { allParameters, structuralParameters, aiAppearanceParameters } from "./parameters.ts";
import type { ParameterDef } from "./parameters.ts";

export type OrganismConfig = Record<string, string> & { seed: number };

export function createDefaultConfig(): OrganismConfig {
  const config: Record<string, string> = {};
  for (const param of allParameters) {
    config[param.name] = param.defaultValue;
  }
  return { ...config, seed: Math.floor(Math.random() * 100000) } as OrganismConfig;
}

export function randomizeConfig(): OrganismConfig {
  const config: Record<string, string> = {};
  for (const param of allParameters) {
    const idx = Math.floor(Math.random() * param.values.length);
    config[param.name] = param.values[idx];
  }
  return { ...config, seed: Math.floor(Math.random() * 100000) } as OrganismConfig;
}

export function configToJSON(config: OrganismConfig): string {
  return JSON.stringify(config, null, 2);
}

export function configFromJSON(json: string): OrganismConfig {
  return JSON.parse(json) as OrganismConfig;
}

export { allParameters, structuralParameters, aiAppearanceParameters };
export type { ParameterDef };
