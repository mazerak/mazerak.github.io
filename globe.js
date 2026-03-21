// globe setup
// grab the DOM container where the 3D canvas will live, and the loading text element
const container = document.getElementById("globe-container");
const loadingEl = document.getElementById("loading");
const width = container.clientWidth;
const height = container.clientHeight;

// create the Three.js scene
// this is the 3D world that holds all objects
const scene = new THREE.Scene();
// dark background so stars are visible
scene.background = new THREE.Color(0x0f0f0f);

// perspective camera: 45° field of view, aspect ratio from container, near/far clipping planes
// positioned at z=3.25, looking at the origin where the globe sits
const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
camera.position.z = 3.25;

// WebGL renderer with antialiasing for smoother edges
// sized to fill the container, using device pixel ratio for sharp rendering on high-DPI screens
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(width, height);
renderer.setPixelRatio(window.devicePixelRatio);
// append the <canvas> element of the renderer into the DOM container
container.appendChild(renderer.domElement);

// CORE
// (acts as the core, tried to remove it but everything broke so it stays lol)
const globeGeometry = new THREE.SphereGeometry(0.1, 64, 64);
const globeMaterial = new THREE.MeshPhongMaterial({
  color: 0x1a1a2e,
  emissive: 0x545454,
  shininess: 15,
});
const globe = new THREE.Mesh(globeGeometry, globeMaterial);

// ATMOSPHERE
// gives a faint blue halo around the globe edges
const atmosGeometryLayer1 = new THREE.SphereGeometry(1.075, 64, 64);
const atmosMaterialLayer1 = new THREE.MeshBasicMaterial({
  color: 0x87cefa,
  transparent: true,
  opacity: 0.15,
  side: THREE.BackSide,
});
const atmosGeometryLayer2 = new THREE.SphereGeometry(1.2, 64, 64);
const atmosMaterialLayer2 = new THREE.MeshBasicMaterial({
  color: 0xbbe2f9,
  transparent: true,
  opacity: 0.05,
  side: THREE.BackSide,
});
const atmosphereLayer1 = new THREE.Mesh(
  atmosGeometryLayer1,
  atmosMaterialLayer1,
);
const atmosphereLayer2 = new THREE.Mesh(
  atmosGeometryLayer2,
  atmosMaterialLayer2,
);

// STARS
// scatter 8000 colored points on a large sphere around the scene
const stars = createStars(8000);
scene.add(stars);

// SUN
// distance from the origin that the sun orbits at
const SUN_DISTANCE = 40;
// radius, subdivisions
const sun = generateSunMesh(3, 4);
scene.add(sun);

// SUN GLOW
// create a radial gradient on a canvas to use as a glow sprite texture
const sunGlowCanvas = document.createElement("canvas");
sunGlowCanvas.width = 128;
sunGlowCanvas.height = 128;
const glowCtx = sunGlowCanvas.getContext("2d");
// radial gradient: bright yellow center fading to transparent
const gradient = glowCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
gradient.addColorStop(0, "rgba(255, 238, 136, 0.8)");
gradient.addColorStop(0.3, "rgba(255, 200, 80, 0.3)");
gradient.addColorStop(1, "rgba(255, 200, 80, 0)");
glowCtx.fillStyle = gradient;
glowCtx.fillRect(0, 0, 128, 128);
// turn the canvas into a Three.js texture
const sunGlowTexture = new THREE.CanvasTexture(sunGlowCanvas);
// sprites always face the camera, so the glow circle is always visible
const sunGlow = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: sunGlowTexture,
    transparent: true,
    blending: THREE.AdditiveBlending,
  }),
);
// scale up the sprite so the glow extends beyond the sun mesh
sunGlow.scale.set(4, 4, 1);
scene.add(sunGlow);

// LIGHTING
// dim ambient light with a dark blue tint — ensures the dark side of the globe isn't pure black
const ambientLight = new THREE.AmbientLight(0x1a1a30, 0.9);
scene.add(ambientLight);

