function renderSphereMap(map, worldGroup, options = {}) {
  const { radius = 1.003 } = options;
  const cellMeshes = [];

  function latLonToVec3(lat, lon, r) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    return new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta),
    );
  }

  function parseRGBString(str) {
    const match = str.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!match) return new THREE.Color(0x888888);
    return new THREE.Color(
      parseInt(match[1]) / 255,
      parseInt(match[2]) / 255,
      parseInt(match[3]) / 255,
    );
  }

  function createCellMesh(ring, color, regionIndex) {
    if (!ring || ring.length < 3) return null;

    const points3D = ring.map(([lon, lat]) => latLonToVec3(lat, lon, radius));

    const center = new THREE.Vector3(0, 0, 0);
    points3D.forEach((p) => center.add(p));
    center.divideScalar(points3D.length);
    center.normalize().multiplyScalar(radius);

    const verts = [];
    const indices = [];

    verts.push(center.x, center.y, center.z);

    for (let i = 0; i < points3D.length; i++) {
      verts.push(points3D[i].x, points3D[i].y, points3D[i].z);
      if (i > 0) {
        indices.push(0, i, i + 1);
      }
    }
    if (points3D.length > 1) {
      indices.push(0, points3D.length, 1);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(verts, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshBasicMaterial({
      color: color,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { regionIndex };
    return mesh;
  }

  function createCoastlines(map) {
    const material = new THREE.LineBasicMaterial({
      color: 0x000000,
      linewidth: 1,
    });

    const { adjacency, elevation, points } = map;

    for (let r = 0; r < map.numRegions; r++) {
      if (elevation[r] < SPHERE_CONFIG.OCEAN_THRESHOLD) continue;
      if (!adjacency[r]) continue;

      for (const neighbor of adjacency[r]) {
        if (elevation[neighbor] >= SPHERE_CONFIG.OCEAN_THRESHOLD) continue;

        const polyR = map.polygons[r];
        const polyN = map.polygons[neighbor];
        if (!polyR || !polyN) continue;

        const ringR = polyR.geometry.coordinates[0];
        const ringN = polyN.geometry.coordinates[0];

        const shared = [];
        for (const vr of ringR) {
          for (const vn of ringN) {
            if (
              Math.abs(vr[0] - vn[0]) < 0.01 &&
              Math.abs(vr[1] - vn[1]) < 0.01
            ) {
              shared.push(vr);
              break;
            }
          }
        }

        if (shared.length >= 2) {
          const p1 = latLonToVec3(shared[0][1], shared[0][0], radius + 0.001);
          const p2 = latLonToVec3(shared[1][1], shared[1][0], radius + 0.001);
          const geom = new THREE.BufferGeometry().setFromPoints([p1, p2]);
          const line = new THREE.Line(geom, material);
          worldGroup.add(line);
        }
      }
    }
  }

  for (let r = 0; r < map.numRegions; r++) {
    const polygon = map.polygons[r];
    if (!polygon) continue;

    const ring = polygon.geometry.coordinates[0];
    if (!ring || ring.length < 3) continue;

    const colorStr = sphereBiomeColor(map, r);
    const color = parseRGBString(colorStr);
    const mesh = createCellMesh(ring, color, r);

    if (mesh) {
      worldGroup.add(mesh);
      cellMeshes.push(mesh);
    }
  }

  createCoastlines(map);

  cellMeshes.forEach((m) => worldGroup.remove(m));

  const geometries = cellMeshes.map((m) => {
    const g = m.geometry.clone();
    const color = m.material.color;
    const count = g.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  });

  const merged = THREE.BufferGeometryUtils.mergeBufferGeometries(geometries);
  const mergedMesh = new THREE.Mesh(
    merged,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
    }),
  );
  worldGroup.add(mergedMesh);

  return [mergedMesh];
}
