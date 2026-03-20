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
    return radius + (e - SPHERE_CONFIG.OCEAN_THRESHOLD) * heightScale;
  }

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

    // coastal triangle detection
    // check if the triangle has vertices on both sides of the ocean threshold
    // if it does, then it's a coastal triangle
    const aLand = elevation[a] >= SPHERE_CONFIG.OCEAN_THRESHOLD;
    const bLand = elevation[b] >= SPHERE_CONFIG.OCEAN_THRESHOLD;
    const cLand = elevation[c] >= SPHERE_CONFIG.OCEAN_THRESHOLD;
    const mixed = !(aLand === bLand && bLand === cLand);

    let cA, cB, cC;
    if (mixed) {
      // for coastal triangles, snap each vertex to either a land or ocean color
      // use a consistent coastal land/ocean color to avoid blending and also create a border of sorts
      // without this, i found that the transition from land -> ocean ends up being a blurry mess
      const coastLand = { r: 0.35, g: 0.55, b: 0.25 };
      const coastOcean = { r: 0.14, g: 0.22, b: 0.43 };
      cA = aLand ? coastLand : coastOcean;
      cB = bLand ? coastLand : coastOcean;
      cC = cLand ? coastLand : coastOcean;
    } else {
      // not a costal triangle, use the actual biome colors
      // webgl interpolates between the three vertex colors
      cA = regionColors[a];
      cB = regionColors[b];
      cC = regionColors[c];
    }

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

  // return the mesh
  return [mesh];
}
