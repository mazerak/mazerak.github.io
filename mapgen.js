const MAP_CONFIG = {
  GRIDSIZE: 60,
  POISSON_RADIUS: 0.9,
  WAVELENGTH: 0.19,
  OCEAN_THRESHOLD: 0.33,
  RIVER_PERCENTILE: 0.88,
};

function poissonDiskSampling(width, height, radius, maxAttempts = 30) {
  const cellSize = radius / Math.SQRT2;
  const gridCols = Math.ceil(width / cellSize);
  const gridRows = Math.ceil(height / cellSize);
  const grid = new Array(gridCols * gridRows).fill(-1);
  const points = [];
  const active = [];

  function gridIndex(x, y) {
    const col = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);
    return row * gridCols + col;
  }

  function addPoint(x, y) {
    const idx = points.length;
    points.push({ x, y });
    active.push(idx);
    grid[gridIndex(x, y)] = idx;
    return idx;
  }

  function isValid(x, y) {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    const col = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);
    const minCol = Math.max(0, col - 2);
    const maxCol = Math.min(gridCols - 1, col + 2);
    const minRow = Math.max(0, row - 2);
    const maxRow = Math.min(gridRows - 1, row + 2);
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const idx = grid[r * gridCols + c];
        if (idx !== -1) {
          const dx = points[idx].x - x;
          const dy = points[idx].y - y;
          if (dx * dx + dy * dy < radius * radius) return false;
        }
      }
    }
    return true;
  }

  addPoint(width / 2, height / 2);

  while (active.length > 0) {
    const randIdx = Math.floor(Math.random() * active.length);
    const parent = points[active[randIdx]];
    let found = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const angle = Math.random() * 2 * Math.PI;
      const dist = radius + Math.random() * radius;
      const nx = parent.x + Math.cos(angle) * dist;
      const ny = parent.y + Math.sin(angle) * dist;
      if (isValid(nx, ny)) {
        addPoint(nx, ny);
        found = true;
      }
    }

    if (!found) {
      active.splice(randIdx, 1);
    }
  }

  return points;
}

function addBorderPoints(interiorPoints, gridW, gridH, spacing) {
  const border = [];
  const margin = -0.5;

  for (let x = margin; x <= gridW - margin; x += spacing) {
    border.push({ x, y: margin, isBorder: true });
    border.push({ x, y: gridH - margin, isBorder: true });
  }
  for (let y = margin + spacing; y < gridH - margin; y += spacing) {
    border.push({ x: margin, y, isBorder: true });
    border.push({ x: gridW - margin, y, isBorder: true });
  }

  const all = interiorPoints.map((p) => ({ ...p, isBorder: false }));
  return [...all, ...border];
}

function generateWorldMap() {
  // Use 2:1 aspect ratio for equirectangular-style mapping onto sphere
  const gridW = MAP_CONFIG.GRIDSIZE * 2;
  const gridH = MAP_CONFIG.GRIDSIZE;

  let interiorPoints = poissonDiskSampling(
    gridW,
    gridH,
    MAP_CONFIG.POISSON_RADIUS,
  );
  let points = addBorderPoints(
    interiorPoints,
    gridW,
    gridH,
    MAP_CONFIG.POISSON_RADIUS * 0.9,
  );

  let delaunay = Delaunator.from(
    points,
    (loc) => loc.x,
    (loc) => loc.y,
  );

  let map = {
    points,
    gridW,
    gridH,
    numRegions: points.length,
    numTriangles: delaunay.halfedges.length / 3,
    numEdges: delaunay.halfedges.length,
    halfedges: delaunay.halfedges,
    triangles: delaunay.triangles,
    centers: mapgenCalculateCentroids(points, delaunay),
  };

  map.adjacency = mapgenBuildAdjacency(map);
  map.elevation = mapgenAssignElevation(map);
  map.moisture = mapgenAssignMoisture(map);
  //map.downslope = mapgenAssignDownslope(map);
  //map.flow = mapgenAssignRiverFlow(map);
  //map.riverThreshold = mapgenComputeRiverThreshold(map);
  //map.lakes = mapgenFindLakes(map);
  map.regionEdges = mapgenBuildRegionEdges(map);

  return map;
}

