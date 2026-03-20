// MAP CONFIGURATION
let SPHERE_CONFIG = {
  NUM_POINTS: 6, // number of subdivisions on the icosphere
  WAVELENGTH: 0.65, // noise scale (smaller = more detailed terrain features)
  OCEAN_THRESHOLD: 0.35, // elevation below this is ocean, elevation above this is land
  NUM_CONTINENTS_MIN: 4, // minimum number of continent seed positions
  NUM_CONTINENTS_MAX: 7, // maximum number of continent seed positions
};

/*
// fibonacci sphere generator
// ended up using icosphere instead but left this here cause why not
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

// ICOSPHERE GENERATOR
// creates evenly distributed points on a unit sphere by subdividing an icosahedron
// begins with 12 vertices and 20 triangular faces connected the vertices
// recursively splits each triangle into 4 smaller triangles by adding midpoints on edges and connecting the midpoints
// each new subdivision multiplies the previous subdivion's point count by 4, and then subtracts 6
function icosphere(subdivisions) {
  // golden ratio
  // used to construct initial vertices
  const goldenRatio = (1 + Math.sqrt(5)) / 2;

  // 12 initial vertices of an icosahedron
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

  // normalize each vertex to sit on unit sphere
  vertices = vertices.map(([x, y, z]) => {
    const len = Math.sqrt(x * x + y * y + z * z);
    return [x / len, y / len, z / len];
  });

  // 20 triangular faces
  // each face defined by three vertex indices
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

  // subdivision
  // for each subdivision level, split each triangle into 4 smaller triangles
  const midpointCache = {};
  // finds or creates midpoint between 2 vertices
  // caches result so each edge's midpoint is only computed once
  function getMidpoint(i, j) {
    // use sorted key so edge (i, j) and edge (j, i) map to the same point
    const key = Math.min(i, j) + "-" + Math.max(i, j);
    if (midpointCache[key] !== undefined) return midpointCache[key];

    // average the 2 vertices
    const [x1, y1, z1] = vertices[i];
    const [x2, y2, z2] = vertices[j];
    let mx = (x1 + x2) / 2;
    let my = (y1 + y2) / 2;
    let mz = (z1 + z2) / 2;
    // normalize to push midpoint onto the unit sphere
    const len = Math.sqrt(mx * mx + my * my + mz * mz);
    mx /= len;
    my /= len;
    mz /= len;

    // add the new vertex and cache the index
    const idx = vertices.length;
    vertices.push([mx, my, mz]);
    midpointCache[key] = idx;
    return idx;
  }

  // perform the subdivisions
  for (let s = 0; s < subdivisions; s++) {
    const newFaces = [];
    for (const [a, b, c] of faces) {
      // find midpoints of each edge
      const ab = getMidpoint(a, b);
      const bc = getMidpoint(b, c);
      const ca = getMidpoint(c, a);
      // replace the original triangle with 4 smaller triangles
      newFaces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = newFaces;
  }

  // convert xyz coords to lat/lon for use with d3-geo-voronoi
  return vertices.map(([x, y, z]) => {
    // latitude in range (-90, 90)
    const lat = Math.asin(y) * (180 / Math.PI);
    // longitude in range (-180, 180)
    const lon = Math.atan2(z, -x) * (180 / Math.PI);
    return { lat, lon };
  });
}

// coordinate conversion
// converts lat/lon to xyz on sphere of given radius
// uses polar coordinate math
function sphereLatLonToXYZ(lat, lon, radius) {
  // polar angle form north pole (0 at top, pi at bottom)
  const phi = (90 - lat) * (Math.PI / 180);
  // azimuthal angle around the equator
  // that for sure is a word. trust me
  const theta = (lon + 180) * (Math.PI / 180);
  return {
    x: -radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.sin(theta),
  };
}

// great circle distance
// calculates the shortest distance between 2 points on a sphere's surface
// uses haversine formula, returns result in radians
function greatCircleDist(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  // we love random formulas
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(a));
}

// SPHERE MAP GENERATOR
// the everything function
function generateSphereMap() {
  // generate icosphere from config's num of subdivisions
  // really should rename that variable but w/e
  const points = icosphere(SPHERE_CONFIG.NUM_POINTS);
  //const points = fibonacciSphere(SPHERE_CONFIG.NUM_POINTS);

  // map points from lat, lon to lon, lat for d3-geo-voronoi
  const geoPoints = points.map((p) => [p.lon, p.lat]);
  const voronoi = d3.geoVoronoi(geoPoints);
  // voronoi cell boundaries used for coastline rendering
  const polygons = voronoi.polygons();
  // delaunay triangulation, used for adjacency matrix and rendering
  const delaunay = voronoi.delaunay;

  // adjacency matrix
  const adjacency = buildSphereAdjacency(points.length, delaunay);

  // map object that gets passed to renderer
  const map = {
    points, // array of {lat, lon} for each region center
    geoPoints, // array of [lon, lat] for d3-geo-voronoi
    numRegions: points.length, // total number of regions
    polygons: polygons.features, // GeoJSON features for each voronoi cell
    adjacency, // array of region indices neighboring region r
    elevation: null, // filled in below
    moisture: null, // filled in below
  };

  // elevation properties for each region
  map.elevation = assignSphereElevation(map);
  // moisture properties for each region
  map.moisture = assignSphereMoisture(map);

  return map;
}

// adjacency matrix builder
// walks every delaunay triangle and records which regions are neighbors
// a triangle [a,b,c] means that there are adjacent pairs [a,b], [a,c], and [b,c]
function buildSphereAdjacency(numPoints, delaunay) {
  // use Sets to automatically deduplicate neighbor pairs
  const adj = Array.from({ length: numPoints }, () => new Set());
  const triangles = delaunay.triangles;

  // d3-geo-voronoi stores triangles as nested arrays, so need to parse that
  for (let i = 0; i < triangles.length; i++) {
    const [a, b, c] = triangles[i];
    adj[a].add(b);
    adj[a].add(c);
    adj[b].add(a);
    adj[b].add(c);
    adj[c].add(a);
    adj[c].add(b);
  }

  // convert Set to array and then return
  return adj.map((s) => [...s]);
}

// ELEVATION GENERATOR
// assigns an elevation value from 0 to 1 for every region on the sphere
// uses continent seeds (random points that will germinate outward into continents)
// also uses simplex noise, which is used to add fractal detail at multiple octaves
function assignSphereElevation(map) {
  const noise = new SimplexNoise();
  const { points, numRegions } = map;
  const elevation = [];

  // get number of continent seeds
  const numContinents =
    SPHERE_CONFIG.NUM_CONTINENTS_MIN +
    Math.round(
      Math.random() *
        (SPHERE_CONFIG.NUM_CONTINENTS_MAX -
          SPHERE_CONFIG.NUM_CONTINENTS_MIN +
          1),
    );

  // scatter continents seeds across the sphere
  // each seed will "pull" adjacent terrain above ocean threshold
  const continentSeeds = [];
  for (let i = 0; i < numContinents; i++) {
    // random point on sphere using uniform latitude distribution to avoid pole clustering
    const lat = Math.asin(2 * Math.random() - 1) * (180 / Math.PI);
    const lon = Math.random() * 360 - 180;
    continentSeeds.push({
      lat,
      lon,
      size: 0.5 + Math.random() * 0.6, // influence radius in radians (-30 degrees to 60 degrees)
      strength: 0.7 + Math.random() * 0.3, // how strongly this seed raises adjacent terrain
    });
  }

  // compute elevation for each region
  for (let r = 0; r < numRegions; r++) {
    const { lat, lon } = points[r];
    // convert to xyz for 3d noise sampling
    const pos = sphereLatLonToXYZ(lat, lon, 1);

    // multi octave noise
    // 6 layers of noise, each progressive layer doubles the frequency and halves the amplitude
    // starting octaves will create broad continental features, ending octaves will create small coastline details
    const wl = SPHERE_CONFIG.WAVELENGTH;
    let baseNoise = 0;
    let amp = 0.5;
    let freq = 1;
    for (let oct = 0; oct < 6; oct++) {
      // 3d noise sampled at sphere surface position
      baseNoise +=
        amp *
        noise.noise3D(
          (freq * pos.x) / wl,
          (freq * pos.y) / wl,
          (freq * pos.z) / wl,
        );
      // end of octave, so change amplitude and frequency for next octave
      amp *= 0.5;
      freq *= 2;
    }

    // continent influence
    // sums up influence of all continent seeds on this region, closer seeds will contribute more
    // uses linear falloff with great circle distance
    let continentInfluence = 0;
    for (const seed of continentSeeds) {
      const dist = greatCircleDist(lat, lon, seed.lat, seed.lon);
      // 1 at center, 0 at seed.size distance
      const falloff = Math.max(0, 1 - dist / seed.size);
      continentInfluence += falloff * seed.strength;
    }
    // clamping infleunce to prevent extreme values where seeds overlap
    continentInfluence = Math.min(continentInfluence, 1.3);

    // blend shape with noise
    // combine continent shapes with noise detail
    let raw = continentInfluence * 0.4 + baseNoise * 0.6;

    // contrast curve
    // apply power curves to land and ocean for sharper coastlines
    let centered = raw - SPHERE_CONFIG.OCEAN_THRESHOLD;
    if (centered > 0) {
      // land, currently linear
      centered = Math.pow(centered / 0.85, 1) * 0.85;
    } else {
      // ocean: compressed a little bit, makes oceans flatter
      centered = -Math.pow(Math.abs(centered) / 0.35, 0.4) * 0.35;
    }

    // clamp final elevation to 0-1 range
    elevation[r] = Math.max(0, Math.min(1, centered + 0.5));
  }
  return elevation;
}

// MOISTURE GENERATOR
// assigns a moisture value from 0 to 1 for each region
// uses a 3d simlex noise with an offset on each axis so the pattern is independent from elevation noise
function assignSphereMoisture(map) {
  const noise = new SimplexNoise();
  const { points, numRegions } = map;
  const moisture = [];
  for (let r = 0; r < numRegions; r++) {
    const { lat, lon } = points[r];
    const pos = sphereLatLonToXYZ(lat, lon, 1);
    const wl = SPHERE_CONFIG.WAVELENGTH;

    // single octave of noise, normalized to 0 to 1 range
    moisture[r] =
      (1 +
        noise.noise3D(pos.x / wl + 100, pos.y / wl + 100, pos.z / wl + 100)) /
      2;
  }
  return moisture;
}

// BIOME COLOR
// parses region's elevation and moisture data into rgb color string
// used to determine vertex colors
function sphereBiomeColor(map, r) {
  // normalize elevation relative to ocean threshold
  // e less than 0 is ocean, e greater than 0 is land, ranging from -1 to 1 approx
  let e = (map.elevation[r] - SPHERE_CONFIG.OCEAN_THRESHOLD) * 2;
  let m = map.moisture[r];

  if (e < 0) {
    // ocean
    // deeper ocean creates darker blues
    let depth = Math.max(-1, e);
    let rr = 30 + 30 * (1 + depth);
    let gg = 50 + 30 * (1 + depth);
    let bb = 110 + 40 * (1 + depth);
    return `rgb(${rr | 0}, ${gg | 0}, ${bb | 0})`;
  } else {
    // land
    e = Math.min(1, e);
    // cubic power curve, higher elevation creates white mountain peaks
    let ep = e ** 3;
    // base land color, low moisture creates yellowish green, high moisture creates dark green
    let rr = 190 - 100 * m;
    let gg = 205 - 45 * m;
    let bb = 109 - 45 * m;
    // blend towards white based on elevation
    rr = 255 * ep + rr * (1 - ep);
    gg = 255 * ep + gg * (1 - ep);
    bb = 255 * ep + bb * (1 - ep);
    return `rgb(${rr | 0}, ${gg | 0}, ${bb | 0})`;
  }
}
