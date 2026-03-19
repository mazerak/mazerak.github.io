function renderSphereMap(map, worldGroup, options = {}) {
  const { radius = 1.003, heightScale = 0.15 } = options;

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
    if (!match) return { r: 0.5, g: 0.5, b: 0.5 };
    return {
      r: parseInt(match[1]) / 255,
      g: parseInt(match[2]) / 255,
      b: parseInt(match[3]) / 255,
    };
  }

  function elevToRadius(e) {
    return radius + (e - SPHERE_CONFIG.OCEAN_THRESHOLD) * heightScale;
  }

  const { points, elevation } = map;

  const regionColors = [];
  const regionPositions = [];
  for (let r = 0; r < map.numRegions; r++) {
    regionColors[r] = parseRGBString(sphereBiomeColor(map, r));
    const h = elevToRadius(elevation[r]);
    regionPositions[r] = latLonToVec3(points[r].lat, points[r].lon, h);
  }

  const geoPoints = points.map((p) => [p.lon, p.lat]);
  const voronoi = d3.geoVoronoi(geoPoints);
  const delTriangles = voronoi.delaunay.triangles;

  const vertCount = delTriangles.length * 3;
  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);

  for (let i = 0; i < delTriangles.length; i++) {
    const [a, b, c] = delTriangles[i];
    const pA = regionPositions[a];
    const pB = regionPositions[b];
    const pC = regionPositions[c];

    // check if this triangle crosses the coastline
    const aLand = elevation[a] >= SPHERE_CONFIG.OCEAN_THRESHOLD;
    const bLand = elevation[b] >= SPHERE_CONFIG.OCEAN_THRESHOLD;
    const cLand = elevation[c] >= SPHERE_CONFIG.OCEAN_THRESHOLD;
    const mixed = !(aLand === bLand && bLand === cLand);

    let cA, cB, cC;
    if (mixed) {
      // for coastal triangles, snap each vertex to either a land or ocean color
      // use a consistent coastal land/ocean color to avoid blending and also create a border of sorts
      const coastLand = { r: 0.35, g: 0.55, b: 0.25 };
      const coastOcean = { r: 0.14, g: 0.22, b: 0.43 };
      cA = aLand ? coastLand : coastOcean;
      cB = bLand ? coastLand : coastOcean;
      cC = cLand ? coastLand : coastOcean;
    } else {
      cA = regionColors[a];
      cB = regionColors[b];
      cC = regionColors[c];
    }

    const base = i * 9;

    positions[base] = pA.x;
    positions[base + 1] = pA.y;
    positions[base + 2] = pA.z;
    positions[base + 3] = pB.x;
    positions[base + 4] = pB.y;
    positions[base + 5] = pB.z;
    positions[base + 6] = pC.x;
    positions[base + 7] = pC.y;
    positions[base + 8] = pC.z;

    colors[base] = cA.r;
    colors[base + 1] = cA.g;
    colors[base + 2] = cA.b;
    colors[base + 3] = cB.r;
    colors[base + 4] = cB.g;
    colors[base + 5] = cB.b;
    colors[base + 6] = cC.r;
    colors[base + 7] = cC.g;
    colors[base + 8] = cC.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    //color: 0xffffff,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  worldGroup.add(mesh);

  //const wireGeo = new THREE.WireframeGeometry(geometry);
  //const wireMat = new THREE.LineBasicMaterial({ color: 0x000000 });
  //const wireframe = new THREE.LineSegments(wireGeo, wireMat);
  //worldGroup.add(wireframe);

  return [mesh];
}
