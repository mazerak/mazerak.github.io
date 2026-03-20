// MAP CONFIGURATION
let SPHERE_CONFIG = {
  NUM_POINTS: 6, // number of subdivisions on the icosphere
  WAVELENGTH: 0.65, // noise scale (smaller = more detailed terrain features)
  OCEAN_THRESHOLD: 0.35, // elevation below this is ocean, elevation above this is land
  NUM_CONTINENTS_MIN: 4, // minimum number of continent seed positions
  NUM_CONTINENTS_MAX: 7, // maximum number of continent seed positions
  RIVER_PERCENTILE: 0.98, // only show rivers above this flow percentile (0-1)
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
    temperature: null, // filled in below
    downslope: null, // filled in below
    flow: null, // filled in below
    riverThreshold: null, // filled in below
    lakes: null, // filled in below
  };

  // elevation properties for each region
  map.elevation = assignSphereElevation(map);
  // moisture properties for each region
  map.moisture = assignSphereMoisture(map);
  // temperature proprties for each region
  map.temperature = assignSphereTemperature(map);

  // river system stuff
  map.downslope = assignSphereDownslope(map);
  map.flow = assignSphereRiverFlow(map);
  map.riverThreshold = computeSphereRiverThreshold(map);
  map.lakes = findSphereLakes(map);

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
      centered = Math.pow(centered / 0.85, 1.5) * 1.2;
    } else {
      // ocean: compressed a little bit, makes oceans flatter
      centered = -Math.pow(Math.abs(centered) / 0.35, 1.2) * 0.7;
    }

    // clamp final elevation to 0-2 range
    elevation[r] = Math.max(0, Math.min(2, centered + 0.5));
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

// DOWNSLOPE ASSIGNMENT
// for each land region, finds the adjacent neighbor with the lowest elevation
// water flows downhill from each region to its downslope niehgbor
// if no neighbor is lower, then we are at a local minimum. return null
function assignSphereDownslope(map) {
  const { elevation, adjacency } = map;
  const downslope = new Array(elevation.length).fill(null);

  for (let r = 0; r < elevation.length; r++) {
    // skip ocean regions, since there are no rivers in the ocean i think
    if (elevation[r] < SPHERE_CONFIG.OCEAN_THRESHOLD) continue;

    let bestElev = elevation[r];
    let bestNeighbor = null;
    for (const neighbor of adjacency[r]) {
      if (elevation[neighbor] < bestElev) {
        bestElev = elevation[neighbor];
        bestNeighbor = neighbor;
      }
    }
    downslope[r] = bestNeighbor;
  }
  return downslope;
}

// RIVER FLOW ASSIGNMENT
// calculates cumulative water flow at each region
// sorts all regions from highest to lowest elevation, and passes its flow to its downslope neighbor
// flow accumulates as the downslope chain continues
function assignSphereRiverFlow(map) {
  const { elevation, moisture, downslope } = map;
  // sort regions highest to lowest so we process upstream before downstream
  const regions = Array.from({ length: elevation.length }, (_, r) => r);
  regions.sort((r1, r2) => elevation[r2] - elevation[r1]);

  const flow = new Array(elevation.length).fill(0);
  for (const r of regions) {
    // skip ocean
    if (elevation[r] < SPHERE_CONFIG.OCEAN_THRESHOLD) continue;
    // each region contributes its own moisture as base flow
    flow[r] += moisture[r];

    // pass accumulated flow downhill
    const next = downslope[r];
    if (next === null) continue;
    flow[next] += flow[r];
  }
  return flow;
}

// RIVER THRESHOLD CALCULATION
// determines minimum flow value for a region to have a visible river
// uses a percentile of all land flow values (RIVER_PERCENTILE of 0.9 means that only the top 10% of flow become rivers)
function computeSphereRiverThreshold(map) {
  const { elevation, flow } = map;
  const landFlows = [];
  for (let r = 0; r < elevation.length; r++) {
    if (elevation[r] >= SPHERE_CONFIG.OCEAN_THRESHOLD && flow[r] > 0) {
      landFlows.push(flow[r]);
    }
  }
  if (landFlows.length === 0) return Infinity;
  landFlows.sort((a, b) => a - b);
  const idx = Math.floor(landFlows.length * SPHERE_CONFIG.RIVER_PERCENTILE);
  return landFlows[Math.min(idx, landFlows.length - 1)];
}

