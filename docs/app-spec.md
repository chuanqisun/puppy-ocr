# life.config — v2 App Spec

**life.config** is an interactive generative art app for creating single synthetic organisms as **3D geometry**. Users configure a structured generative system, and the app produces a unique alien specimen as a rendered volumetric form. The goal is not realism or biological simulation. The focus is aesthetic exploration: biomorphic structure, compositional identity, symmetry, growth logic, and strange formal diversity.

In v2, the app evolves from 2D graphic specimens into **3D object generation**. Each result is still a **single organism**, static and presented as a specimen, but now rendered as visible three-dimensional geometry. The system remains centered on **one coherent form at a time** rather than scenes, swarms, or ecosystems.

All configurable controls are defined in **`parameter-list.md`**. As in v1, the system separates **structure** from **appearance**:

- **Structure** is generated procedurally in code using JavaScript and three.js.
- **Appearance**—including color, surface detail, texture, patterning, and presentation styling—may be handled by an AI rendering layer.

The procedural generator is responsible only for **visible geometry**. It constructs external masses, appendages, shells, membranes, segmentation, branching structures, and focal features. It does **not** model hidden internal anatomy, simulation systems, or behavioral logic. This keeps generation feasible in-browser while preserving a strong sense of complexity and identity.

## Core workflow

1. The user selects or edits a configuration from `parameter-list.md`.
2. The procedural engine generates a single visible 3D organism.
3. The app renders the result in a three.js scene.
4. An optional AI appearance pass enhances non-structural features.
5. The user iterates, regenerates, saves, and exports.

The app should feel like a **browser for possible life-objects**: a system for composing and discovering speculative organisms as sculptural artifacts.

## What the app generates

The app generates:

- a single static 3D organism
- visible exterior geometry only
- a reproducible procedural configuration
- an optional AI-enhanced final render

The app does not generate:

- behavior or movement
- offspring or evolutionary lineage
- swarms, groups, or environments
- hidden organs or internal systems

Camera and lighting are handled by the system. The user’s role is to shape the organism, not to stage or cinematographically direct it. We allow basic orbit controls from three.js. Simple lighting.

## Technical approach

The app runs in the browser using **JavaScript + three.js**. Structural generation uses mesh primitives, deformation, sweeping, duplication, symmetry transforms, branching systems, and layered outer shells. Depending on the form, geometry may be built from:

- primitive meshes
- lathed/revolved profiles
- extruded or swept cross-sections
- repeated segment modules
- recursive branch structures
- membranes spanning visible anchor points
- deformed blob-like volumes

The resulting geometry should remain performant enough for interactive regeneration. The system should favor clear procedural assembly over expensive simulation.

## User experience goals

- Fast iteration over distinct organism identities
- Strong visual variety from a compact structured control system
- Coherent separation between form generation and appearance rendering
- Outputs that read as specimens, artifacts, or impossible life-forms
- Minimal technical overhead for the user

## Functional scope

### In scope

- Procedural generation of visible 3D organism geometry
- Real-time preview in three.js
- Configuration editing using `parameter-list.md`
- Seeded reproducibility
- Saving/loading configurations
- Exporting rendered outputs
- Optional AI-based appearance enhancement

### Out of scope

- Physics or simulation
- Internal anatomy
- Evolutionary systems
- Multi-creature scenes

In short, **life.config v2** is a browser-based system for generating and exploring artificial life-forms as **3D procedural specimens**: code-built in structure, AI-enhanced in appearance, and designed for rapid aesthetic discovery.

## `parameter-list.md`

### Structural parameters

