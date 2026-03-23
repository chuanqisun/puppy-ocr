/** Parameter definitions for the organism configurator */

export interface ParameterDef {
  name: string;
  label: string;
  values: string[];
  defaultValue: string;
  group: "structural" | "ai_appearance";
}

export const structuralParameters: ParameterDef[] = [
  {
    name: "body_plan",
    label: "Body Plan",
    values: ["radial", "bilateral", "axial", "amoeboid", "ring"],
    defaultValue: "radial",
    group: "structural",
  },
  {
    name: "silhouette_type",
    label: "Silhouette",
    values: ["round", "oval", "spindle", "lobed", "stellate", "irregular"],
    defaultValue: "round",
    group: "structural",
  },
  {
    name: "symmetry_type",
    label: "Symmetry",
    values: ["none", "bilateral", "radial_4", "radial_6", "approximate"],
    defaultValue: "bilateral",
    group: "structural",
  },
  {
    name: "core_shape",
    label: "Core Shape",
    values: ["sphere", "ellipsoid", "torus", "blob", "capsule", "star"],
    defaultValue: "sphere",
    group: "structural",
  },
  {
    name: "core_surface_form",
    label: "Core Surface",
    values: ["smooth", "wavy", "lobed", "spiked", "scalloped"],
    defaultValue: "smooth",
    group: "structural",
  },
  {
    name: "appendage_family",
    label: "Appendages",
    values: ["none", "tentacles", "spines", "petals", "antennae"],
    defaultValue: "none",
    group: "structural",
  },
  {
    name: "appendage_layout",
    label: "Appendage Layout",
    values: ["side_paired", "all_around", "along_spine", "tip_only", "ring_layer"],
    defaultValue: "all_around",
    group: "structural",
  },
  {
    name: "appendage_length_type",
    label: "Appendage Length",
    values: ["stubby", "medium", "long"],
    defaultValue: "medium",
    group: "structural",
  },
  {
    name: "appendage_motion_impression",
    label: "Appendage Motion",
    values: ["rigid", "curved", "wavy", "drooping", "coiling"],
    defaultValue: "curved",
    group: "structural",
  },
  {
    name: "segmentation_type",
    label: "Segmentation",
    values: ["none", "beaded", "stacked_disks", "vertebrae"],
    defaultValue: "none",
    group: "structural",
  },
  {
    name: "branching_type",
    label: "Branching",
    values: ["none", "coral", "vascular", "lightning"],
    defaultValue: "none",
    group: "structural",
  },
  {
    name: "outline_profile",
    label: "Outline",
    values: ["clean", "wobbly", "spiky", "scalloped", "double_rim"],
    defaultValue: "clean",
    group: "structural",
  },
  {
    name: "focal_feature",
    label: "Focal Feature",
    values: ["none", "eye", "orb", "spiral", "sigil"],
    defaultValue: "none",
    group: "structural",
  },
  {
    name: "membrane_type",
    label: "Membrane",
    values: ["none", "webbed", "winglike", "gelatinous_fill"],
    defaultValue: "none",
    group: "structural",
  },
];

export const aiAppearanceParameters: ParameterDef[] = [
  {
    name: "aesthetic_mode",
    label: "Aesthetic Mode",
    values: ["scientific_plate", "ornamental", "psychedelic", "heraldic", "diagrammatic", "grotesque", "minimalist", "sacred_symbol"],
    defaultValue: "scientific_plate",
    group: "ai_appearance",
  },
  {
    name: "palette_type",
    label: "Palette",
    values: ["monochrome_dark", "monochrome_light", "duotone_ink", "complementary", "analogous", "neon_bio", "muted_specimen", "toxic_warning", "iridescent"],
    defaultValue: "muted_specimen",
    group: "ai_appearance",
  },
  {
    name: "surface_pattern",
    label: "Surface Pattern",
    values: ["none", "stripes", "spots", "rings", "cells", "veins", "scales", "speckles"],
    defaultValue: "none",
    group: "ai_appearance",
  },
  {
    name: "texture_type",
    label: "Texture",
    values: ["smooth", "porous", "fibrous", "scaly", "fleshy", "dusty", "velvety"],
    defaultValue: "smooth",
    group: "ai_appearance",
  },
  {
    name: "background_type",
    label: "Background",
    values: ["plain", "paper", "grid", "specimen_card", "dark_void", "soft_halo"],
    defaultValue: "dark_void",
    group: "ai_appearance",
  },
];

export const allParameters: ParameterDef[] = [
  ...structuralParameters,
  ...aiAppearanceParameters,
];
