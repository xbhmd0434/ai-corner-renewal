import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  DEFAULT_TRYON_COMPOSITION,
  TRYON_ANCHORS,
  TRYON_ENTRY_KEY,
  TRYON_LIBRARY,
  TRYON_STORAGE_KEY,
  TRYON_VIEWS
} from "./data.js";

const $ = (selector) => document.querySelector(selector);
const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const state = clone(DEFAULT_TRYON_COMPOSITION);
const canvas = $("#tryonCanvas");
const stage = $("#tryonStage");
const gltfLoader = new GLTFLoader();

let bagRoot;
let charmRoot;
let dragActive = false;
let currentView = state.view;
let toastTimer;
let sampleLoadRevision = 0;
let customBagActive = false;
let customCharmActive = false;
let cameraGoal = new THREE.Vector3(...TRYON_VIEWS.perspective.camera);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0c0d10, 0.075);

const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 50);
camera.position.copy(cameraGoal);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  preserveDrawingBuffer: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.enablePan = false;
controls.minDistance = 3.1;
controls.maxDistance = 7.2;
controls.minPolarAngle = Math.PI * 0.2;
controls.maxPolarAngle = Math.PI * 0.72;
controls.target.set(0, 0.08, 0);

scene.add(new THREE.HemisphereLight(0xf7e8d0, 0x090b0c, 2.15));

const keyLight = new THREE.DirectionalLight(0xffdfbd, 5.1);
keyLight.position.set(-3.4, 5, 5.2);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.near = 0.1;
keyLight.shadow.camera.far = 18;
keyLight.shadow.camera.left = -4;
keyLight.shadow.camera.right = 4;
keyLight.shadow.camera.top = 4;
keyLight.shadow.camera.bottom = -4;
scene.add(keyLight);

const cyanLight = new THREE.DirectionalLight(0x25f4ee, 2.4);
cyanLight.position.set(4, 2.2, -3.5);
scene.add(cyanLight);

const pinkLight = new THREE.PointLight(0xfe2c55, 18, 7, 2);
pinkLight.position.set(-2.7, -0.3, 2.5);
scene.add(pinkLight);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(3.15, 64),
  new THREE.MeshStandardMaterial({
    color: 0x191b20,
    roughness: 0.96,
    transparent: true,
    opacity: 0.94
  })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.03;
floor.receiveShadow = true;
scene.add(floor);

const floorRing = new THREE.Mesh(
  new THREE.RingGeometry(1.58, 1.6, 96),
  new THREE.MeshBasicMaterial({
    color: 0x25f4ee,
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide
  })
);
floorRing.rotation.x = -Math.PI / 2;
floorRing.position.y = -1.015;
scene.add(floorRing);

function material(color, roughness = 0.72, metalness = 0.04) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function lighten(colorValue, amount) {
  const color = new THREE.Color(colorValue);
  const hsl = {};
  color.getHSL(hsl);
  color.setHSL(hsl.h, hsl.s, clamp(hsl.l + amount / 100, 0, 1));
  return color;
}

function roundedRectShape(width, height, radius) {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

function setShadows(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });
}

function createBag(asset) {
  const group = new THREE.Group();
  group.name = asset.id;

  const bodyGeometry = new THREE.ExtrudeGeometry(
    roundedRectShape(2.25, 1.42, 0.26),
    {
      depth: 0.58,
      bevelEnabled: true,
      bevelSegments: 5,
      steps: 1,
      bevelSize: 0.1,
      bevelThickness: 0.09,
      curveSegments: 16
    }
  );
  bodyGeometry.translate(0, 0, -0.29);
  const body = new THREE.Mesh(
    bodyGeometry,
    material(asset.color, 0.84, 0.015)
  );
  body.position.y = -0.02;
  group.add(body);

  const flapGeometry = new THREE.ExtrudeGeometry(
    roundedRectShape(2.02, 0.79, 0.18),
    {
      depth: 0.08,
      bevelEnabled: true,
      bevelSegments: 4,
      bevelSize: 0.05,
      bevelThickness: 0.035,
      curveSegments: 14
    }
  );
  flapGeometry.translate(0, 0, -0.04);
  const flap = new THREE.Mesh(
    flapGeometry,
    material(lighten(asset.color, 12), 0.76, 0.02)
  );
  flap.position.set(0, 0.27, 0.43);
  group.add(flap);

  const handleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.72, 0.6, 0.25),
    new THREE.Vector3(-0.57, 1.31, 0.31),
    new THREE.Vector3(0.57, 1.31, 0.31),
    new THREE.Vector3(0.72, 0.6, 0.25)
  ]);
  group.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(handleCurve, 42, 0.055, 10, false),
      material(lighten(asset.color, -8), 0.8, 0.03)
    )
  );

  const hardware = material(0xbba776, 0.25, 0.78);
  for (const x of [-0.92, 0.92]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.12, 0.026, 10, 32),
      hardware
    );
    ring.position.set(x, 0.56, 0.48);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  }

  const clasp = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 0.055, 24),
    hardware
  );
  clasp.position.set(0, 0.13, 0.52);
  clasp.rotation.x = Math.PI / 2;
  group.add(clasp);

  group.position.y = -0.07;
  setShadows(group);
  return group;
}