| Name                          | Values                                                                                                | Implementation strategy                                                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `body_plan`                   | `radial`, `bilateral`, `axial`, `segmented`, `amoeboid`, `starburst`, `ring`, `branching`             | Generate a 3D scaffold: center+rays, half+mirror, spine curve, repeated modules on path, blob volume, ray burst, toroidal layout, or recursive branch graph. |
| `silhouette_type`             | `round`, `oval`, `spindle`, `lobed`, `stellate`, `shield`, `filamentous`, `irregular`                 | Choose the dominant outer mass profile before extrusion, revolution, or volumetric blending.                                                                 |
| `symmetry_type`               | `none`, `bilateral`, `radial_4`, `radial_6`, `radial_8`, `approximate`                                | Generate one unit, then mirror or rotate-copy it in 3D space.                                                                                                |
| `density_type`                | `sparse`, `balanced`, `dense`, `overgrown`                                                            | Control how many visible structural parts are instantiated and how tightly they occupy space.                                                                |
| `complexity_tier`             | `minimal`, `simple`, `ornate`, `maximal`                                                              | Activate more or fewer geometry subsystems and repetitions.                                                                                                  |
| `core_presence`               | `none`, `small_core`, `dominant_core`, `hollow_core`                                                  | Add, scale, or omit the main visible body volume.                                                                                                            |
| `core_shape`                  | `sphere`, `ellipsoid`, `torus`, `blob`, `capsule`, `polyhedron`, `star`, `shield`                     | Create the main visible body mass from the chosen primitive or deformed primitive.                                                                           |
| `core_surface_form`           | `smooth`, `wavy`, `lobed`, `spiked`, `frilled`, `scalloped`                                           | Apply large-scale deformation to the visible exterior surface.                                                                                               |
| `skeleton_type`               | `none`, `central_spine`, `paired_ribs`, `radial_spokes`, `node_chain`, `branch_network`               | Build a visible external support structure or use it as anchors for visible outer forms only.                                                                |
| `segmentation_type`           | `none`, `beaded`, `insectoid`, `vertebrae`, `stacked_disks`, `shell_plates`                           | Repeat visible body modules along an axis/path to form the exterior body.                                                                                    |
| `segment_profile`             | `round`, `oval`, `angular`, `spiky`, `flattened`, `bulbous`                                           | Define the visible shape of each repeated segment volume.                                                                                                    |
| `appendage_family`            | `none`, `tentacles`, `fins`, `legs`, `antennae`, `petals`, `spines`, `fronds`, `cilia_halo`           | Generate appendages from anchor points using family-specific mesh rules.                                                                                     |
| `appendage_layout`            | `side_paired`, `all_around`, `top_cluster`, `bottom_cluster`, `along_spine`, `tip_only`, `ring_layer` | Place appendage anchors on the visible body or scaffold according to layout rule.                                                                            |
| `appendage_length_type`       | `stubby`, `medium`, `long`, `trailing`                                                                | Use discrete length presets when constructing appendage geometry.                                                                                            |
| `appendage_shape`             | `tapered`, `rounded`, `blade`, `thread`, `bulbed`, `forked`, `feathered`, `hooked`                    | Choose the appendage mesh profile and terminal form.                                                                                                         |
| `appendage_motion_impression` | `rigid`, `curved`, `wavy`, `splayed`, `drooping`, `coiling`                                           | Shape appendage centerlines and deformations to imply motion in static form.                                                                                 |
| `branching_type`              | `none`, `coral`, `vascular`, `fungal`, `lightning`, `rootlike`                                        | Use a recursive visible branch generator with style-specific angle and taper rules.                                                                          |
| `branching_density`           | `light`, `moderate`, `dense`                                                                          | Limit recursion depth and child count in the visible branch system.                                                                                          |
| `termination_type`            | `pointed`, `rounded`, `split`, `budded`, `frayed`, `eyelike`                                          | Apply visible end-cap geometry to appendages and branches.                                                                                                   |
| `membrane_type`               | `none`, `webbed`, `winglike`, `saclike`, `veil`, `gelatinous_fill`                                    | Generate visible surfaces between appendages or around outer supports.                                                                                       |
| `membrane_edge`               | `clean`, `ruffled`, `torn`, `lacey`, `dripping`                                                       | Modify only the exposed membrane boundary or open edges.                                                                                                     |
| `shell_type`                  | `none`, `carapace`, `plated`, `spiral_shell`, `dome`, `cage`                                          | Add a visible outer enclosure layer around the body.                                                                                                         |
| `shell_opening`               | `closed`, `front_open`, `top_open`, `split_open`, `ribbed_open`                                       | Control how much of the shell/enclosure is visibly exposed or open.                                                                                          |
| `outline_profile`             | `clean`, `wobbly`, `spiky`, `frilled`, `scalloped`, `double_rim`                                      | Control the visible outer profile of the 3D form when viewed as a specimen.                                                                                  |
| `perimeter_activity`          | `quiet`, `articulated`, `busy`, `explosive`                                                           | Control frequency and intensity of protrusions, splits, edge events, and sub-forms.                                                                          |
| `focal_feature`               | `none`, `eye`, `mouth`, `orb`, `flower_center`, `sigil`, `vent`, `spiral`                             | Add one prominent visible motif on the exterior surface or body front.                                                                                       |
| `focal_position`              | `center`, `top`, `bottom`, `offset_left`, `offset_right`, `front`                                     | Place the focal motif at a visible anchor region.                                                                                                            |
| `volume_style`                | `inflated`, `taut`, `skeletal`, `chunky`, `thin`, `layered`                                           | Bias how mass is distributed in 3D across the organism.                                                                                                      |
| `cross_section_type`          | `round`, `oval`, `triangular`, `ribbon`, `square`, `star`                                             | Define profile shape used for sweeps, limbs, and segmented forms.                                                                                            |
| `thickness_profile`           | `uniform`, `tapered`, `bulbed_center`, `bulbed_tip`, `beaded`                                         | Control how thickness changes along limbs, spine, or segments.                                                                                               |
| `biomorphic_style`            | `cellular`, `floral`, `insectoid`, `marine`, `fungal`, `skeletal`, `embryonic`, `glyphic`             | Bias the structural generator toward matching 3D shape vocabularies for each style.                                                                          |