// LAKE FINDER
// finds local minima regions with large flow
// converts to lake and expands lake to nearby regions of similar elevation using breadth first search
function findSphereLakes(map) {
  const { elevation, downslope, flow, adjacency } = map;
  const lakes = new Set();
  const riverThreshold = map.riverThreshold;

  // find local minima with significant flow
  const minima = [];
  for (let r = 0; r < elevation.length; r++) {
    if (
      elevation[r] >= SPHERE_CONFIG.OCEAN_THRESHOLD &&
      downslope[r] === null &&
      flow[r] > riverThreshold * 2
    ) {
      minima.push(r);
    }
  }

  // BFS expand each minimum into a lake
  for (const seed of minima) {
    lakes.add(seed);
    const seedElev = elevation[seed];
    const queue = [seed];
    const visited = new Set([seed]);
    // lake size scales with flow — bigger rivers make bigger lakes
    const maxLakeSize = 2 + Math.floor(Math.sqrt(flow[seed]));
    let lakeSize = 1;

    while (queue.length > 0 && lakeSize < maxLakeSize) {
      const current = queue.shift();
      for (const neighbor of adjacency[current]) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        if (elevation[neighbor] < SPHERE_CONFIG.OCEAN_THRESHOLD) continue;
        // only expand to regions of similar elevation (flat terrain = lake bed)
        if (Math.abs(elevation[neighbor] - seedElev) < 0.05) {
          lakes.add(neighbor);
          queue.push(neighbor);
          lakeSize++;
          if (lakeSize >= maxLakeSize) break;
        }
      }
    }
  }

  return lakes;
}

// TEMPERATURE GENERATOR
// assigns temperature from 0 to 1 based on latitude, elevation, and noise
// hotter around equator, cooler around poles, higher elevations = cooler, slight random variation from noise
function assignSphereTemperature(map) {
  const noise = new SimplexNoise();
  const { points, elevation, numRegions } = map;
  const temperature = [];

  for (let r = 0; r < numRegions; r++) {
    const { lat, lon } = points[r];
    const pos = sphereLatLonToXYZ(lat, lon, 1);

    // base temperature from latitude
    // 1.0 at equator, 0.0 at poles
    // using cosine gives a smooth gradient
    const latFactor = Math.cos(lat * (Math.PI / 180));

    // elevation cooling: higher land is cooler
    // only applies above ocean threshold (ocean temperature is just latitude-based)
    const e = elevation[r];
    const elevCooling =
      e >= SPHERE_CONFIG.OCEAN_THRESHOLD
        ? (e - SPHERE_CONFIG.OCEAN_THRESHOLD) * 1.2
        : 0;

    // noise variation so biome boundaries aren't perfectly smooth latitude lines
    const wl = SPHERE_CONFIG.WAVELENGTH;
    const noiseVal =
      noise.noise3D(pos.x / wl + 200, pos.y / wl + 200, pos.z / wl + 200) *
      0.15;

    temperature[r] = Math.max(
      0,
      Math.min(1, latFactor - elevCooling + noiseVal),
    );
  }
  return temperature;
}

// BIOME CLASSIFIER
// simplified whittaker diagram classifier
// temperature and moisture combine to create a biome type
// returns biome string
function getBiome(temp, moisture, elevation, oceanThreshold) {
  // normalize elevation above ocean threshold
  const e = (elevation - oceanThreshold) * 2;

  // very high elevation = snow/ice regardless of temp/moisture
  if (e > 0.7) return "snow";
  if (e > 0.5) return "alpine";

  // temperature zones with moisture subdivisions
  if (temp < 0.15) {
    // polar
    return moisture > 0.5 ? "ice" : "tundra";
  } else if (temp < 0.35) {
    // subpolar / boreal
    if (moisture > 0.6) return "taiga_wet";
    if (moisture > 0.3) return "taiga";
    return "tundra";
  } else if (temp < 0.55) {
    // temperate
    if (moisture > 0.7) return "temperate_rainforest";
    if (moisture > 0.4) return "temperate_forest";
    if (moisture > 0.2) return "grassland";
    return "shrubland";
  } else if (temp < 0.75) {
    // subtropical
    if (moisture > 0.6) return "tropical_forest";
    if (moisture > 0.35) return "savanna";
    if (moisture > 0.15) return "shrubland";
    return "desert";
  } else {
    // tropical
    if (moisture > 0.65) return "tropical_rainforest";
    if (moisture > 0.4) return "tropical_forest";
    if (moisture > 0.2) return "savanna";
    return "desert";
  }
}

// BIOME COLOR PALETTE
// each biome maps to an RGB color
const BIOME_COLORS = {
  // polar & cold
  snow: { r: 248, g: 248, b: 255 },
  ice: { r: 220, g: 235, b: 245 },
  tundra: { r: 170, g: 190, b: 170 },
  alpine: { r: 190, g: 190, b: 180 },

  // boreal
  taiga: { r: 50, g: 90, b: 60 },
  taiga_wet: { r: 40, g: 80, b: 70 },

  // temperate
  temperate_rainforest: { r: 30, g: 100, b: 50 },
  temperate_forest: { r: 60, g: 120, b: 50 },
  grassland: { r: 140, g: 175, b: 80 },
  shrubland: { r: 160, g: 155, b: 90 },

  // tropical & subtropical
  tropical_rainforest: { r: 20, g: 90, b: 30 },
  tropical_forest: { r: 50, g: 110, b: 40 },
  savanna: { r: 170, g: 165, b: 70 },
  desert: { r: 210, g: 190, b: 130 },
};

