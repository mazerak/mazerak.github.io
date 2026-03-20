// SPHERE MAP RENDERER
// takes the generated map data from generateSphereMap() in sphere-mapgen.js and creates a Three.js geometry to display it
// uses delaunay triangulation for smooth terrain
// each triangle created connects three region centers, wth elevation and color interpolated across the triangle
function renderSphereMap(map, worldGroup, options = {}) {
  // base radius of the sphere surface, as well as how exaggerated the height features are (mountains and ocean valleys mainly)
  const { radius = 1.003, heightScale = 0.15 } = options;

  // coordinate conversion
  // converts lan/lon to a 3d point on a sphere of radius r
  function latLonToVec3(lat, lon, r) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    return new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta),
    );
  }

  // color parser
  // converts "rgb{r, g, b)" string to a plan {r, g, b} object with values ranging from 0-1 for Three.js
  function parseRGBString(str) {
    const match = str.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!match) return { r: 0.5, g: 0.5, b: 0.5 };
    return {
      r: parseInt(match[1]) / 255,
      g: parseInt(match[2]) / 255,
      b: parseInt(match[3]) / 255,
    };
  }

  // elevation to radius
  // maps a region's elevation value to a distance from the sphere's center
  // regions at the ocean threshold sit at the base radius
  function elevToRadius(e) {
    if (e < SPHERE_CONFIG.OCEAN_THRESHOLD) {
      return radius + (e - SPHERE_CONFIG.OCEAN_THRESHOLD) * heightScale * 0.3;
    } else {
      const landE =
        (e - SPHERE_CONFIG.OCEAN_THRESHOLD) /
        (1 - SPHERE_CONFIG.OCEAN_THRESHOLD);
      const curved = 0.1 * landE + 0.85 * landE * landE;
      return radius + curved * heightScale;
    }
  }

  /*
  function elevToRadius(e) {
    return radius + (e - SPHERE_CONFIG.OCEAN_THRESHOLD) * heightScale;
  }
  */

  const { points, elevation } = map;

  // calculate the biome color and 3d position for every region
  const regionColors = [];
  const regionPositions = [];
  for (let r = 0; r < map.numRegions; r++) {
    // get the color from the biome function, which returns a color based on elevation and moisture
    regionColors[r] = parseRGBString(sphereBiomeColor(map, r));
    // get the 3d position at this region's elevation adjusted height
    const h = elevToRadius(elevation[r]);
    regionPositions[r] = latLonToVec3(points[r].lat, points[r].lon, h);
  }

  // create delaunay triangles
  const geoPoints = points.map((p) => [p.lon, p.lat]);
  const voronoi = d3.geoVoronoi(geoPoints);
  const delTriangles = voronoi.delaunay.triangles;

  // build gpu arrays
  // 3 vertices per triangle, 3 float components per vertex (position or color)
  const vertCount = delTriangles.length * 3;
  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);

  for (let i = 0; i < delTriangles.length; i++) {
    const [a, b, c] = delTriangles[i];
    const pA = regionPositions[a];
    const pB = regionPositions[b];
    const pC = regionPositions[c];

    // webgl interpolates between the three vertex colors
    cA = regionColors[a];
    cB = regionColors[b];
    cC = regionColors[c];

    // write position and color data into flat arrays
    const base = i * 9;

    // vertex a position
    positions[base] = pA.x;
    positions[base + 1] = pA.y;
    positions[base + 2] = pA.z;
    // vertex b position
    positions[base + 3] = pB.x;
    positions[base + 4] = pB.y;
    positions[base + 5] = pB.z;
    // vertex c position
    positions[base + 6] = pC.x;
    positions[base + 7] = pC.y;
    positions[base + 8] = pC.z;

    // vertex a color
    colors[base] = cA.r;
    colors[base + 1] = cA.g;
    colors[base + 2] = cA.b;
    // vertex b color
    colors[base + 3] = cB.r;
    colors[base + 4] = cB.g;
    colors[base + 5] = cB.b;
    // vertex c color
    colors[base + 6] = cC.r;
    colors[base + 7] = cC.g;
    colors[base + 8] = cC.b;
  }

  // create geometry
  // using a buffer geometry for optimization purposes
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  // compute normals so lighting knows which direction each face points
  geometry.computeVertexNormals();

  // using MeshPhongMaterial since it reacts to directional light
  // if u just want the wireframe comment out vertexColors and uncomment the three things beneath it
  const material = new THREE.MeshPhongMaterial({
    vertexColors: true,
    //color: 0xffffff,
    //transparent: true,
    //opacity: 0.05,
    side: THREE.DoubleSide,
    shininess: 1,
  });

  // create the mesh (geometry + material) and add it to worldGroup
  const mesh = new THREE.Mesh(geometry, material);
  worldGroup.add(mesh);

  // uncomment this if u want the wireframe
  //const wireGeo = new THREE.WireframeGeometry(geometry);
  //const wireMat = new THREE.LineBasicMaterial({ color: 0x000000 });
  //const wireframe = new THREE.LineSegments(wireGeo, wireMat);
  //worldGroup.add(wireframe);

  // render rivers and lakes on top of the terrain
  const AllMeshes = [mesh];
  const riverMesh = renderRivers(map, worldGroup, latLonToVec3, elevToRadius);
  if (riverMesh) AllMeshes.push(riverMesh);
  const lakeMesh = renderLakes(map, worldGroup, radius, regionPositions);
  if (lakeMesh) AllMeshes.push(lakeMesh);

  // return the meshes
  return AllMeshes;
}