function mapgenTriangleOfEdge(e) {
  return Math.floor(e / 3);
}

function mapgenNextHalfedge(e) {
  return e % 3 === 2 ? e - 2 : e + 1;
}

function mapgenEdgesAroundPoint(halfedges, start) {
  const result = [];
  let incoming = start;
  do {
    result.push(incoming);
    const outgoing = mapgenNextHalfedge(incoming);
    incoming = halfedges[outgoing];
  } while (incoming !== -1 && incoming !== start);
  return result;
}

function mapgenCalculateCentroids(points, delaunay) {
  const numTriangles = delaunay.halfedges.length / 3;
  let centroids = [];
  for (let t = 0; t < numTriangles; t++) {
    let sumOfX = 0,
      sumOfY = 0;
    for (let i = 0; i < 3; i++) {
      let s = 3 * t + i;
      let p = points[delaunay.triangles[s]];
      sumOfX += p.x;
      sumOfY += p.y;
    }
    centroids[t] = { x: sumOfX / 3, y: sumOfY / 3 };
  }
  return centroids;
}

function mapgenBuildAdjacency(map) {
  let { triangles, halfedges } = map;
  let adj = Array.from({ length: map.numRegions }, () => new Set());
  for (let e = 0; e < triangles.length; e++) {
    const a = triangles[e];
    const b = triangles[mapgenNextHalfedge(e)];
    adj[a].add(b);
    adj[b].add(a);
  }
  return adj.map((s) => [...s]);
}

function mapgenBuildRegionEdges(map) {
  let { centers, halfedges, triangles, numEdges } = map;
  let edgeMap = new Map();
  for (let e = 0; e < numEdges; e++) {
    let opp = halfedges[e];
    if (opp < 0) continue;
    if (e > opp) continue;
    let t1 = mapgenTriangleOfEdge(e);
    let t2 = mapgenTriangleOfEdge(opp);
    let rA = triangles[e];
    let rB = triangles[mapgenNextHalfedge(e)];
    let key = rA < rB ? `${rA}-${rB}` : `${rB}-${rA}`;
    if (!edgeMap.has(key)) {
      edgeMap.set(key, []);
    }
    edgeMap.set(key, { p: centers[t1], q: centers[t2] });
  }
  return edgeMap;
}

function mapgenAssignElevation(map) {
  const noise = new SimplexNoise();
  let { points, numRegions } = map;
  let elevation = [];

  const NUM_CONTINENTS = 4 + Math.floor(Math.random() * 4);
  const continentSeeds = [];
  for (let i = 0; i < NUM_CONTINENTS; i++) {
    continentSeeds.push({
      x: 0.1 + Math.random() * 0.8,
      y: 0.1 + Math.random() * 0.8,
      size: 0.18 + Math.random() * 0.18,
      strength: 0.7 + Math.random() * 0.3,
    });
  }

  for (let r = 0; r < numRegions; r++) {
    let nx = points[r].x / map.gridW,
      ny = points[r].y / map.gridH;

    if (points[r].isBorder) {
      elevation[r] = 0.1;
      continue;
    }

    let baseNoise = 0;
    let amp = 0.5;
    let freq = 1;
    for (let oct = 0; oct < 6; oct++) {
      baseNoise +=
        amp *
        noise.noise2D(
          (freq * nx) / MAP_CONFIG.WAVELENGTH,
          (freq * ny) / MAP_CONFIG.WAVELENGTH,
        );
      amp *= 0.5;
      freq *= 2;
    }

    let continentInfluence = 0;
    for (let seed of continentSeeds) {
      let dx = nx - seed.x;
      let dy = ny - seed.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      let falloff = Math.max(0, 1 - dist / seed.size);
      continentInfluence += falloff * seed.strength;
    }
    continentInfluence = Math.min(continentInfluence, 1.3);

    let edgeMargin = 0.06;
    let edgeDist = Math.min(nx, ny, 1 - nx, 1 - ny);
    let edgeFalloff =
      edgeDist < edgeMargin
        ? (edgeDist / edgeMargin) * (edgeDist / edgeMargin)
        : 1;

    let raw = continentInfluence * 0.35 + baseNoise * 0.65;
    raw *= edgeFalloff;

    let centered = raw - 0.35;
    if (centered > 0) {
      centered = Math.pow(centered / 0.85, 1) * 0.85;
    } else {
      centered = -Math.pow(Math.abs(centered) / 0.35, 0.4) * 0.35;
    }
    elevation[r] = Math.max(0, Math.min(1, centered + 0.5));
  }
  return elevation;
}

