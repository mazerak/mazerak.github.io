// globe setup
const container = document.getElementById("globe-container");
const loadingEl = document.getElementById("loading");
const width = container.clientWidth;
const height = container.clientHeight;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f0f0f);

const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
camera.position.z = 3.25;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(width, height);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

// globe sphere
const globeGeometry = new THREE.SphereGeometry(0.1, 64, 64);
const globeMaterial = new THREE.MeshPhongMaterial({
  color: 0x1a1a2e,
  emissive: 0x545454,
  shininess: 15,
});
const globe = new THREE.Mesh(globeGeometry, globeMaterial);

// atmosphere sphere
const atmosGeometry = new THREE.SphereGeometry(1.075, 64, 64);
const atmosMaterial = new THREE.MeshBasicMaterial({
  color: 0x87cefa,
  transparent: true,
  opacity: 0.15,
  side: THREE.BackSide,
});
const atmosphere = new THREE.Mesh(atmosGeometry, atmosMaterial);

// stars
const stars = createStars(5000);
scene.add(stars);

// sun
const SUN_DISTANCE = 40;
// radius, subdivisions
const sun = generateSunMesh(3, 4);
scene.add(sun);

const sunGlowCanvas = document.createElement("canvas");
sunGlowCanvas.width = 128;
sunGlowCanvas.height = 128;
const glowCtx = sunGlowCanvas.getContext("2d");
const gradient = glowCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
gradient.addColorStop(0, "rgba(255, 238, 136, 0.8)");
gradient.addColorStop(0.3, "rgba(255, 200, 80, 0.3)");
gradient.addColorStop(1, "rgba(255, 200, 80, 0)");
glowCtx.fillStyle = gradient;
glowCtx.fillRect(0, 0, 128, 128);
const sunGlowTexture = new THREE.CanvasTexture(sunGlowCanvas);
const sunGlow = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: sunGlowTexture,
    transparent: true,
    blending: THREE.AdditiveBlending,
  }),
);
sunGlow.scale.set(4, 4, 1);
scene.add(sunGlow);

// lighting
const ambientLight = new THREE.AmbientLight(0x1a1a30, 0.9);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xfff5e0, 1.2);
scene.add(directionalLight);

const hemiLight = new THREE.HemisphereLight(0x4466aa, 0x112233, 0.5);
scene.add(hemiLight);

// synchronized world group (globe, atmosphere)
const worldGroup = new THREE.Group();
worldGroup.add(globe);
worldGroup.add(atmosphere);
scene.add(worldGroup);

let dayNightAngle = 0;
const DAY_NIGHT_SPEED = 0.0004;
let autoRotate = true;

let currentTerrainMesh = null;

function buildWorld() {
  const btn = document.getElementById("rebuild-btn");
  btn.disabled = true;
  btn.textContent = "generating...";
  loadingEl.style.display = "block";

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

  // remove old terrain if it exists
  if (currentTerrainMesh) {
    currentTerrainMesh.forEach((m) => worldGroup.remove(m));
    currentTerrainMesh = null;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const map = generateSphereMap();
      currentTerrainMesh = renderSphereMap(map, worldGroup, { heightScale });
      loadingEl.style.display = "none";
      btn.disabled = false;
      btn.textContent = "rebuild world";
    });
  });
}

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

document.getElementById("rebuild-btn").addEventListener("click", buildWorld);

document.getElementById("reset-default-btn").addEventListener("click", () => {
  document.getElementById("slider-subdivisions").value = 6;
  document.getElementById("slider-wavelength").value = 0.6;
  document.getElementById("slider-ocean").value = 0.35;
  document.getElementById("slider-cont-min").value = 4;
  document.getElementById("slider-cont-max").value = 7;
  document.getElementById("slider-height").value = 0.15;

  document.getElementById("val-subdivisions").textContent = "6";
  document.getElementById("val-wavelength").textContent = "0.6";
  document.getElementById("val-ocean").textContent = "0.35";
  document.getElementById("val-cont-min").textContent = "4";
  document.getElementById("val-cont-max").textContent = "7";
  document.getElementById("val-height").textContent = "0.15";
});

buildWorld();