function addCharmConnector(group) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.105, 0.025, 10, 32),
    material(0xc8b27d, 0.24, 0.78)
  );
  ring.position.y = -0.06;
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.25, 10),
    material(0x302a27, 0.75, 0.04)
  );
  cord.position.y = -0.22;
  group.add(cord);
}

function createWhale(asset) {
  const group = new THREE.Group();
  addCharmConnector(group);
  const whale = new THREE.Group();
  whale.position.y = -0.52;

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 32, 22),
    material(asset.color, 0.54, 0.02)
  );
  body.scale.set(1.25, 0.72, 0.72);
  whale.add(body);

  const belly = new THREE.Mesh(
    new THREE.SphereGeometry(0.244, 28, 18),
    material(0xb8d5d8, 0.68, 0.01)
  );
  belly.position.set(0.035, -0.07, 0.085);
  belly.scale.set(1.2, 0.58, 0.63);
  whale.add(belly);

  for (const angle of [-0.42, 0.42]) {
    const tail = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.3, 4),
      material(lighten(asset.color, -7), 0.58, 0.02)
    );
    tail.position.set(-0.39, 0.02 + angle * 0.07, 0);
    tail.rotation.z = Math.PI / 2 + angle;
    tail.rotation.y = Math.PI / 4;
    whale.add(tail);
  }
  group.add(whale);
  return group;
}

function createFlower(asset) {
  const group = new THREE.Group();
  addCharmConnector(group);
  const flower = new THREE.Group();
  flower.position.y = -0.51;
  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2;
    const petal = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 20, 14),
      material(asset.color, 0.78, 0.01)
    );
    petal.position.set(Math.cos(angle) * 0.19, Math.sin(angle) * 0.19, 0);
    petal.scale.set(1, 0.72, 0.48);
    petal.rotation.z = angle;
    flower.add(petal);
  }
  const center = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 24, 16),
    material(0x8b6040, 0.67, 0.03)
  );
  center.position.z = 0.08;
  flower.add(center);
  group.add(flower);
  return group;
}

function createStar(asset) {
  const shape = new THREE.Shape();
  for (let index = 0; index < 10; index += 1) {
    const angle = Math.PI / 2 + index * Math.PI / 5;
    const radius = index % 2 === 0 ? 0.32 : 0.145;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const group = new THREE.Group();
  addCharmConnector(group);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.12,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.035,
    bevelThickness: 0.025
  });
  geometry.translate(0, 0, -0.06);
  const star = new THREE.Mesh(geometry, material(asset.color, 0.28, 0.64));
  star.position.y = -0.52;
  star.rotation.z = 0.12;
  group.add(star);
  return group;
}

function normalizeLoadedModel(object, role) {
  const wrapper = new THREE.Group();
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const targetSize = role === "bag" ? 2.25 : 0.72;
  object.position.sub(center);
  object.scale.multiplyScalar(
    targetSize / Math.max(size.x, size.y, size.z, 0.0001)
  );
  if (role === "bag") {
    object.position.y -= 0.05;
  } else {
    object.position.y -= 0.42;
    addCharmConnector(wrapper);
  }
  wrapper.add(object);
  setShadows(wrapper);
  return wrapper;
}

function markCharmMeshes(object) {
  object.traverse((child) => {
    if (child.isMesh) child.userData.tryonAttachment = true;
  });
}