// RIVER RENDERER
function renderRivers(map, worldGroup, latLonToVec3, elevToRadius) {
  const { points, flow, downslope, elevation, lakes } = map;
  const threshold = map.riverThreshold;

  // build upstream map: for each region, which regions flow into it
  // used to find river sources (regions with high flow but no upstream rivers)
  const upstream = Array.from({ length: points.length }, () => []);
  for (let r = 0; r < points.length; r++) {
    if (
      downslope[r] !== null &&
      elevation[r] >= SPHERE_CONFIG.OCEAN_THRESHOLD
    ) {
      upstream[downslope[r]].push(r);
    }
  }

  // find river sources: regions with enough flow to be a river,
  // but no upstream neighbor that also qualifies as a river
  // this is where rivers start to begin
  const sources = [];
  for (let r = 0; r < points.length; r++) {
    if (elevation[r] < SPHERE_CONFIG.OCEAN_THRESHOLD) continue;
    if (flow[r] < threshold) continue;
    const hasUpstreamRiver = upstream[r].some((u) => flow[u] >= threshold);
    if (!hasUpstreamRiver) {
      sources.push(r);
    }
  }

  // smooth a path using catmull-rom spline interpolation
  // inserts extra points between each pair for a curved appearance
  function smoothPath(path, flows, subdivisions = 4) {
    if (path.length < 2) return { path, flows };

    const smoothed = [];
    const smoothedFlows = [];

    for (let i = 0; i < path.length - 1; i++) {
      // 4 control points, clamped at endpoints
      const p0 = path[Math.max(0, i - 1)];
      const p1 = path[i];
      const p2 = path[i + 1];
      const p3 = path[Math.min(path.length - 1, i + 2)];
      const f1 = flows[i];
      const f2 = flows[Math.min(flows.length - 1, i + 1)];

      for (let s = 0; s < subdivisions; s++) {
        const t = s / subdivisions;
        const tt = t * t;
        const ttt = tt * t;

        // catmull-rom interpolation for each axis
        const x =
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * tt +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * ttt);
        const y =
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * tt +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * ttt);
        const z =
          0.5 *
          (2 * p1.z +
            (-p0.z + p2.z) * t +
            (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * tt +
            (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * ttt);

        const v = new THREE.Vector3(x, y, z);
        // preserve the radius (height) by keeping the vector length
        v.normalize().multiplyScalar(new THREE.Vector3(x, y, z).length());
        smoothed.push(v);
        smoothedFlows.push(f1 + (f2 - f1) * t);
      }
    }

    // add final point
    smoothed.push(path[path.length - 1]);
    smoothedFlows.push(flows[flows.length - 1]);

    return { path: smoothed, flows: smoothedFlows };
  }

  // build all rivers as continuous triangle strips along smoothed paths
  const verts = [];
  const riverColors = [];
  const riverColor = { r: 48 / 255, g: 64 / 255, b: 127 / 255 };

  for (const source of sources) {
    const rawPath = [];
    const rawFlows = [];
    let current = source;

    while (
      current !== null &&
      elevation[current] >= SPHERE_CONFIG.OCEAN_THRESHOLD
    ) {
      if (flow[current] < threshold && rawPath.length > 0) break;

      const { lat, lon } = points[current];
      const elev = elevation[current];
      const r = elevToRadius(elev) + 0.003;
      rawPath.push(latLonToVec3(lat, lon, r));
      rawFlows.push(flow[current]);

      const next = downslope[current];
      if (next === null) break;

      if (elevation[next] < SPHERE_CONFIG.OCEAN_THRESHOLD || lakes.has(next)) {
        const { lat: nlat, lon: nlon } = points[next];
        const nelev = elevation[next];
        const nr = elevToRadius(nelev) + 0.003;
        rawPath.push(latLonToVec3(nlat, nlon, nr));
        rawFlows.push(flow[next]);

        const next2 = downslope[next];
        if (next2 !== null) {
          const { lat: n2lat, lon: n2lon } = points[next2];
          const n2elev = elevation[next2];
          const n2r = elevToRadius(n2elev) + 0.003;
          rawPath.push(latLonToVec3(n2lat, n2lon, n2r));
          rawFlows.push(flow[next2]);
        }

        break;
      }

      current = next;
    }

    // smooth the path
    const { path, flows: sFlows } = smoothPath(rawPath, rawFlows);
    if (path.length < 2) continue;

    // build left/right edge points along the spline
    const lefts = [];
    const rights = [];

    for (let i = 0; i < path.length; i++) {
      // direction: average of previous and next segment directions
      let dir;
      if (i === 0) {
        dir = new THREE.Vector3().subVectors(path[1], path[0]).normalize();
      } else if (i === path.length - 1) {
        dir = new THREE.Vector3().subVectors(path[i], path[i - 1]).normalize();
      } else {
        dir = new THREE.Vector3()
          .subVectors(path[i + 1], path[i - 1])
          .normalize();
      }

      const normal = path[i].clone().normalize();
      const side = new THREE.Vector3().crossVectors(dir, normal).normalize();

      // width grows with flow
      const w = 0.0005 + 0.001 * Math.min(Math.sqrt(sFlows[i] / threshold), 3);

      lefts.push(path[i].clone().add(side.clone().multiplyScalar(w)));
      rights.push(path[i].clone().add(side.clone().multiplyScalar(-w)));
    }

    // build triangle strip: two triangles per segment
    for (let i = 0; i < path.length - 1; i++) {
      const l1 = lefts[i],
        r1 = rights[i];
      const l2 = lefts[i + 1],
        r2 = rights[i + 1];

      verts.push(l1.x, l1.y, l1.z, r1.x, r1.y, r1.z, l2.x, l2.y, l2.z);
      verts.push(r1.x, r1.y, r1.z, r2.x, r2.y, r2.z, l2.x, l2.y, l2.z);

      for (let j = 0; j < 6; j++) {
        riverColors.push(riverColor.r, riverColor.g, riverColor.b);
      }
    }
  }

  if (verts.length === 0) return null;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(verts), 3),
  );
  geom.setAttribute(
    "color",
    new THREE.BufferAttribute(new Float32Array(riverColors), 3),
  );
  geom.computeVertexNormals();

  const mat = new THREE.MeshPhongMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    shininess: 1,
  });

  const riverMesh = new THREE.Mesh(geom, mat);
  worldGroup.add(riverMesh);
  return riverMesh;
}