function mapgenAssignMoisture(map) {
  const noise = new SimplexNoise();
  let { points, numRegions } = map;
  let moisture = [];
  for (let r = 0; r < numRegions; r++) {
    let nx = points[r].x / map.gridW - 0.5,
      ny = points[r].y / map.gridH - 0.5;
    moisture[r] =
      (1 +
        noise.noise2D(nx / MAP_CONFIG.WAVELENGTH, ny / MAP_CONFIG.WAVELENGTH)) /
      2;
  }
  return moisture;
}

function mapgenAssignDownslope(map) {
  let { elevation, adjacency } = map;
  let downslope = new Array(elevation.length).fill(null);

  for (let r = 0; r < elevation.length; r++) {
    if (elevation[r] < MAP_CONFIG.OCEAN_THRESHOLD) continue;

    let bestElev = elevation[r];
    let bestNeighbor = null;
    for (let neighbor of adjacency[r]) {
      if (elevation[neighbor] < bestElev) {
        bestElev = elevation[neighbor];
        bestNeighbor = neighbor;
      }
    }
    downslope[r] = bestNeighbor;
  }
  return downslope;
}

function mapgenAssignRiverFlow(map) {
  let { elevation, moisture, downslope } = map;
  let regions = Array.from({ length: elevation.length }, (_, r) => r);
  regions.sort((r1, r2) => elevation[r2] - elevation[r1]);

  let flow = new Array(elevation.length).fill(0);
  for (let r of regions) {
    if (elevation[r] < MAP_CONFIG.OCEAN_THRESHOLD) continue;
    flow[r] += moisture[r];
    let next = downslope[r];
    if (next === null) continue;
    flow[next] += flow[r];
  }
  return flow;
}

function mapgenComputeRiverThreshold(map) {
  let { elevation, flow } = map;
  let landFlows = [];
  for (let r = 0; r < elevation.length; r++) {
    if (elevation[r] >= MAP_CONFIG.OCEAN_THRESHOLD && flow[r] > 0) {
      landFlows.push(flow[r]);
    }
  }
  if (landFlows.length === 0) return Infinity;
  landFlows.sort((a, b) => a - b);
  let idx = Math.floor(landFlows.length * MAP_CONFIG.RIVER_PERCENTILE);
  return landFlows[Math.min(idx, landFlows.length - 1)];
}

function mapgenFindLakes(map) {
  let { elevation, downslope, flow, adjacency } = map;
  let lakes = new Set();
  let riverThreshold = map.riverThreshold;

  let minima = [];
  for (let r = 0; r < elevation.length; r++) {
    if (
      elevation[r] >= MAP_CONFIG.OCEAN_THRESHOLD &&
      downslope[r] === null &&
      flow[r] > riverThreshold * 0.5
    ) {
      minima.push(r);
    }
  }

  for (let seed of minima) {
    lakes.add(seed);
    let seedElev = elevation[seed];
    let queue = [seed];
    let visited = new Set([seed]);
    let maxLakeSize = 2 + Math.floor(Math.sqrt(flow[seed]));
    let lakeSize = 1;

    while (queue.length > 0 && lakeSize < maxLakeSize) {
      let current = queue.shift();
      for (let neighbor of adjacency[current]) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        if (elevation[neighbor] < MAP_CONFIG.OCEAN_THRESHOLD) continue;
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

function biomeColor(map, r) {
  let e = (map.elevation[r] - MAP_CONFIG.OCEAN_THRESHOLD) * 2,
    m = map.moisture[r];
  if (e < 0) {
    let depth = Math.max(-1, e);
    let rr = 30 + 30 * (1 + depth);
    let gg = 50 + 30 * (1 + depth);
    let bb = 110 + 40 * (1 + depth);
    return `rgb(${rr | 0}, ${gg | 0}, ${bb | 0})`;
  } else {
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