function findBag(id) {
  return (
    TRYON_LIBRARY.bags.find((item) => item.id === id) ||
    TRYON_LIBRARY.bags[0]
  );
}

function findCharm(id) {
  return (
    TRYON_LIBRARY.charms.find((item) => item.id === id) ||
    TRYON_LIBRARY.charms[0]
  );
}

function replaceBag(id, customObject = null, customName = null) {
  if (bagRoot) scene.remove(bagRoot);
  const asset = findBag(id);
  bagRoot = customObject
    ? normalizeLoadedModel(customObject, "bag")
    : createBag(asset);
  bagRoot.userData.assetId = id;
  scene.add(bagRoot);
  state.base_model_id = id;
  customBagActive = Boolean(customObject);
  $("#activeBagName").textContent = customName || asset.name;
  renderAssets();
  updateSourceCopy();
  markDirty();
}

function replaceCharm(
  id,
  customObject = null,
  customName = null,
  fromSample = false
) {
  if (!fromSample) sampleLoadRevision += 1;
  if (charmRoot) scene.remove(charmRoot);
  const asset = findCharm(id);
  if (customObject) {
    charmRoot = normalizeLoadedModel(customObject, "charm");
  } else if (id === "charm-flower-02") {
    charmRoot = createFlower(asset);
  } else if (id === "charm-star-03") {
    charmRoot = createStar(asset);
  } else {
    charmRoot = createWhale(asset);
  }
  charmRoot.userData.assetId = id;
  markCharmMeshes(charmRoot);
  scene.add(charmRoot);
  state.attachment_model_id = id;
  customCharmActive = Boolean(customObject);
  $("#activeCharmName").textContent = customName || asset.name;
  applyTransform();
  renderAssets();
  updateSourceCopy();
  updateFitMessage();
  markDirty();
}

function loadHunyuanSample() {
  const revision = ++sampleLoadRevision;
  gltfLoader.load(
    "/ai-corner-renewal/apps/web/assets/models/little-blue-whale-v1-shape.glb",
    (gltf) => {
      if (
        revision !== sampleLoadRevision ||
        state.attachment_model_id !== "charm-whale-01"
      ) {
        return;
      }
      const savedAt = state.saved_at;
      replaceCharm(
        "charm-whale-01",
        gltf.scene,
        "小蓝鲸",
        true
      );
      customCharmActive = false;
      if (savedAt) {
        state.saved_at = savedAt;
        markSaved(new Date(savedAt));
      }
      $("#tryonRuntime").className = "tryon-runtime is-live";
      $("#tryonRuntime").innerHTML = "<i></i>混元样例";
      $("#modelSource").textContent = "挂件：本机 Hunyuan GLB · 包：演示模型";
    },
    undefined,
    () => {
      $("#tryonRuntime").className = "tryon-runtime is-demo";
      $("#tryonRuntime").innerHTML = "<i></i>Demo 几何";
      $("#modelSource").textContent = "模型未载入，已使用演示几何";
    }
  );
}

function renderAssets() {
  $("#bagAssets").innerHTML = TRYON_LIBRARY.bags
    .map(
      (asset) => `
        <button class="tryon-asset ${
          asset.id === state.base_model_id ? "active" : ""
        }" type="button" data-bag-id="${asset.id}">
          <span class="tryon-asset__visual" style="--asset-color:${asset.color}"></span>
          <span><strong>${asset.name}</strong><small>${asset.source}</small></span>
        </button>
      `
    )
    .join("");

  $("#charmAssets").innerHTML = TRYON_LIBRARY.charms
    .map(
      (asset) => `
        <button class="tryon-asset ${
          asset.id === state.attachment_model_id ? "active" : ""
        }" type="button" data-charm-id="${asset.id}">
          <span class="tryon-asset__visual" style="--asset-color:${asset.color}"></span>
          <span><strong>${asset.name}</strong><small>${asset.source}</small></span>
        </button>
      `
    )
    .join("");
}

function renderAnchors() {
  $("#tryonAnchors").innerHTML = TRYON_ANCHORS.map(
    (anchor) => `
      <button class="tryon-anchor ${
        anchor.id === state.anchor_id ? "active" : ""
      }" type="button" data-anchor-id="${anchor.id}">${anchor.label}</button>
    `
  ).join("");
}

