Below is a **practical v1 implementation spec** for the most **viable + feasible** structural parameters in **JavaScript + three.js**.

I’m optimizing for:

- simple geometry
- low time complexity
- easy debugging
- visible visual diversity
- no hidden internals
- 2D rendered in a three.js scene

---

# Recommended viable/feasible v1 parameters

These are the best candidates:

1. `body_plan`
2. `silhouette_type`
3. `symmetry_type`
4. `core_shape`
5. `core_edge_type`
6. `appendage_family`
7. `appendage_layout`
8. `appendage_length_type`
9. `appendage_shape`
10. `appendage_motion_impression`
11. `segmentation_type`
12. `branching_type`
13. `membrane_type`
14. `outline_type`
15. `focal_feature`

---

# General rendering strategy

Use a layered 2D approach in three.js:

- Build contours with `THREE.Shape`
- Convert to meshes with `THREE.ShapeGeometry`
- Draw lines with `THREE.Line` / `THREE.LineLoop`
- Group everything in a `THREE.Group`
- Keep all geometry on the XY plane

---

## 1. `body_plan`

### Viable values

- `radial`
- `bilateral`
- `axial`
- `amoeboid`
- `ring`

### Strategy

This should be the **top-level scaffold generator**.  
It decides where major body parts and appendages attach.

### Complexity

- Time: low
- Space: low

```javascript
function generateBodyPlan(type) {
  switch (type) {
    case "radial":
      return { center: new THREE.Vector2(0, 0), anchors: radialAnchors(8, 1.0) };
    case "bilateral":
      return { axis: "y", anchors: mirroredAnchors(4, 1.0) };
    case "axial":
      return { spine: spinePoints(6, 2.0), anchors: spineAnchors(6, 0.6) };
    case "amoeboid":
      return { contour: blobContour(24, 1.2) };
    case "ring":
      return { center: new THREE.Vector2(0, 0), radius: 1.0, anchors: radialAnchors(10, 1.0) };
  }
}
```

---

## 2. `silhouette_type`

### Viable values

- `round`
- `oval`
- `spindle`
- `lobed`
- `stellate`
- `irregular`

### Strategy

Generate a closed 2D contour from polar samples or control points.

### Complexity

- Time: low
- Space: low

```javascript
function makeSilhouette(type, radius = 1, steps = 64) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    let r = radius;

    if (type === "oval") r *= Math.abs(Math.cos(a)) > 0.5 ? 1.2 : 0.8;
    if (type === "spindle") r *= 0.7 + 0.5 * Math.pow(Math.sin(a), 2);
    if (type === "lobed") r *= 1 + 0.18 * Math.sin(4 * a);
    if (type === "stellate") r *= 1 + 0.28 * Math.sin(8 * a);
    if (type === "irregular") r *= 0.85 + Math.random() * 0.3;

    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  return pts;
}
```

---

## 3. `symmetry_type`

### Viable values

- `none`
- `bilateral`
- `radial_4`
- `radial_6`
- `approximate`

### Strategy

Generate one unit, then duplicate it by transform.

### Complexity

- Time: low
- Space: low

```javascript
function applySymmetry(group, type) {
  const out = new THREE.Group();

  if (type === "none") {
    out.add(group);
    return out;
  }

  if (type === "bilateral") {
    out.add(group);
    const mirror = group.clone();
    mirror.scale.x = -1;
    out.add(mirror);
    return out;
  }

  const count = type === "radial_4" ? 4 : 6;
  for (let i = 0; i < count; i++) {
    const copy = group.clone();
    copy.rotation.z = (i / count) * Math.PI * 2;
    out.add(copy);
  }

  if (type === "approximate") {
    group.children.forEach((c) => (c.position.x += (Math.random() - 0.5) * 0.1));
  }

  return out;
}
```

---

## 4. `core_shape`

### Viable values

- `disk`
- `ellipse`
- `ring`
- `blob`
- `capsule`
- `star`

### Strategy

Use `THREE.Shape` for filled forms.

### Complexity

- Time: low
- Space: low

```javascript
function shapeFromContour(points) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i].x, points[i].y);
  shape.closePath();
  return shape;
}

function makeCoreShape(type) {
  if (type === "disk") return shapeFromContour(makeSilhouette("round", 1));
  if (type === "ellipse") return shapeFromContour(makeSilhouette("oval", 1));
  if (type === "blob") return shapeFromContour(makeSilhouette("irregular", 1));
  if (type === "star") return shapeFromContour(makeSilhouette("stellate", 1));
  if (type === "capsule") return capsuleShape(0.6, 1.4);
  if (type === "ring") return ringShape(1.0, 0.5);
}
```

---

## 5. `core_edge_type`

### Viable values

- `smooth`
- `wavy`
- `lobed`
- `spiked`
- `scalloped`

### Strategy

Post-process contour points before turning them into a shape.