// directional light simulates sunlight
// position is updated each frame to match the sun
const directionalLight = new THREE.DirectionalLight(0xfff5e0, 1.2);
scene.add(directionalLight);

// hemisphere light: sky color from above, ground color from below
const hemiLight = new THREE.HemisphereLight(0x4466aa, 0x112233, 0.5);
scene.add(hemiLight);

// WORLD GROUP (globe, atmosphere)
// bundles the globe core and atmosphere into a single group
const worldGroup = new THREE.Group();
worldGroup.add(globe);
worldGroup.add(atmosphereLayer1);
worldGroup.add(atmosphereLayer2);
scene.add(worldGroup);

// DAY / NIGHT STUFF
// tracks the current angle of the sun's orbit around the scene
let dayNightAngle = 0;
// how fast the sun orbits (radians per frame)
// lower = slower day night cycle
const DAY_NIGHT_SPEED = 0.0004;
// whether the planet auto-rotates on its axis
// pauses during user drag
let autoRotate = true;

// TERRAIN STATE
// alows terrain mesh to be removed on rebuild
// might be temporary
let currentTerrainMesh = null;

// BUILD WORLD
// reads slider values, tears down old terrain, generates new map, renders it
function buildWorld() {
  const btn = document.getElementById("rebuild-btn");
  btn.disabled = true;
  btn.textContent = "generating...";
  loadingEl.style.display = "block";

  // read all config values from UI sliders
  SPHERE_CONFIG.NUM_POINTS = parseInt(
    document.getElementById("slider-subdivisions").value,
  );
  SPHERE_CONFIG.WAVELENGTH = parseFloat(
    document.getElementById("slider-wavelength").value,
  );
  SPHERE_CONFIG.OCEAN_THRESHOLD = parseFloat(
    document.getElementById("slider-ocean").value,
  );
  SPHERE_CONFIG.NUM_CONTINENTS_MIN = parseInt(
    document.getElementById("slider-cont-min").value,
  );
  SPHERE_CONFIG.NUM_CONTINENTS_MAX = parseInt(
    document.getElementById("slider-cont-max").value,
  );
  const heightScale = parseFloat(
    document.getElementById("slider-height").value,
  );
  SPHERE_CONFIG.RIVER_PERCENTILE = parseFloat(
    document.getElementById("slider-thresh").value,
  );

  // remove old terrain if it exists
  if (currentTerrainMesh) {
    currentTerrainMesh.forEach((m) => worldGroup.remove(m));
    currentTerrainMesh = null;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      // generate map data
      const map = generateSphereMap();
      // render map as a Three.js mesh
      currentTerrainMesh = renderSphereMap(map, worldGroup, { heightScale });
      loadingEl.style.display = "none";
      btn.disabled = false;
      btn.textContent = "rebuild world";
    });
  });
}

// slider value display
document
  .querySelectorAll("#controls-panel input[type='range']")
  .forEach((slider) => {
    const valSpan = document.getElementById(
      "val-" + slider.id.replace("slider-", ""),
    );
    if (valSpan) {
      slider.addEventListener("input", () => {
        valSpan.textContent = slider.value;
      });
    }
  });

// rebuild world on button click
document.getElementById("rebuild-btn").addEventListener("click", buildWorld);

// reset sliders to preset default values
document.getElementById("reset-default-btn").addEventListener("click", () => {
  document.getElementById("slider-subdivisions").value = 6;
  document.getElementById("slider-wavelength").value = 0.6;
  document.getElementById("slider-ocean").value = 0.35;
  document.getElementById("slider-cont-min").value = 4;
  document.getElementById("slider-cont-max").value = 7;
  document.getElementById("slider-height").value = 0.2;
  document.getElementById("slider-thresh").value = 0.98;

  document.getElementById("val-subdivisions").textContent = "6";
  document.getElementById("val-wavelength").textContent = "0.6";
  document.getElementById("val-ocean").textContent = "0.35";
  document.getElementById("val-cont-min").textContent = "4";
  document.getElementById("val-cont-max").textContent = "7";
  document.getElementById("val-height").textContent = "0.2";
  document.getElementById("val-thresh").textContent = 0.98;
});

