const SPHERE_CONFIG = {
  NUM_POINTS: 6,
  WAVELENGTH: 0.6,
  OCEAN_THRESHOLD: 0.33,
  NUM_CONTINENTS_MIN: 4,
  NUM_CONTINENTS_MAX: 7,
};

/*
// fibonacci sphere
function fibonacciSphere(n) {
  const points = [];
  const goldenRatio = (1 + Math.sqrt(5)) / 2;

  for (let i = 0; i < n; i++) {
    const lat = Math.asin(1 - (2 * i) / (n - 1)) * (180 / Math.PI);
    const lon = (((360 * i) / goldenRatio) % 360) - 180;
    points.push({ lat, lon });
  }
  return points;
}
*/

// icosphere
function icosphere(subdivisions) {
  // golden ratio
  const goldenRatio = (1 + Math.sqrt(5)) / 2;

  let vertices = [
    [-1, goldenRatio, 0],
    [1, goldenRatio, 0],
    [-1, -goldenRatio, 0],
    [1, -goldenRatio, 0],
    [0, -1, goldenRatio],
    [0, 1, goldenRatio],
    [0, -1, -goldenRatio],
    [0, 1, -goldenRatio],
    [goldenRatio, 0, -1],
    [goldenRatio, 0, 1],
    [-goldenRatio, 0, -1],
    [-goldenRatio, 0, 1],
  ];

  // normalize to unit sphere
  vertices = vertices.map(([x, y, z]) => {
    const len = Math.sqrt(x * x + y * y + z * z);
    return [x / len, y / len, z / len];
  });

  let faces = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];

  // subdivide
  const midpointCache = {};
  function getMidpoint(i, j) {
    const key = Math.min(i, j) + "-" + Math.max(i, j);
    if (midpointCache[key] !== undefined) return midpointCache[key];

    const [x1, y1, z1] = vertices[i];
    const [x2, y2, z2] = vertices[j];
    let mx = (x1 + x2) / 2;
    let my = (y1 + y2) / 2;
    let mz = (z1 + z2) / 2;
    const len = Math.sqrt(mx * mx + my * my + mz * mz);
    mx /= len;
    my /= len;
    mz /= len;

    const idx = vertices.length;
    vertices.push([mx, my, mz]);
    midpointCache[key] = idx;
    return idx;
  }

  for (let s = 0; s < subdivisions; s++) {
    const newFaces = [];
    for (const [a, b, c] of faces) {
      const ab = getMidpoint(a, b);
      const bc = getMidpoint(b, c);
      const ca = getMidpoint(c, a);
      newFaces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = newFaces;
  }

  return vertices.map(([x, y, z]) => {
    const lat = Math.asin(y) * (180 / Math.PI);
    const lon = Math.atan2(z, -x) * (180 / Math.PI);
    return { lat, lon };
  });
}

function sphereLatLonToXYZ(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return {
    x: -radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.sin(theta),
  };
}

function greatCircleDist(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  // what ?
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(a));
}

function generateSphereMap() {
  const points = icosphere(SPHERE_CONFIG.NUM_POINTS);
  //const points = fibonacciSphere(SPHERE_CONFIG.NUM_POINTS);

  // map points from lat, lon to lon, lat for d3-geo-voronoi
  const geoPoints = points.map((p) => [p.lon, p.lat]);
  const voronoi = d3.geoVoronoi(geoPoints);
  const polygons = voronoi.polygons();
  const delaunay = voronoi.delaunay;

  const adjacency = buildSphereAdjacency(points.length, delaunay);

  const map = {
    points,
    geoPoints,
    numRegions: points.length,
    polygons: polygons.features,
    adjacency,
    elevation: null,
    moisture: null,
  };

  map.elevation = assignSphereElevation(map);
  map.moisture = assignSphereMoisture(map);

  return map;
}

function buildSphereAdjacency(numPoints, delaunay) {
  const adj = Array.from({ length: numPoints }, () => new Set());
  const triangles = delaunay.triangles;

  for (let i = 0; i < triangles.length; i++) {
    const [a, b, c] = triangles[i];
    adj[a].add(b);
    adj[a].add(c);
    adj[b].add(a);
    adj[b].add(c);
    adj[c].add(a);
    adj[c].add(b);
  }

  return adj.map((s) => [...s]);
}