### Complexity

- Time: low
- Space: low

```javascript
function deformContour(points, edgeType) {
  return points.map((p, i) => {
    const a = Math.atan2(p.y, p.x);
    let f = 1.0;

    if (edgeType === "wavy") f += 0.08 * Math.sin(6 * a);
    if (edgeType === "lobed") f += 0.16 * Math.sin(4 * a);
    if (edgeType === "spiked") f += 0.22 * Math.max(0, Math.sin(10 * a));
    if (edgeType === "scalloped") f += 0.1 * Math.abs(Math.sin(12 * a));

    return p.clone().multiplyScalar(f);
  });
}
```

---

## 6. `appendage_family`

### Viable values

- `none`
- `tentacles`
- `spines`
- `petals`
- `antennae`

### Strategy

Attach simple repeated geometries to anchor points.

### Complexity

- Time: low to mid
- Space: low

```javascript
function makeAppendage(family, start, dir, length) {
  if (family === "none") return null;

  if (family === "spines") {
    return lineObject([start, start.clone().add(dir.clone().setLength(length))]);
  }

  if (family === "tentacles" || family === "antennae") {
    const pts = curvedAppendagePoints(start, dir, length, 5);
    return lineObject(pts);
  }

  if (family === "petals") {
    return petalMesh(start, dir, length, length * 0.4);
  }
}
```

---

## 7. `appendage_layout`

### Viable values

- `side_paired`
- `all_around`
- `along_spine`
- `tip_only`
- `ring_layer`

### Strategy

Produce anchor positions from the body scaffold.

### Complexity

- Time: low
- Space: low

```javascript
function generateAnchors(layout, scaffold) {
  if (layout === "all_around" || layout === "ring_layer") {
    return radialAnchors(8, 1.1);
  }
  if (layout === "side_paired") {
    return mirroredAnchors(4, 1.0);
  }
  if (layout === "along_spine") {
    return scaffold.spine ? spineAnchorsFromPoints(scaffold.spine) : [];
  }
  if (layout === "tip_only") {
    return scaffold.anchors ? [scaffold.anchors[0]] : [];
  }
  return [];
}
```

---

## 8. `appendage_length_type`

### Viable values

- `stubby`
- `medium`
- `long`

### Strategy

Map category to scalar.

### Complexity

- Time: trivial
- Space: trivial

```javascript
function appendageLength(type) {
  if (type === "stubby") return 0.35;
  if (type === "medium") return 0.7;
  if (type === "long") return 1.2;
  return 0.7;
}
```

---

## 9. `appendage_shape`

### Viable values

- `tapered`
- `rounded`
- `blade`
- `forked`

### Strategy

Affects line profile or petal/leaf shape.

### Complexity

- Time: low
- Space: low

```javascript
function petalMesh(start, dir, length, width) {
  const side = new THREE.Vector2(-dir.y, dir.x).setLength(width);
  const end = start.clone().add(dir.clone().setLength(length));

  const shape = new THREE.Shape();
  shape.moveTo(start.x, start.y);
  shape.quadraticCurveTo(start.x + side.x, start.y + side.y, end.x, end.y);
  shape.quadraticCurveTo(start.x - side.x, start.y - side.y, start.x, start.y);

  return new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
}
```

---

## 10. `appendage_motion_impression`

### Viable values

- `rigid`
- `curved`
- `wavy`
- `drooping`
- `coiling`

### Strategy

Generate centerline points differently.

### Complexity

- Time: low
- Space: low

```javascript
function curvedAppendagePoints(start, dir, length, steps, mode = "curved") {
  const pts = [];
  const normal = new THREE.Vector2(-dir.y, dir.x).normalize();

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = start.clone().add(dir.clone().setLength(length * t));

    if (mode === "curved") p.add(normal.clone().multiplyScalar(0.15 * Math.sin(Math.PI * t)));
    if (mode === "wavy") p.add(normal.clone().multiplyScalar(0.1 * Math.sin(6 * t)));
    if (mode === "drooping") p.y -= 0.2 * t * t;
    if (mode === "coiling") {
      p.add(normal.clone().multiplyScalar(0.15 * Math.sin(8 * t)));
      p.add(dir.clone().multiplyScalar(0.05 * Math.cos(8 * t)));
    }

    pts.push(p);
  }
  return pts;
}
```

---

## 11. `segmentation_type`

### Viable values

- `none`
- `beaded`
- `stacked_disks`
- `vertebrae`

### Strategy

Repeat simple visible shapes along a path.

### Complexity

- Time: low
- Space: low

```javascript
function makeSegments(type, count = 5) {
  const group = new THREE.Group();
  if (type === "none") return group;

  for (let i = 0; i < count; i++) {
    const y = -1 + i * 0.4;
    const r = type === "vertebrae" ? 0.3 - i * 0.02 : 0.22;
    const shape = shapeFromContour(makeSilhouette("round", r, 24));
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    mesh.position.y = y;
    group.add(mesh);
  }
  return group;
}
```