// kick off the initial world generation on first page load
buildWorld();

// MOUSE CONTROLS
let isDragging = false;
let previousMouse = { x: 0, y: 0 };
// stores rotational velocity for momentum effect
let rotationVelocity = { x: 0, y: 0 };
// mouse position in normalized device coordinates
const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();

// start draggin once mouse is held down
container.addEventListener("mousedown", (e) => {
  isDragging = true;
  previousMouse = { x: e.clientX, y: e.clientY };
  rotationVelocity = { x: 0, y: 0 };
});

// globe rotation on mouse move
container.addEventListener("mousemove", (e) => {
  const rect = container.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  if (isDragging) {
    // how far mouse moved since last frame
    const deltaX = e.clientX - previousMouse.x;
    const deltaY = e.clientY - previousMouse.y;

    // scale rotation speed by zoom level, so that it doesn't rotate at 1000mph at super close zoom
    const zoomFactor = camera.position.z / 2.8;
    const speed = 0.005 * zoomFactor;

    // store velocity for momentum later
    rotationVelocity.x = deltaY * speed;
    rotationVelocity.y = deltaX * speed;

    // rotate the entire scene
    scene.rotation.y += deltaX * speed;
    // clamp vertical rotation so you can't flip past the poles
    // otherwise, you get a lot of weird movement where moving mouse left spins things left instead of right, etc
    scene.rotation.x = Math.max(
      -Math.PI / 2,
      Math.min(Math.PI / 2, scene.rotation.x + deltaY * speed),
    );

    previousMouse = { x: e.clientX, y: e.clientY };
  }
});

// stop movement once mouse is no longer held
container.addEventListener("mouseup", () => {
  isDragging = false;
});

container.addEventListener("mouseleave", () => {
  isDragging = false;
});

// scroll to zoom in n out
// clamped between 0 and 5
container.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    camera.position.z += e.deltaY * 0.001;
    camera.position.z = Math.max(0, Math.min(5, camera.position.z));
  },
  { passive: false },
);

// ANIMATION LOOP
// runs every frame, handles sun orbit, planet rotation, momentum, and rendering
function animate() {
  requestAnimationFrame(animate);

  // sun orbit
  // increment orbit angle each frame, sun moves in a circle at SUN_DISTANCE around origin, slight vertical wobble
  dayNightAngle += DAY_NIGHT_SPEED;
  const sunX = Math.cos(dayNightAngle) * SUN_DISTANCE;
  const sunZ = Math.sin(dayNightAngle) * SUN_DISTANCE;
  const sunY = Math.sin(dayNightAngle * 0.3) * SUN_DISTANCE * 0.2;

  // move sun, sun glow, and directional light all together
  sun.position.set(sunX, sunY, sunZ);
  sunGlow.position.set(sunX, sunY, sunZ);
  directionalLight.position.set(sunX, sunY, sunZ);
  // spin the sun along its axis for slightly more realistic look
  sun.rotation.y += 0.001;

  // planet rotation
  // slowly spin planet along axis when not being actively dragged
  if (autoRotate && !isDragging) {
    worldGroup.rotation.y += 0.0016;
  }

  // momentum
  // when not being dragged, apply slowly decreasing rotation from the last drag
  if (!isDragging) {
    // exponential decay of rotational velocity
    rotationVelocity.x *= 0.95;
    rotationVelocity.y *= 0.95;

    // apply remaining velocity to world rotation
    worldGroup.rotation.x = Math.max(
      -Math.PI / 2,
      Math.min(Math.PI / 2, worldGroup.rotation.x + rotationVelocity.x),
    );
    worldGroup.rotation.y += rotationVelocity.y;

    // once momenum is essentially 0, resume planet rotation
    if (
      Math.abs(rotationVelocity.x) < 0.0001 &&
      Math.abs(rotationVelocity.y) < 0.0001
    ) {
      autoRotate = true;
    }
  }

  // render the frame
  renderer.render(scene, camera);
}