function renderViews() {
  $("#tryonViews").innerHTML = Object.entries(TRYON_VIEWS)
    .map(
      ([id, view]) => `
        <button class="tryon-view ${
          id === currentView ? "active" : ""
        }" type="button" data-view-id="${id}">${view.label}</button>
      `
    )
    .join("");
}

function applyTransform() {
  if (!charmRoot) return;
  charmRoot.position.set(...state.transform.position);
  charmRoot.rotation.set(...state.transform.rotation);
  charmRoot.scale.setScalar(state.transform.scale);
  syncControlValues();
}

function syncControlValues() {
  const [x, y] = state.transform.position;
  $("#positionX").value = x;
  $("#positionY").value = y;
  $("#positionXValue").textContent = signed(x);
  $("#positionYValue").textContent = signed(y);
  $("#rotationValue").textContent = `${Math.round(
    THREE.MathUtils.radToDeg(state.transform.rotation[2])
  )}°`.replace("-", "−");
  $("#scaleValue").textContent = `${Math.round(
    state.transform.scale * 100
  )}%`;
  renderAnchors();
}

function signed(value) {
  const number = Number(value);
  return `${number >= 0 ? "+" : "−"}${Math.abs(number).toFixed(2)}`;
}

function selectAnchor(id) {
  const anchor = TRYON_ANCHORS.find((item) => item.id === id);
  if (!anchor) return;
  state.anchor_id = id;
  state.transform.position = [...anchor.position];
  applyTransform();
  updateFitMessage();
  markDirty();
  showToast(`已吸附到${anchor.name}`);
}

function setView(id, immediate = false) {
  const view = TRYON_VIEWS[id];
  if (!view) return;
  currentView = id;
  state.view = id;
  cameraGoal = new THREE.Vector3(...view.camera);
  if (immediate) camera.position.copy(cameraGoal);
  renderViews();
  if (!immediate) markDirty();
}

function markDirty() {
  state.saved_at = null;
  const saveState = $("#tryonSaveState");
  saveState.classList.remove("saved");
  saveState.innerHTML = "<i></i>未保存";
}

