| Name                          | Values                                                                                                                                          | Implementation strategy                                                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `body_plan`                   | `radial`, `bilateral`, `axial`, `segmented`, `amoeboid`, `starburst`, `ring`, `branching`                                                       | Generate a 2D scaffold: center+rays, half+mirror, spine curve, repeated modules on path, blob contour, ray burst, annulus contour, or recursive branch graph. |
| `silhouette_type`             | `round`, `oval`, `spindle`, `lobed`, `stellate`, `shield`, `filamentous`, `irregular`                                                           | Choose base outer contour primitive and deform it to match the silhouette archetype.                                                                          |
| `symmetry_type`               | `none`, `bilateral`, `radial_4`, `radial_6`, `radial_8`, `approximate`                                                                          | Generate one unit, then mirror/rotate-copy it; for `approximate`, add slight variation after duplication.                                                     |
| `density_type`                | `sparse`, `balanced`, `dense`, `overgrown`                                                                                                      | Control how many visible structural elements are instantiated and how tightly they occupy space.                                                              |
| `complexity_tier`             | `minimal`, `simple`, `ornate`, `maximal`                                                                                                        | Activate more or fewer geometry subsystems and repetitions.                                                                                                   |
| `core_presence`               | `none`, `small_core`, `dominant_core`, `hollow_core`                                                                                            | Add, scale, or omit the main visible body mass; `hollow_core` uses an outer contour with a visible center void only if exposed.                               |
| `core_shape`                  | `disk`, `ellipse`, `ring`, `blob`, `capsule`, `polygon`, `star`, `shield`                                                                       | Create the main visible body contour from the chosen primitive.                                                                                               |
| `core_edge_type`              | `smooth`, `wavy`, `lobed`, `spiked`, `frilled`, `scalloped`                                                                                     | Apply contour modulation to the outer edge of the visible body.                                                                                               |
| `skeleton_type`               | `none`, `central_spine`, `paired_ribs`, `radial_spokes`, `node_chain`, `branch_network`                                                         | Build a visible external structure or use it as anchors for visible outer forms only. No hidden internals.                                                    |
| `segmentation_type`           | `none`, `beaded`, `insectoid`, `vertebrae`, `stacked_disks`, `shell_plates`                                                                     | Repeat visible body modules along an axis/path to form the exterior silhouette.                                                                               |
| `segment_profile`             | `round`, `oval`, `angular`, `spiky`, `flattened`, `bulbous`                                                                                     | Define the visible shape of each repeated segment module.                                                                                                     |
| `appendage_family`            | `none`, `tentacles`, `fins`, `legs`, `antennae`, `petals`, `spines`, `fronds`, `cilia_halo`                                                     | Generate appendages from anchor points using family-specific shape rules.                                                                                     |
| `appendage_layout`            | `side_paired`, `all_around`, `top_cluster`, `bottom_cluster`, `along_spine`, `tip_only`, `ring_layer`                                           | Place appendage anchors on the visible outline or scaffold according to layout rule.                                                                          |
| `appendage_length_type`       | `stubby`, `medium`, `long`, `trailing`                                                                                                          | Use discrete length presets when constructing appendage geometry.                                                                                             |
| `appendage_shape`             | `tapered`, `rounded`, `blade`, `thread`, `bulbed`, `forked`, `feathered`, `hooked`                                                              | Choose the appendage contour template and terminal form.                                                                                                      |
| `appendage_motion_impression` | `rigid`, `curved`, `wavy`, `splayed`, `drooping`, `coiling`                                                                                     | Shape appendage centerlines with straight, arc, sine, spread, downward-bias, or spiral rules.                                                                 |
| `branching_type`              | `none`, `coral`, `vascular`, `fungal`, `lightning`, `rootlike`                                                                                  | Use a recursive visible branch generator with style-specific angle and taper rules.                                                                           |
| `branching_density`           | `light`, `moderate`, `dense`                                                                                                                    | Limit recursion depth and child count in the visible branch system.                                                                                           |
| `termination_type`            | `pointed`, `rounded`, `split`, `budded`, `frayed`, `eyelike`                                                                                    | Apply visible end-cap geometry to appendages and branches.                                                                                                    |
| `membrane_type`               | `none`, `webbed`, `winglike`, `saclike`, `veil`, `gelatinous_fill`                                                                              | Generate visible surfaces between appendages or around outer supports; only draw exposed membranes.                                                           |
| `membrane_edge`               | `clean`, `ruffled`, `torn`, `lacey`, `dripping`                                                                                                 | Modify only the exposed membrane boundary.                                                                                                                    |
| `outline_type`                | `clean`, `wobbly`, `hairy`, `spiky`, `frayed`, `scalloped`, `double_edge`                                                                       | Post-process the final visible outer contour.                                                                                                                 |
| `perimeter_activity`          | `quiet`, `articulated`, `busy`, `explosive`                                                                                                     | Control frequency and intensity of edge events like protrusions, splits, and fringe.                                                                          |
| `focal_feature`               | `none`, `eye`, `mouth`, `orb`, `flower_center`, `sigil`, `vent`, `spiral`                                                                       | Add one prominent visible motif on the exterior surface/silhouette; detailing can be AI generated.                                                            |
| `focal_position`              | `center`, `top`, `bottom`, `offset_left`, `offset_right`                                                                                        | Place the focal motif at a visible anchor region on the organism.                                                                                             |
| `aesthetic_mode`              | `scientific_plate`, `ornamental`, `psychedelic`, `heraldic`, `diagrammatic`, `grotesque`, `minimalist`, `sacred_symbol`                         | AI generated.                                                                                                                                                 |
| `biomorphic_style`            | `cellular`, `floral`, `insectoid`, `marine`, `fungal`, `skeletal`, `embryonic`, `glyphic`                                                       | Bias the structural generator toward matching shape vocabularies for each style.                                                                              |
| `temperament_read`            | `gentle`, `elegant`, `alien`, `ominous`, `toxic`, `regal`, `fragile`, `monstrous`                                                               | AI generated.                                                                                                                                                 |
| `surface_pattern`             | `none`, `stripes`, `spots`, `rings`, `cells`, `veins`, `scales`, `speckles`, `hatching`, `contour_lines`, `eyespots`, `glyphs`                  | AI generated.                                                                                                                                                 |
| `pattern_distribution`        | `all_over`, `core_only`, `edge_only`, `segment_based`, `appendage_only`, `tips_only`, `banded_zones`                                            | AI generated.                                                                                                                                                 |
| `pattern_regularness`         | `orderly`, `mostly_orderly`, `organic`, `chaotic`                                                                                               | AI generated.                                                                                                                                                 |
| `pattern_scale`               | `micro`, `small`, `medium`, `large`                                                                                                             | AI generated.                                                                                                                                                 |
| `texture_type`                | `smooth`, `porous`, `fibrous`, `scaly`, `fleshy`, `dusty`, `reticulated`, `velvety`                                                             | AI generated.                                                                                                                                                 |
| `micro_structure`             | `none`, `pores`, `hairs`, `spinelets`, `beads`, `nodules`, `pits`                                                                               | AI generated.                                                                                                                                                 |
| `palette_type`                | `monochrome_dark`, `monochrome_light`, `duotone_ink`, `complementary`, `analogous`, `neon_bio`, `muted_specimen`, `toxic_warning`, `iridescent` | AI generated.                                                                                                                                                 |
| `color_placement`             | `flat_body`, `core_accent`, `appendage_accent`, `pattern_colored`, `edge_glow`, `center_to_edge_gradient`, `zoned_bands`                        | AI generated.                                                                                                                                                 |
| `background_type`             | `plain`, `paper`, `grid`, `specimen_card`, `dark_void`, `soft_halo`                                                                             | AI generated.                                                                                                                                                 |
| `framing_type`                | `centered_specimen`, `floating`, `diagrammed`, `iconic`, `poster_like`                                                                          | AI generated.                                                                                                                                                 |

## Recommended final split

### Code-generated structural parameters

- `body_plan`
- `silhouette_type`
- `symmetry_type`
- `density_type`
- `complexity_tier`
- `core_presence`
- `core_shape`
- `core_edge_type`
- `skeleton_type`
- `segmentation_type`
- `segment_profile`
- `appendage_family`
- `appendage_layout`
- `appendage_length_type`
- `appendage_shape`
- `appendage_motion_impression`
- `branching_type`
- `branching_density`
- `termination_type`
- `membrane_type`
- `membrane_edge`
- `outline_type`
- `perimeter_activity`
- `focal_feature`
- `focal_position`
- `biomorphic_style`

### AI-rendered appearance parameters

- `aesthetic_mode`
- `temperament_read`
- `surface_pattern`
- `pattern_distribution`
- `pattern_regularness`
- `pattern_scale`
- `texture_type`
- `micro_structure`
- `palette_type`
- `color_placement`
- `background_type`
- `framing_type`

If you want, I can next reduce this to the **best 12–15 parameters for v1 UI**.