// BIOME COLOR
// determines final rgb color based on biome type and blending
function sphereBiomeColor(map, r) {
  let e = (map.elevation[r] - SPHERE_CONFIG.OCEAN_THRESHOLD) * 2;
  const m = map.moisture[r];
  const t = map.temperature[r];

  if (e < 0) {
    // ocean
    let depth = Math.max(-1, e);

    // latitude factor: 0 at poles, 1 at equator
    const latFactor = t;

    // base color shifts with depth and latitude
    // warm tropical = brighter blue, cold polar = dark grey-blue
    let rr = 15 + 30 * (1 + depth) + latFactor * 25;
    let gg = 30 + 35 * (1 + depth) + latFactor * 20;
    let bb = 80 + 50 * (1 + depth) + latFactor * 25;

    // polar water: desaturate toward grey-steel blue
    if (t < 0.3) {
      const coldT = 1 - t / 0.3;
      rr += coldT * 40;
      gg += coldT * 45;
      bb += coldT * 20;
    }

    // shallow coastal water: lighter, greener
    if (depth > -0.2) {
      const shallowT = 1 - Math.abs(depth) / 0.2;
      rr += shallowT * 30;
      gg += shallowT * 45;
      bb -= shallowT * 15;
    }

    // moisture-driven variation for currents/clarity
    const variation = m - 0.5;
    rr += variation * 20;
    gg += variation * 25;
    bb += variation * 15;

    // deep ocean trenches: darker
    if (depth < -0.7) {
      const deepT = (Math.abs(depth) - 0.7) / 0.3;
      rr *= 1 - deepT * 0.4;
      gg *= 1 - deepT * 0.4;
      bb *= 1 - deepT * 0.3;
    }

    return `rgb(${Math.max(0, Math.min(255, rr)) | 0}, ${Math.max(0, Math.min(255, gg)) | 0}, ${Math.max(0, Math.min(255, bb)) | 0})`;
  } else {
    // land — continuous blending between biome anchor colors
    e = Math.min(1, e);

    // define anchor colors at specific (temperature, moisture) points
    // and blend between them based on distance

    // cold + dry = tundra grey-green
    // cold + wet = taiga dark green
    // mid + dry = grassland/shrubland yellow-green
    // mid + wet = temperate forest green
    // hot + dry = desert sandy
    // hot + wet = tropical rainforest dark green

    // cold colors (t=0)
    const coldDry = { r: 170, g: 190, b: 170 }; // tundra
    const coldWet = { r: 40, g: 80, b: 70 }; // taiga

    // temperate colors (t=0.5)
    const midDry = { r: 160, g: 155, b: 90 }; // shrubland
    const midWet = { r: 50, g: 115, b: 45 }; // temperate forest

    // hot colors (t=1)
    const hotDry = { r: 210, g: 190, b: 130 }; // desert
    const hotWet = { r: 20, g: 90, b: 30 }; // tropical rainforest

    // interpolate between cold/mid/hot based on temperature
    function lerpColor(a, b, t) {
      return {
        r: a.r + (b.r - a.r) * t,
        g: a.g + (b.g - a.g) * t,
        b: a.b + (b.b - a.b) * t,
      };
    }

    // get dry and wet colors at this temperature
    let dry, wet;
    if (t < 0.5) {
      const tt = t / 0.5; // 0-1 within cold-to-mid range
      dry = lerpColor(coldDry, midDry, tt);
      wet = lerpColor(coldWet, midWet, tt);
    } else {
      const tt = (t - 0.5) / 0.5; // 0-1 within mid-to-hot range
      dry = lerpColor(midDry, hotDry, tt);
      wet = lerpColor(midWet, hotWet, tt);
    }

    // blend between dry and wet based on moisture
    let base = lerpColor(dry, wet, m);

    // snow/ice blend at high elevation
    const snowBlend = Math.max(0, (e - 0.4) * 2.5) ** 2;
    // also blend toward snow at very low temperatures regardless of elevation
    const coldSnow = Math.max(0, (0.15 - t) * 5) ** 1.5;
    const totalSnow = Math.min(1, snowBlend + coldSnow);

    let rr = base.r * (1 - totalSnow) + 248 * totalSnow;
    let gg = base.g * (1 - totalSnow) + 248 * totalSnow;
    let bb = base.b * (1 - totalSnow) + 255 * totalSnow;

    return `rgb(${rr | 0}, ${gg | 0}, ${bb | 0})`;
  }
}