// begin animation loop
animate();

// SUN MESH GENERATOR
// creates a textured sun that looks similar to the planet, uses the same icosphere and noise technique but with sun colors instead of earth colors
function generateSunMesh(radius, subdivisions) {
  const noise = new SimplexNoise();
  // generate an icosphere
  const points = icosphere(subdivisions);
  // d3-geo-voronoi requires [lon, lat] instead of [lat, lon]
  const geoPoints = points.map((p) => [p.lon, p.lat]);
  const voronoi = d3.geoVoronoi(geoPoints);
  // create delaunay triangulation, where each triangle connects 3 point indices
  const delTriangles = voronoi.delaunay.triangles;

  // compute elevation and 3d position for each point
  const elevations = [];
  const positions3D = [];
  for (let i = 0; i < points.length; i++) {
    const { lat, lon } = points[i];
    // convert to xyz on unit sphere
    const pos = sphereLatLonToXYZ(lat, lon, 1);
    // 4 octave 3d noise for surface detail
    let e = 0;
    let amp = 0.5;
    let freq = 4;
    for (let oct = 0; oct < 4; oct++) {
      e += amp * noise.noise3D(pos.x * freq, pos.y * freq, pos.z * freq);
      amp *= 0.5;
      freq *= 2;
    }
    // normalize noise to 0-1 range
    e = 0.5 + e * 0.5;
    elevations[i] = e;
    // displace radius by elevation
    const r = radius + e * 0.15;
    // convert lat/lon to 3d position at displaced radius
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    positions3D[i] = new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta),
    );
  }

  // build flat typed arrays for the gpu
  // 3 vertices per triangle, 3 float components per vertex (position or color)
  const vertCount = delTriangles.length * 3;
  const verts = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);

  for (let i = 0; i < delTriangles.length; i++) {
    const [a, b, c] = delTriangles[i];
    const base = i * 9;

    const triVerts = [a, b, c];
    for (let j = 0; j < 3; j++) {
      const idx = triVerts[j];
      const p = positions3D[idx];
      const e = elevations[idx];

      // position
      verts[base + j * 3] = p.x;
      verts[base + j * 3 + 1] = p.y;
      verts[base + j * 3 + 2] = p.z;

      // color
      colors[base + j * 3] = 0.8 + e * 0.2;
      colors[base + j * 3 + 1] = 0.3 + e * 0.6;
      colors[base + j * 3 + 2] = 0.05 + e * 0.4;
    }
  }

  // create gpu geometry from flat arrays
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  // this material ignores lighting
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
  });

  return new THREE.Mesh(geometry, material);
}

// STAR GENERATOR
// creates field of randomly colored points scattered on a large sphere centered on the origin
function createStars(count) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  // palette of star colors
  const starColors = [
    { r: 1.0, g: 1.0, b: 1.0 }, // white
    { r: 1.0, g: 0.95, b: 0.8 }, // warm white
    { r: 1.0, g: 0.9, b: 0.6 }, // light yellow
    { r: 0.7, g: 0.8, b: 1.0 }, // light blue
    { r: 0.6, g: 0.7, b: 1.0 }, // blue
    { r: 1.0, g: 0.8, b: 0.7 }, // light orange
  ];

  for (let i = 0; i < count; i++) {
    // random position on a sphere of radius 40-60
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 40 + Math.random() * 20;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    // picks a random color from the palette
    const c = starColors[Math.floor(Math.random() * starColors.length)];
    // brightness variation
    colors[i * 3] = c.r * (0.85 + Math.random() * 0.15);
    colors[i * 3 + 1] = c.g * (0.85 + Math.random() * 0.15);
    colors[i * 3 + 2] = c.b * (0.85 + Math.random() * 0.15);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    vertexColors: true,
    // random star size
    size: Math.random() / 4,
    sizeAttenuation: true,
  });

  return new THREE.Points(geometry, material);
}

// window resize handler
// updates camera aspect ratio and rendered size when the browser window size changes
window.addEventListener("resize", () => {
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});
