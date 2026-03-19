function projectMapOntoGlobe(map, worldGroup, options = {}) {
  const { radius = 1.003, oceanThreshold = 0.33 } = options;

  const cellMeshes = [];

  function mapToLatLon(x, y) {
    const lon = (x / map.gridW) * 360 - 180;
    const lat = 90 - (y / map.gridH) * 180;
    return { lat, lon };
  }

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

  function getCellVertices(map) {
    const cells = new Array(map.numRegions).fill(null);
    const seen = new Set();
    const { triangles, numEdges, centers, halfedges } = map;

    for (let e = 0; e < numEdges; e++) {
      const r = triangles[nextHalfedge(e)];
      if (!seen.has(r)) {
        seen.add(r);
        const verts = edgesAroundPoint(halfedges, e).map(
          (edge) => centers[triangleOfEdge(edge)],
        );
        cells[r] = verts;
      }
    }
    return cells;
  }

  function triangleOfEdge(e) {
    return Math.floor(e / 3);
  }

  function nextHalfedge(e) {
    return e % 3 === 2 ? e - 2 : e + 1;
  }

  function edgesAroundPoint(halfedges, start) {
    const result = [];
    let incoming = start;
    do {
      result.push(incoming);
      const outgoing = nextHalfedge(incoming);
      incoming = halfedges[outgoing];
    } while (incoming !== -1 && incoming !== start);
    return result;
  }

  function createCellMesh(vertices2D, color, regionIndex) {
    if (!vertices2D || vertices2D.length < 3) return null;

    const points3D = vertices2D.map((v) => {
      const { lat, lon } = mapToLatLon(v.x, v.y);
      return latLonToVec3(lat, lon, radius);
    });

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

  function createCoastlines(cells, map) {
    const material = new THREE.LineBasicMaterial({
      color: 0x000000,
      linewidth: 1,
    });

    const { adjacency, elevation } = map;

    for (let r = 0; r < map.numRegions; r++) {
      if (elevation[r] < oceanThreshold) continue;
      if (!adjacency[r]) continue;

      for (let neighbor of adjacency[r]) {
        if (elevation[neighbor] >= oceanThreshold) continue;

        const key = r < neighbor ? `${r}-${neighbor}` : `${neighbor}-${r}`;
        const edge = map.regionEdges.get(key);
        if (!edge) continue;

        const { lat: lat1, lon: lon1 } = mapToLatLon(edge.p.x, edge.p.y);
        const { lat: lat2, lon: lon2 } = mapToLatLon(edge.q.x, edge.q.y);

        const p1 = latLonToVec3(lat1, lon1, radius + 0.001);
        const p2 = latLonToVec3(lat2, lon2, radius + 0.001);

        const geom = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        const line = new THREE.Line(geom, material);
        worldGroup.add(line);
      }
    }
  }

  function createRivers(map) {
    const material = new THREE.LineBasicMaterial({
      color: 0x30407f,
      linewidth: 1,
    });

    const { points, flow, downslope, elevation, regionEdges, lakes } = map;
    const threshold = map.riverThreshold;

    const upstream = Array.from({ length: points.length }, () => []);
    for (let r = 0; r < points.length; r++) {
      if (downslope[r] !== null && elevation[r] >= oceanThreshold) {
        upstream[downslope[r]].push(r);
      }
    }

    const sources = [];
    for (let r = 0; r < points.length; r++) {
      if (elevation[r] < oceanThreshold) continue;
      if (flow[r] < threshold) continue;
      const hasUpstreamRiver = upstream[r].some((u) => flow[u] >= threshold);
      if (!hasUpstreamRiver) sources.push(r);
    }

    for (const source of sources) {
      const pathPoints = [];
      let current = source;

      while (current !== null && elevation[current] >= oceanThreshold) {
        if (flow[current] < threshold && pathPoints.length > 0) break;

        const next = downslope[current];
        if (next === null) break;

        const key =
          current < next ? `${current}-${next}` : `${next}-${current}`;
        const edge = regionEdges.get(key);

        if (edge) {
          const mx = (edge.p.x + edge.q.x) / 2;
          const my = (edge.p.y + edge.q.y) / 2;
          const { lat, lon } = mapToLatLon(mx, my);
          pathPoints.push(latLonToVec3(lat, lon, radius + 0.001));
        } else {
          break;
        }

        if (elevation[next] < oceanThreshold || lakes.has(next)) break;
        current = next;
      }

      if (pathPoints.length >= 2) {
        const geom = new THREE.BufferGeometry().setFromPoints(pathPoints);
        const line = new THREE.Line(geom, material);
        worldGroup.add(line);
      }
    }
  }

  function createLakes(cells, map) {
    const { lakes, elevation } = map;
    const lakeColor = new THREE.Color(60 / 255, 80 / 255, 140 / 255);

    for (const r of lakes) {
      if (!cells[r] || cells[r].length < 3) continue;
      const mesh = createCellMesh(cells[r], lakeColor, r);
      if (mesh) {
        mesh.renderOrder = 1;
        worldGroup.add(mesh);
      }
    }
  }

  const cells = getCellVertices(map);

  for (let r = 0; r < map.numRegions; r++) {
    if (!cells[r] || cells[r].length < 3) continue;

    if (map.points[r].isBorder) continue;

    const colorStr = biomeColor(map, r);
    const color = parseRGBString(colorStr);
    const mesh = createCellMesh(cells[r], color, r);

    if (mesh) {
      worldGroup.add(mesh);
      cellMeshes.push(mesh);
    }
  }

  createCoastlines(cells, map);
  createRivers(map);
  createLakes(cells, map);

  return cellMeshes;
}
