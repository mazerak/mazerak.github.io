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

// lighting
const ambientLight = new THREE.AmbientLight(0x404060, 0.6);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
directionalLight.position.set(5, 3, 5);
scene.add(directionalLight);

// synchronized world group (globe, atmosphere)
const worldGroup = new THREE.Group();
worldGroup.add(globe);
worldGroup.add(atmosphere);
scene.add(worldGroup);

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

    worldGroup.rotation.y += deltaX * speed;
    worldGroup.rotation.x = Math.max(
      -Math.PI / 2,
      Math.min(Math.PI / 2, worldGroup.rotation.x + deltaY * speed),
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

  if (!isDragging) {
    rotationVelocity.x *= 0.95;
    rotationVelocity.y *= 0.95;

    worldGroup.rotation.x = Math.max(
      -Math.PI / 2,
      Math.min(Math.PI / 2, worldGroup.rotation.x + rotationVelocity.x),
    );
    worldGroup.rotation.y += rotationVelocity.y;
  }

  renderer.render(scene, camera);
}

animate();

// ── Handle Resize ──
window.addEventListener("resize", () => {
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});