// mouse controls
let isDragging = false;
let previousMouse = { x: 0, y: 0 };
let rotationVelocity = { x: 0, y: 0 };
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
    const deltaX = e.clientX - previousMouse.x;
    const deltaY = e.clientY - previousMouse.y;

    const zoomFactor = camera.position.z / 2.8;
    const speed = 0.005 * zoomFactor;

    rotationVelocity.x = deltaY * speed;
    rotationVelocity.y = deltaX * speed;

    scene.rotation.y += deltaX * speed;
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
container.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    camera.position.z += e.deltaY * 0.001;
    camera.position.z = Math.max(0, Math.min(5, camera.position.z));
  },
  { passive: false },
);

// animation loop
function animate() {
  requestAnimationFrame(animate);

  dayNightAngle += DAY_NIGHT_SPEED;
  const sunX = Math.cos(dayNightAngle) * SUN_DISTANCE;
  const sunZ = Math.sin(dayNightAngle) * SUN_DISTANCE;
  const sunY = Math.sin(dayNightAngle * 0.3) * SUN_DISTANCE * 0.2;

  sun.position.set(sunX, sunY, sunZ);
  sunGlow.position.set(sunX, sunY, sunZ);
  directionalLight.position.set(sunX, sunY, sunZ);

  if (autoRotate && !isDragging) {
    worldGroup.rotation.y += 0.0016;
  }

  if (!isDragging) {
    rotationVelocity.x *= 0.95;
    rotationVelocity.y *= 0.95;

    worldGroup.rotation.x = Math.max(
      -Math.PI / 2,
      Math.min(Math.PI / 2, worldGroup.rotation.x + rotationVelocity.x),
    );
    worldGroup.rotation.y += rotationVelocity.y;

    if (
      Math.abs(rotationVelocity.x) < 0.0001 &&
      Math.abs(rotationVelocity.y) < 0.0001
    ) {
      autoRotate = true;
    }
  }

  renderer.render(scene, camera);
}

animate();

// generate sun helper function
function generateSunMesh(radius, subdivisions) {
  const noise = new SimplexNoise();
  const points = icosphere(subdivisions);
  const geoPoints = points.map((p) => [p.lon, p.lat]);
  const voronoi = d3.geoVoronoi(geoPoints);
  const delTriangles = voronoi.delaunay.triangles;

  const elevations = [];
  const positions3D = [];
  for (let i = 0; i < points.length; i++) {
    const { lat, lon } = points[i];
    const pos = sphereLatLonToXYZ(lat, lon, 1);
    let e = 0;
    let amp = 0.5;
    let freq = 4;
    for (let oct = 0; oct < 4; oct++) {
      e += amp * noise.noise3D(pos.x * freq, pos.y * freq, pos.z * freq);
      amp *= 0.5;
      freq *= 2;
    }
    e = 0.5 + e * 0.5;
    elevations[i] = e;
    const r = radius + e * 0.15;
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    positions3D[i] = new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta),
    );
  }

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

      verts[base + j * 3] = p.x;
      verts[base + j * 3 + 1] = p.y;
      verts[base + j * 3 + 2] = p.z;

      colors[base + j * 3] = 0.8 + e * 0.2;
      colors[base + j * 3 + 1] = 0.3 + e * 0.6;
      colors[base + j * 3 + 2] = 0.05 + e * 0.4;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
  });

  return new THREE.Mesh(geometry, material);
}

// generate stars helper function
function createStars(count) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  const starColors = [
    { r: 1.0, g: 1.0, b: 1.0 }, // white
    { r: 1.0, g: 0.95, b: 0.8 }, // warm white
    { r: 1.0, g: 0.9, b: 0.6 }, // light yellow
    { r: 0.7, g: 0.8, b: 1.0 }, // light blue
    { r: 0.6, g: 0.7, b: 1.0 }, // blue
    { r: 1.0, g: 0.8, b: 0.7 }, // light orange
  ];

  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 40 + Math.random() * 20;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    const c = starColors[Math.floor(Math.random() * starColors.length)];
    colors[i * 3] = c.r * (0.85 + Math.random() * 0.15);
    colors[i * 3 + 1] = c.g * (0.85 + Math.random() * 0.15);
    colors[i * 3 + 2] = c.b * (0.85 + Math.random() * 0.15);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    vertexColors: true,
    size: Math.random() / 4,
    sizeAttenuation: true,
  });

  return new THREE.Points(geometry, material);
}

// ── Handle Resize ──
window.addEventListener("resize", () => {
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});
