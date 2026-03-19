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
const globeGeometry = new THREE.SphereGeometry(1, 64, 64);
const globeMaterial = new THREE.MeshPhongMaterial({
  color: 0x1a1a2e,
  emissive: 0x545454,
  shininess: 15,
});
const globe = new THREE.Mesh(globeGeometry, globeMaterial);

// atmosphere sphere
const atmosGeometry = new THREE.SphereGeometry(1.02, 64, 64);
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

// generate map and project onto globe
setTimeout(() => {
  const map = generateSphereMap();
  const cellMeshes = renderSphereMap(map, worldGroup);
  loadingEl.style.display = "none";
  console.log(
    `Generated ${map.numRegions} regions, rendered ${cellMeshes.length} cells`,
  );
}, 50); // small delay so "generating world..." renders first

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
    camera.position.z = Math.max(1.2, Math.min(5, camera.position.z));
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