function assignSphereElevation(map) {
  const noise = new SimplexNoise();
  const { points, numRegions } = map;
  const elevation = [];

  const numContinents =
    SPHERE_CONFIG.NUM_CONTINENTS_MIN +
    Math.round(
      Math.random() *
        (SPHERE_CONFIG.NUM_CONTINENTS_MAX -
          SPHERE_CONFIG.NUM_CONTINENTS_MIN +
          1),
    );

  const continentSeeds = [];
  for (let i = 0; i < numContinents; i++) {
    const lat = Math.asin(2 * Math.random() - 1) * (180 / Math.PI);
    const lon = Math.random() * 360 - 180;
    continentSeeds.push({
      lat,
      lon,
      size: 0.5 + Math.random() * 0.6,
      strength: 0.7 + Math.random() * 0.3,
    });
  }

  for (let r = 0; r < numRegions; r++) {
    const { lat, lon } = points[r];
    const pos = sphereLatLonToXYZ(lat, lon, 1);

    const wl = SPHERE_CONFIG.WAVELENGTH;
    let baseNoise = 0;
    let amp = 0.5;
    let freq = 1;
    for (let oct = 0; oct < 6; oct++) {
      baseNoise +=
        amp *
        noise.noise3D(
          (freq * pos.x) / wl,
          (freq * pos.y) / wl,
          (freq * pos.z) / wl,
        );
      amp *= 0.5;
      freq *= 2;
    }

    let continentInfluence = 0;
    for (const seed of continentSeeds) {
      const dist = greatCircleDist(lat, lon, seed.lat, seed.lon);
      const falloff = Math.max(0, 1 - dist / seed.size);
      continentInfluence += falloff * seed.strength;
    }
    // clamping
    continentInfluence = Math.min(continentInfluence, 1.3);

    let raw = continentInfluence * 0.4 + baseNoise * 0.6;

    let centered = raw - SPHERE_CONFIG.OCEAN_THRESHOLD;
    if (centered > 0) {
      // land
      centered = Math.pow(centered / 0.85, 1) * 0.85;
    } else {
      centered = -Math.pow(Math.abs(centered) / 0.35, 0.4) * 0.35;
    }

    elevation[r] = Math.max(0, Math.min(1, centered + 0.5));
  }
  return elevation;
}

function assignSphereMoisture(map) {
  const noise = new SimplexNoise();
  const { points, numRegions } = map;
  const moisture = [];
  for (let r = 0; r < numRegions; r++) {
    const { lat, lon } = points[r];
    const pos = sphereLatLonToXYZ(lat, lon, 1);
    const wl = SPHERE_CONFIG.WAVELENGTH;

    moisture[r] =
      (1 +
        noise.noise3D(pos.x / wl + 100, pos.y / wl + 100, pos.z / wl + 100)) /
      2;
  }
  return moisture;
}

function sphereBiomeColor(map, r) {
  let e = (map.elevation[r] - SPHERE_CONFIG.OCEAN_THRESHOLD) * 2;
  let m = map.moisture[r];

  if (e < 0) {
    // ocean
    let depth = Math.max(-1, e);
    let rr = 30 + 30 * (1 + depth);
    let gg = 50 + 30 * (1 + depth);
    let bb = 110 + 40 * (1 + depth);
    return `rgb(${rr | 0}, ${gg | 0}, ${bb | 0})`;
  } else {
    // land
    e = Math.min(1, e);
    let ep = e ** 3;
    let rr = 190 - 100 * m;
    let gg = 205 - 45 * m;
    let bb = 109 - 45 * m;
    rr = 255 * ep + rr * (1 - ep);
    gg = 255 * ep + gg * (1 - ep);
    bb = 255 * ep + bb * (1 - ep);
    return `rgb(${rr | 0}, ${gg | 0}, ${bb | 0})`;
  }
}