---

## 12. `branching_type`

### Viable values

- `none`
- `coral`
- `vascular`
- `lightning`

### Strategy

Simple recursive line branching is feasible.  
Keep recursion shallow.

### Complexity

- Time: mid
- Space: low to mid

```javascript
function branch(group, start, dir, length, depth, style = "coral") {
  if (depth <= 0) return;

  const end = start.clone().add(dir.clone().setLength(length));
  group.add(lineObject([start, end]));

  const angles = style === "lightning" ? [-0.9, 0.6] : [-0.5, 0.5];
  for (const a of angles) {
    const nd = dir.clone().rotateAround(new THREE.Vector2(0, 0), a);
    branch(group, end, nd, length * 0.72, depth - 1, style);
  }
}
```

---

## 13. `membrane_type`

### Viable values

- `none`
- `webbed`
- `winglike`
- `gelatinous_fill`

### Strategy

Only implement membranes between visible anchors.  
Avoid complex boolean operations.

### Complexity

- Time: mid
- Space: low

```javascript
function webbedMembrane(a, b, c) {
  const shape = new THREE.Shape();
  shape.moveTo(a.x, a.y);
  shape.quadraticCurveTo(b.x, b.y, c.x, c.y);
  shape.lineTo(a.x, a.y);

  return new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    })
  );
}
```

---

## 14. `outline_type`

### Viable values

- `clean`
- `wobbly`
- `spiky`
- `scalloped`
- `double_edge`

### Strategy

Draw visible contour lines around the final shape.

### Complexity

- Time: low
- Space: low

```javascript
function outlineFromPoints(points, color = 0x000000) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(p.x, p.y, 0.01)));
  return new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({ color }));
}
```

For `double_edge`, draw a second scaled contour slightly outward.

```javascript
function scaleContour(points, s) {
  return points.map((p) => p.clone().multiplyScalar(s));
}
```

---

## 15. `focal_feature`

### Viable values

- `none`
- `eye`
- `orb`
- `spiral`
- `sigil`

### Strategy

Add one simple high-identity motif.

### Complexity

- Time: low
- Space: low

```javascript
function makeFocalFeature(type) {
  const group = new THREE.Group();
  if (type === "none") return group;

  if (type === "orb" || type === "eye") {
    const outer = new THREE.Mesh(new THREE.CircleGeometry(0.18, 32), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    group.add(outer);

    if (type === "eye") {
      const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.06, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
      pupil.position.z = 0.01;
      group.add(pupil);
    }
  }

  if (type === "spiral") {
    const pts = [];
    for (let i = 0; i < 60; i++) {
      const t = (i / 60) * 4 * Math.PI;
      const r = 0.02 + i * 0.003;
      pts.push(new THREE.Vector3(Math.cos(t) * r, Math.sin(t) * r, 0.01));
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x000000 })));
  }

  return group;
}
```

---

# Minimal helper functions

These are useful for nearly all viable parameters.

```javascript
function radialAnchors(count, radius) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    pts.push(new THREE.Vector2(Math.cos(a) * radius, Math.sin(a) * radius));
  }
  return pts;
}

function mirroredAnchors(count, offset) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const y = -0.8 + i * (1.6 / Math.max(1, count - 1));
    pts.push(new THREE.Vector2(offset, y));
    pts.push(new THREE.Vector2(-offset, y));
  }
  return pts;
}

function spinePoints(count, length) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    pts.push(new THREE.Vector2(0, -length / 2 + t * length));
  }
  return pts;
}

function lineObject(points) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(p.x, p.y, 0)));
  return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffffff }));
}
```

---

# Recommended v1 build order

Implement in this order:

### Phase 1 — easiest, highest payoff

- `body_plan`
- `silhouette_type`
- `core_shape`
- `symmetry_type`
- `outline_type`

### Phase 2 — add visible richness

- `appendage_family`
- `appendage_layout`
- `appendage_length_type`
- `appendage_motion_impression`
- `focal_feature`

### Phase 3 — more complex structure

- `segmentation_type`
- `branching_type`
- `membrane_type`

---

# Best v1 parameter subset

If you want the most realistic scope for a first build, I’d recommend only these:

- `body_plan`
- `silhouette_type`
- `symmetry_type`
- `core_shape`
- `core_edge_type`
- `appendage_family`
- `appendage_layout`
- `appendage_motion_impression`
- `segmentation_type`
- `branching_type`
- `outline_type`
- `focal_feature`

That’s enough for strong diversity while staying feasible in JS/three.js.

If you want, I can next write:

1. a **full scene graph spec** for how these pieces compose, or
2. a **single canonical `generateOrganism(config)` design** showing how all these parameters fit together.