// LAKE RENDERER
function renderLakes(map, worldGroup, radius, regionPositions) {
  const { lakes, points } = map;
  if (!lakes || lakes.size === 0) return null;

  // for each lake region, find the Delaunay triangles that include it
  // and color those triangles with the lake color
  const geoPoints = points.map((p) => [p.lon, p.lat]);
  const voronoi = d3.geoVoronoi(geoPoints);
  const delTriangles = voronoi.delaunay.triangles;

  const lakeColor = { r: 60 / 255, g: 80 / 255, b: 140 / 255 };
  const verts = [];
  const colors = [];

  for (let i = 0; i < delTriangles.length; i++) {
    const [a, b, c] = delTriangles[i];
    // only draw triangles where all 3 vertices are lake regions
    if (!lakes.has(a) || !lakes.has(b) || !lakes.has(c)) continue;

    // position lake surface slightly above terrain to avoid z-fighting
    const offset = 0.003;
    const pA = regionPositions[a]
      .clone()
      .normalize()
      .multiplyScalar(regionPositions[a].length() + offset);
    const pB = regionPositions[b]
      .clone()
      .normalize()
      .multiplyScalar(regionPositions[b].length() + offset);
    const pC = regionPositions[c]
      .clone()
      .normalize()
      .multiplyScalar(regionPositions[c].length() + offset);

    verts.push(pA.x, pA.y, pA.z, pB.x, pB.y, pB.z, pC.x, pC.y, pC.z);
    colors.push(
      lakeColor.r,
      lakeColor.g,
      lakeColor.b,
      lakeColor.r,
      lakeColor.g,
      lakeColor.b,
      lakeColor.r,
      lakeColor.g,
      lakeColor.b,
    );
  }

  if (verts.length === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(verts), 3),
  );
  geometry.setAttribute(
    "color",
    new THREE.BufferAttribute(new Float32Array(colors), 3),
  );
  geometry.computeVertexNormals();

  const material = new THREE.MeshPhongMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    shininess: 1,
  });

  const mesh = new THREE.Mesh(geometry, material);
  worldGroup.add(mesh);
  return mesh;
}