### AI-rendered appearance parameters

| Name                   | Values                                                                                                                                          | Implementation strategy |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `aesthetic_mode`       | `scientific_plate`, `ornamental`, `psychedelic`, `heraldic`, `diagrammatic`, `grotesque`, `minimalist`, `sacred_symbol`                         | AI generated.           |
| `temperament_read`     | `gentle`, `elegant`, `alien`, `ominous`, `toxic`, `regal`, `fragile`, `monstrous`                                                               | AI generated.           |
| `surface_pattern`      | `none`, `stripes`, `spots`, `rings`, `cells`, `veins`, `scales`, `speckles`, `hatching`, `contour_lines`, `eyespots`, `glyphs`                  | AI generated.           |
| `pattern_distribution` | `all_over`, `core_only`, `edge_only`, `segment_based`, `appendage_only`, `tips_only`, `banded_zones`                                            | AI generated.           |
| `pattern_regularness`  | `orderly`, `mostly_orderly`, `organic`, `chaotic`                                                                                               | AI generated.           |
| `pattern_scale`        | `micro`, `small`, `medium`, `large`                                                                                                             | AI generated.           |
| `texture_type`         | `smooth`, `porous`, `fibrous`, `scaly`, `fleshy`, `dusty`, `reticulated`, `velvety`                                                             | AI generated.           |
| `micro_structure`      | `none`, `pores`, `hairs`, `spinelets`, `beads`, `nodules`, `pits`                                                                               | AI generated.           |
| `palette_type`         | `monochrome_dark`, `monochrome_light`, `duotone_ink`, `complementary`, `analogous`, `neon_bio`, `muted_specimen`, `toxic_warning`, `iridescent` | AI generated.           |
| `color_placement`      | `flat_body`, `core_accent`, `appendage_accent`, `pattern_colored`, `edge_glow`, `center_to_edge_gradient`, `zoned_bands`                        | AI generated.           |
| `background_type`      | `plain`, `paper`, `grid`, `specimen_card`, `dark_void`, `soft_halo`                                                                             | AI generated.           |
| `framing_type`         | `centered_specimen`, `floating`, `diagrammed`, `iconic`, `poster_like`                                                                          | AI generated.           |

---