function markSaved(date) {
  const saveState = $("#tryonSaveState");
  saveState.classList.add("saved");
  saveState.innerHTML = `<i></i>${date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

function saveComposition() {
  state.saved_at = new Date().toISOString();
  localStorage.setItem(TRYON_STORAGE_KEY, JSON.stringify(state));
  markSaved(new Date(state.saved_at));
  showToast(
    customBagActive || customCharmActive
      ? "已保存摆放关系；本地 GLB 刷新后需要重新载入"
      : "已保存到本地橱窗，两个模型仍保持独立"
  );
}

function restoreComposition() {
  const raw = localStorage.getItem(TRYON_STORAGE_KEY);
  if (!raw) {
    showToast("还没有保存过试搭");
    return;
  }
  try {
    const saved = JSON.parse(raw);
    if (saved.schema_version !== "tryon-composition.v1") {
      throw new Error("schema");
    }
    const restored = clone(saved);
    const missingLocalBag = !TRYON_LIBRARY.bags.some(
      ({ id }) => id === restored.base_model_id
    );
    const missingLocalCharm = !TRYON_LIBRARY.charms.some(
      ({ id }) => id === restored.attachment_model_id
    );
    if (missingLocalBag) {
      restored.base_model_id = DEFAULT_TRYON_COMPOSITION.base_model_id;
    }
    if (missingLocalCharm) {
      restored.attachment_model_id =
        DEFAULT_TRYON_COMPOSITION.attachment_model_id;
    }
    if (!TRYON_VIEWS[restored.view]) {
      restored.view = DEFAULT_TRYON_COMPOSITION.view;
    }
    if (
      !Array.isArray(restored.transform?.position) ||
      restored.transform.position.length !== 3 ||
      !restored.transform.position.every(Number.isFinite) ||
      !Array.isArray(restored.transform?.rotation) ||
      restored.transform.rotation.length !== 3 ||
      !restored.transform.rotation.every(Number.isFinite) ||
      !Number.isFinite(restored.transform.scale)
    ) {
      throw new Error("transform");
    }
    restored.transform.scale = clamp(restored.transform.scale, 0.55, 1.65);
    restored.anchor_id =
      restored.anchor_id === "free" ||
      TRYON_ANCHORS.some(({ id }) => id === restored.anchor_id)
        ? restored.anchor_id
        : DEFAULT_TRYON_COMPOSITION.anchor_id;

    Object.assign(state, restored);
    replaceBag(state.base_model_id);
    replaceCharm(state.attachment_model_id);
    Object.assign(state, restored);
    setView(state.view || "perspective", true);
    applyTransform();
    markSaved(new Date(state.saved_at));
    if (state.attachment_model_id === "charm-whale-01") {
      loadHunyuanSample();
    }
    showToast(
      missingLocalBag || missingLocalCharm
        ? "已恢复摆放；本地 GLB 需重新载入，暂用演示模型"
        : "已恢复上次保存的模型和摆放"
    );
  } catch {
    showToast("保存版本不兼容，当前试搭没有被覆盖");
  }
}

function updateFitMessage() {
  const [x, y] = state.transform.position;
  const scale = state.transform.scale;
  let message = "挂点关系清楚，当前比例适中。";
  if (Math.abs(x) < 0.42 && y > 0.38) {
    message = "当前位置靠近包口，可能影响拿取。";
  } else if (scale > 1.35) {
    message = "挂件视觉比例偏大，建议缩小后再比较。";
  } else if (scale < 0.7) {
    message = "挂件偏小，多视角下存在感较弱。";
  } else if (y < -0.28) {
    message = "位置偏低，实际使用时可能发生摆动碰撞。";
  }
  $("#fitMessage").textContent =
    `${message}真实尺寸和承重请在购买前复核。`;
}

function updateSourceCopy() {
  const bag = findBag(state.base_model_id);
  const charm = findCharm(state.attachment_model_id);
  const context = state.source_context || {};
  $("#tryonSource span").textContent =
    context.kind === "video"
      ? `来自 ${context.author_display || "当前视频"}`
      : "来自我的橱窗";
  $("#tryonSource strong").textContent = `${charm.name} × ${bag.name}`;
}

function readEntryContext() {
  try {
    const raw = sessionStorage.getItem(TRYON_ENTRY_KEY);
    if (!raw) return;
    const context = JSON.parse(raw);
    state.source_context = {
      kind: context.kind === "video" ? "video" : "library",
      provider: "douyin_static_demo",
      external_content_id: context.external_content_id || null,
      timestamp_ms: Number(context.timestamp_ms || 0),
      author_display: context.author_display || null
    };
  } catch {
    state.source_context = clone(
      DEFAULT_TRYON_COMPOSITION.source_context
    );
  }
}

function showToast(message) {
  const toast = $("#tryonToast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function adjustRotation(degrees) {
  state.transform.rotation[2] = clamp(
    state.transform.rotation[2] + THREE.MathUtils.degToRad(degrees),
    -Math.PI,
    Math.PI
  );
  applyTransform();
  updateFitMessage();
  markDirty();
}

function adjustScale(delta) {
  state.transform.scale = clamp(
    state.transform.scale + delta,
    0.55,
    1.65
  );
  applyTransform();
  updateFitMessage();
  markDirty();
}

async function loadGlb(file, role) {
  const buffer = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    gltfLoader.parse(
      buffer,
      "",
      (gltf) => {
        const name = file.name.replace(/\.glb$/i, "");
        if (role === "bag") {
          replaceBag(`local-bag-${file.name}`, gltf.scene, name);
        } else {
          replaceCharm(
            `local-charm-${file.name}`,
            gltf.scene,
            name
          );
        }
        $("#tryonRuntime").className = "tryon-runtime is-live";
        $("#tryonRuntime").innerHTML = "<i></i>本地 GLB";
        $("#modelSource").textContent =
          `${role === "bag" ? "包" : "挂件"}：本地文件 · 仅本次会话`;
        showToast(`${file.name} 已在浏览器内载入，不会上传`);
        resolve();
      },
      reject
    );
  });
}

function exportPreview() {
  renderer.render(scene, camera);
  const link = document.createElement("a");
  link.download = `3D试搭-${new Date().toISOString().slice(0, 10)}.png`;
  link.href = renderer.domElement.toDataURL("image/png");
  link.click();
  showToast("当前视角已导出为 PNG");
}

function bindUi() {
  $("#tryonBack").addEventListener("click", () => {
    if (document.referrer && history.length > 1) history.back();
    else window.location.href = "./index.html";
  });

  $("#bagAssets").addEventListener("click", (event) => {
    const button = event.target.closest("[data-bag-id]");
    if (!button) return;
    replaceBag(button.dataset.bagId);
  });

  $("#charmAssets").addEventListener("click", (event) => {
    const button = event.target.closest("[data-charm-id]");
    if (!button) return;
    replaceCharm(button.dataset.charmId);
    if (button.dataset.charmId === "charm-whale-01") {
      loadHunyuanSample();
    } else {
      $("#tryonRuntime").className = "tryon-runtime is-demo";
      $("#tryonRuntime").innerHTML = "<i></i>Demo 几何";
      $("#modelSource").textContent = "挂件与包：可交互演示几何";
    }
  });

  $("#tryonAnchors").addEventListener("click", (event) => {
    const button = event.target.closest("[data-anchor-id]");
    if (button) selectAnchor(button.dataset.anchorId);
  });

  $("#tryonViews").addEventListener("click", (event) => {
    const button = event.target.closest("[data-view-id]");
    if (button) setView(button.dataset.viewId);
  });

  $("#positionX").addEventListener("input", (event) => {
    state.transform.position[0] = Number(event.target.value);
    state.anchor_id = "free";
    applyTransform();
    updateFitMessage();
    markDirty();
  });

  $("#positionY").addEventListener("input", (event) => {
    state.transform.position[1] = Number(event.target.value);
    state.anchor_id = "free";
    applyTransform();
    updateFitMessage();
    markDirty();
  });

  $("#rotateLeft").addEventListener("click", () => adjustRotation(-15));
  $("#rotateRight").addEventListener("click", () => adjustRotation(15));
  $("#scaleDown").addEventListener("click", () => adjustScale(-0.1));
  $("#scaleUp").addEventListener("click", () => adjustScale(0.1));
  $("#saveTryon").addEventListener("click", saveComposition);
  $("#restoreTryon").addEventListener("click", restoreComposition);
  $("#exportTryon").addEventListener("click", exportPreview);

  for (const [selector, role] of [
    ["#bagGlbInput", "bag"],
    ["#charmGlbInput", "charm"]
  ]) {
    $(selector).addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        await loadGlb(file, role);
      } catch (error) {
        console.error("GLB load failed:", error);
        showToast("这个 GLB 没能读取，请检查文件");
      }
      event.target.value = "";
    });
  }
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const dragPlane = new THREE.Plane(
  new THREE.Vector3(0, 0, 1),
  -0.74
);
const dragPoint = new THREE.Vector3();

function updatePointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

canvas.addEventListener(
  "pointerdown",
  (event) => {
    if (!charmRoot) return;
    updatePointer(event);
    const hit = raycaster
      .intersectObject(charmRoot, true)
      .some((item) => item.object.userData.tryonAttachment);
    if (!hit) return;
    event.stopPropagation();
    dragActive = true;
    controls.enabled = false;
    canvas.setPointerCapture(event.pointerId);
    $("#dragHint").classList.add("hidden");
  },
  true
);

canvas.addEventListener("pointermove", (event) => {
  if (!dragActive) return;
  updatePointer(event);
  if (!raycaster.ray.intersectPlane(dragPlane, dragPoint)) return;
  state.anchor_id = "free";
  state.transform.position[0] = clamp(dragPoint.x, -1.3, 1.3);
  state.transform.position[1] = clamp(dragPoint.y, -0.65, 1.1);
  applyTransform();
  updateFitMessage();
  markDirty();
});

function endDrag(event) {
  if (!dragActive) return;
  dragActive = false;
  controls.enabled = true;
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
}

canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

const resizeObserver = new ResizeObserver(() => {
  const { width, height } = stage.getBoundingClientRect();
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
});
resizeObserver.observe(stage);

function animate() {
  requestAnimationFrame(animate);
  if (!dragActive && camera.position.distanceTo(cameraGoal) > 0.015) {
    camera.position.lerp(cameraGoal, 0.075);
  }
  controls.update();
  renderer.render(scene, camera);
}

function init() {
  readEntryContext();
  renderAssets();
  renderAnchors();
  renderViews();
  bindUi();
  replaceBag(state.base_model_id);
  replaceCharm(state.attachment_model_id);
  setView(state.view, true);
  applyTransform();
  updateFitMessage();
  updateSourceCopy();
  $("#tryonSaveState").innerHTML = "<i></i>未保存";
  loadHunyuanSample();
  animate();
}

init();
