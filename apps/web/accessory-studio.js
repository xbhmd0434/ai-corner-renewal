import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  BAG_ANCHORS,
  DEFAULT_COMPOSITION,
  MODEL_LIBRARY,
  STORAGE_KEY,
  VIEW_PRESETS
} from "./data/accessory-demo-data.js";

const $ = (selector) => document.querySelector(selector);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const clone = (value) => JSON.parse(JSON.stringify(value));
const canvas = $("#studioCanvas");
const viewport = $("#viewportWrap");
const loader = new GLTFLoader();
const state = clone(DEFAULT_COMPOSITION);

let bagRoot;
let charmRoot;
let currentView = state.view;
let dragActive = false;
let toastTimer;
let statusTimer;
let sourceImageUrl;
let sampleLoadRevision = 0;
let cameraGoal = new THREE.Vector3(...VIEW_PRESETS.perspective.camera);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x1d231f, 0.075);

const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 50);
camera.position.copy(cameraGoal);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  preserveDrawingBuffer: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.enablePan = false;
controls.minDistance = 3;
controls.maxDistance = 8;
controls.minPolarAngle = Math.PI * 0.2;
controls.maxPolarAngle = Math.PI * 0.72;
controls.target.set(0, 0.13, 0);

const hemiLight = new THREE.HemisphereLight(0xf9ecd6, 0x141a16, 2.35);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xffe3bd, 5.2);
keyLight.position.set(-3.5, 5, 5.5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.near = 0.1;
keyLight.shadow.camera.far = 18;
keyLight.shadow.camera.left = -4;
keyLight.shadow.camera.right = 4;
keyLight.shadow.camera.top = 4;
keyLight.shadow.camera.bottom = -4;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x8cbcc3, 3.1);
rimLight.position.set(4, 2.4, -4);
scene.add(rimLight);

const warmLight = new THREE.PointLight(0xeb7c49, 22, 8, 2);
warmLight.position.set(-2.8, -.4, 2.7);
scene.add(warmLight);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(3.1, 64),
  new THREE.MeshStandardMaterial({
    color: 0x222a24,
    roughness: .96,
    metalness: 0,
    transparent: true,
    opacity: .92
  })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.03;
floor.receiveShadow = true;
scene.add(floor);

const halo = new THREE.Mesh(
  new THREE.RingGeometry(1.55, 1.58, 96),
  new THREE.MeshBasicMaterial({ color: 0x8ea07f, transparent: true, opacity: .19, side: THREE.DoubleSide })
);
halo.rotation.x = -Math.PI / 2;
halo.position.y = -1.015;
scene.add(halo);

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

function material(color, roughness = .72, metalness = .04) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function setShadows(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });
}

function buildBag(asset) {
  const group = new THREE.Group();
  group.name = asset.id;

  const bodyGeometry = new THREE.ExtrudeGeometry(roundedRectShape(2.25, 1.42, .26), {
    depth: .58,
    bevelEnabled: true,
    bevelSegments: 5,
    steps: 1,
    bevelSize: .1,
    bevelThickness: .09,
    curveSegments: 16
  });
  bodyGeometry.translate(0, 0, -.29);
  const body = new THREE.Mesh(bodyGeometry, material(asset.color, .85, .015));
  body.position.y = -.02;
  group.add(body);

  const flapGeometry = new THREE.ExtrudeGeometry(roundedRectShape(2.02, .79, .18), {
    depth: .08,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: .05,
    bevelThickness: .035,
    curveSegments: 14
  });
  flapGeometry.translate(0, 0, -.04);
  const flap = new THREE.Mesh(flapGeometry, material(lightenHex(asset.color, 12), .77, .02));
  flap.position.set(0, .27, .43);
  group.add(flap);

  const seamMaterial = new THREE.LineBasicMaterial({ color: 0xc8a883, transparent: true, opacity: .6 });
  const seamPoints = [
    new THREE.Vector3(-.9, -.03, .496),
    new THREE.Vector3(-.9, .47, .496),
    new THREE.Vector3(.9, .47, .496),
    new THREE.Vector3(.9, -.03, .496)
  ];
  const seam = new THREE.Line(new THREE.BufferGeometry().setFromPoints(seamPoints), seamMaterial);
  group.add(seam);

  const curveFront = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-.72, .6, .25),
    new THREE.Vector3(-.57, 1.31, .31),
    new THREE.Vector3(.57, 1.31, .31),
    new THREE.Vector3(.72, .6, .25)
  ]);
  const handle = new THREE.Mesh(
    new THREE.TubeGeometry(curveFront, 42, .055, 10, false),
    material(lightenHex(asset.color, -7), .8, .03)
  );
  group.add(handle);

  const hardwareMaterial = material(0xbba776, .25, .78);
  for (const x of [-.92, .92]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.12, .026, 10, 32), hardwareMaterial);
    ring.position.set(x, .56, .48);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  }

  const clasp = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, .055, 24), hardwareMaterial);
  clasp.position.set(0, .13, .52);
  clasp.rotation.x = Math.PI / 2;
  group.add(clasp);

  const sideA = new THREE.Mesh(new THREE.CapsuleGeometry(.11, .9, 5, 12), material(lightenHex(asset.color, -12), .82));
  sideA.position.set(-1.08, -.05, 0);
  sideA.rotation.z = -.1;
  group.add(sideA);
  const sideB = sideA.clone();
  sideB.position.x = 1.08;
  sideB.rotation.z = .1;
  group.add(sideB);

  group.position.y = -.07;
  setShadows(group);
  return group;
}

function makeCord(group) {
  const cordMaterial = material(0x3b312a, .72, .06);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.105, .025, 10, 32), material(0xc8b27d, .24, .78));
  ring.position.y = -.06;
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .25, 10), cordMaterial);
  cord.position.y = -.22;
  group.add(cord);
}

function buildWhaleCharm(asset) {
  const group = new THREE.Group();
  makeCord(group);
  const whale = new THREE.Group();
  whale.position.y = -.52;
  const body = new THREE.Mesh(new THREE.SphereGeometry(.3, 32, 22), material(asset.color, .54, .02));
  body.scale.set(1.25, .72, .72);
  whale.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(.244, 28, 18), material(0xb8d5d8, .68, .01));
  belly.position.set(.035, -.07, .085);
  belly.scale.set(1.2, .58, .63);
  whale.add(belly);
  const tailMaterial = material(lightenHex(asset.color, -7), .58, .02);
  for (const angle of [-.42, .42]) {
    const tail = new THREE.Mesh(new THREE.ConeGeometry(.16, .3, 4), tailMaterial);
    tail.position.set(-.39, .02 + angle * .07, 0);
    tail.rotation.z = Math.PI / 2 + angle;
    tail.rotation.y = Math.PI / 4;
    whale.add(tail);
  }
  const fin = new THREE.Mesh(new THREE.ConeGeometry(.1, .26, 4), tailMaterial);
  fin.position.set(.02, -.19, .02);
  fin.rotation.z = Math.PI;
  whale.add(fin);
  for (const z of [-.205, .205]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.025, 12, 8), material(0x131817, .4));
    eye.position.set(.26, .06, z);
    whale.add(eye);
  }
  group.add(whale);
  return group;
}

function buildFlowerCharm(asset) {
  const group = new THREE.Group();
  makeCord(group);
  const flower = new THREE.Group();
  flower.position.y = -.51;
  for (let index = 0; index < 6; index += 1) {
    const angle = index / 6 * Math.PI * 2;
    const petal = new THREE.Mesh(new THREE.SphereGeometry(.16, 20, 14), material(asset.color, .78, .01));
    petal.position.set(Math.cos(angle) * .19, Math.sin(angle) * .19, 0);
    petal.scale.set(1, .72, .48);
    petal.rotation.z = angle;
    flower.add(petal);
  }
  const center = new THREE.Mesh(new THREE.SphereGeometry(.13, 24, 16), material(0x8b6040, .67, .03));
  center.position.z = .08;
  flower.add(center);
  group.add(flower);
  return group;
}

function starShape(outerRadius = .32, innerRadius = .145) {
  const shape = new THREE.Shape();
  for (let index = 0; index < 10; index += 1) {
    const angle = Math.PI / 2 + index * Math.PI / 5;
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function buildStarCharm(asset) {
  const group = new THREE.Group();
  makeCord(group);
  const geometry = new THREE.ExtrudeGeometry(starShape(), {
    depth: .12,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: .035,
    bevelThickness: .025
  });
  geometry.translate(0, 0, -.06);
  const star = new THREE.Mesh(geometry, material(asset.color, .28, .64));
  star.position.y = -.52;
  star.rotation.z = .12;
  group.add(star);
  return group;
}

function lightenHex(hex, amount) {
  const color = new THREE.Color(hex);
  const hsl = {};
  color.getHSL(hsl);
  color.setHSL(hsl.h, hsl.s, clamp(hsl.l + amount / 100, 0, 1));
  return color;
}

function markCharmMeshes(object) {
  object.traverse((child) => {
    if (child.isMesh) child.userData.attachmentHitTarget = true;
  });
}

function replaceBag(assetId, customObject = null, customName = null) {
  if (bagRoot) scene.remove(bagRoot);
  const asset = MODEL_LIBRARY.bags.find((item) => item.id === assetId) || MODEL_LIBRARY.bags[0];
  bagRoot = customObject ? normalizeLoadedModel(customObject, "bag") : buildBag(asset);
  bagRoot.userData.assetId = assetId;
  scene.add(bagRoot);
  state.baseModelId = assetId;
  $("#activeBagName").textContent = customName || asset.name;
  renderAssetLists();
  markDirty();
}

function replaceCharm(assetId, customObject = null, customName = null, fromSample = false) {
  if (!fromSample) sampleLoadRevision += 1;
  if (charmRoot) scene.remove(charmRoot);
  const asset = MODEL_LIBRARY.charms.find((item) => item.id === assetId) || MODEL_LIBRARY.charms[0];
  if (customObject) {
    charmRoot = normalizeLoadedModel(customObject, "charm");
  } else if (assetId.includes("flower")) {
    charmRoot = buildFlowerCharm(asset);
  } else if (assetId.includes("star")) {
    charmRoot = buildStarCharm(asset);
  } else {
    charmRoot = buildWhaleCharm(asset);
  }
  charmRoot.userData.assetId = assetId;
  markCharmMeshes(charmRoot);
  scene.add(charmRoot);
  state.attachmentModelId = assetId;
  $("#activeCharmName").textContent = customName || asset.name;
  applyTransform();
  renderAssetLists();
  updateFitReadout();
  markDirty();
}

function normalizeLoadedModel(object, kind) {
  const wrapper = new THREE.Group();
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const targetSize = kind === "bag" ? 2.25 : .72;
  const scale = targetSize / Math.max(size.x, size.y, size.z, .0001);
  object.position.sub(center);
  object.scale.multiplyScalar(scale);
  if (kind === "bag") object.position.y -= .05;
  else {
    object.position.y -= .42;
    makeCord(wrapper);
  }
  wrapper.add(object);
  setShadows(wrapper);
  return wrapper;
}

function renderAssetLists() {
  $("#bagAssetList").innerHTML = MODEL_LIBRARY.bags.map((asset) => `
    <button class="asset-card ${asset.id === state.baseModelId ? "is-active" : ""}" data-bag-id="${asset.id}" type="button">
      <span class="asset-card-visual" style="--asset-color:${asset.color}"></span>
      <span class="asset-card-copy">
        <strong>${asset.name}</strong>
        <small>${asset.dimensionsCm.width} × ${asset.dimensionsCm.height} × ${asset.dimensionsCm.depth} CM</small>
      </span>
    </button>
  `).join("");

  $("#charmAssetList").innerHTML = MODEL_LIBRARY.charms.map((asset) => `
    <button class="asset-card ${asset.id === state.attachmentModelId ? "is-active" : ""}" data-charm-id="${asset.id}" type="button">
      <span class="asset-card-visual" style="--asset-color:${asset.color}"></span>
      <span class="asset-card-copy"><strong>${asset.name.replace("挂件", "")}</strong><small>${asset.source}</small></span>
    </button>
  `).join("");
}

function renderAnchorButtons() {
  $("#anchorButtons").innerHTML = BAG_ANCHORS.map((anchor) => `
    <button class="anchor-button ${anchor.id === state.anchorId ? "is-active" : ""}" data-anchor-id="${anchor.id}" type="button">${anchor.shortName}</button>
  `).join("");
}

function renderViewButtons() {
  $("#viewButtons").innerHTML = Object.entries(VIEW_PRESETS).map(([id, preset]) => `
    <button class="view-button ${id === currentView ? "is-active" : ""}" data-view-id="${id}" type="button">${preset.label}</button>
  `).join("");
}

function applyTransform() {
  if (!charmRoot) return;
  const [x, y, z] = state.transform.position;
  const [rx, ry, rz] = state.transform.rotation;
  charmRoot.position.set(x, y, z);
  charmRoot.rotation.set(rx, ry, rz);
  charmRoot.scale.setScalar(state.transform.scale);
  syncControlValues();
}

function syncControlValues() {
  const [x, y] = state.transform.position;
  $("#positionX").value = x;
  $("#positionY").value = y;
  $("#positionXValue").textContent = formatSigned(x);
  $("#positionYValue").textContent = formatSigned(y);
  $("#rotationValue").textContent = `${Math.round(THREE.MathUtils.radToDeg(state.transform.rotation[2]))}°`.replace("-", "−");
  $("#scaleValue").textContent = `${Math.round(state.transform.scale * 100)}%`;
  renderAnchorButtons();
}

function formatSigned(value) {
  const number = Number(value);
  return `${number >= 0 ? "+" : "−"}${Math.abs(number).toFixed(2)}`;
}

function selectAnchor(anchorId) {
  const anchor = BAG_ANCHORS.find((item) => item.id === anchorId);
  if (!anchor) return;
  state.anchorId = anchor.id;
  state.transform.position = [...anchor.position];
  if (anchor.id === "right-ring") state.transform.position[1] -= .24;
  if (anchor.id === "handle-knot") state.transform.position[1] -= .12;
  applyTransform();
  updateFitReadout();
  markDirty();
  announce(`已吸附到${anchor.name}`);
}

function setView(viewId, immediate = false) {
  const preset = VIEW_PRESETS[viewId];
  if (!preset) return;
  currentView = viewId;
  state.view = viewId;
  cameraGoal = new THREE.Vector3(...preset.camera);
  if (immediate) camera.position.copy(cameraGoal);
  renderViewButtons();
  if (!immediate) markDirty();
}

function markDirty() {
  state.savedAt = null;
  $("#saveState").classList.remove("is-saved");
  $("#saveState").innerHTML = "<i></i> 有未保存调整";
}

function markSaved(date) {
  $("#saveState").classList.add("is-saved");
  $("#saveState").innerHTML = `<i></i> 已保存 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
}

function saveComposition() {
  state.savedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  markSaved(new Date(state.savedAt));
  showToast("试搭方案已保存：两个模型仍保持独立，可随时替换。");
}

function restoreComposition() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    showToast("还没有保存过试搭方案。");
    return;
  }
  try {
    const saved = JSON.parse(raw);
    if (saved.schemaVersion !== 1) throw new Error("schema");
    Object.assign(state, clone(saved));
    replaceBag(state.baseModelId);
    replaceCharm(state.attachmentModelId);
    Object.assign(state, clone(saved));
    setView(state.view || "perspective", true);
    applyTransform();
    markSaved(new Date(state.savedAt));
    if (state.attachmentModelId === "charm-whale-01") loadHunyuanSample();
    showToast("已恢复上次保存的包、挂件和摆放位置。");
  } catch {
    showToast("保存数据版本不兼容，已保留当前方案。");
  }
}

function resetComposition() {
  Object.assign(state, clone(DEFAULT_COMPOSITION));
  replaceBag(state.baseModelId);
  replaceCharm(state.attachmentModelId);
  setView("perspective");
  applyTransform();
  markDirty();
  loadHunyuanSample();
  showToast("已恢复默认试搭，已保存版本没有被删除。");
}

function updateFitReadout() {
  const [x, y] = state.transform.position;
  const scale = state.transform.scale;
  let score = 94;
  const notes = [];
  if (Math.abs(x) < .42 && y > .35) {
    score -= 14;
    notes.push(["warn", "靠近开口，可能影响拿取"]);
  } else {
    notes.push(["good", "挂点关系清楚，不遮挡开口"]);
  }
  if (scale > 1.35) {
    score -= 12;
    notes.push(["warn", "挂件偏大，容易抢过包体视觉"]);
  } else if (scale < .72) {
    score -= 7;
    notes.push(["warn", "挂件偏小，多视角下存在感较弱"]);
  } else {
    notes.push(["good", "挂件比例适中"]);
  }
  if (y < -.25) {
    score -= 8;
    notes.push(["warn", "位置偏低，实际使用时可能摆动碰撞"]);
  } else {
    notes.push(["warn", "真实尺寸需在购买前复核"]);
  }
  score = clamp(score, 55, 98);
  $("#fitScore").textContent = score;
  $(".fit-score i").style.setProperty("--score", `${score}%`);
  $("#fitNotes").innerHTML = notes.map(([type, text]) => `<li class="${type}">${text}</li>`).join("");
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

function announce(message) {
  const status = $("#viewportStatus");
  status.textContent = message;
  status.classList.add("is-visible");
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => status.classList.remove("is-visible"), 1300);
}

function adjustRotation(deltaDegrees) {
  state.transform.rotation[2] = clamp(
    state.transform.rotation[2] + THREE.MathUtils.degToRad(deltaDegrees),
    -Math.PI,
    Math.PI
  );
  applyTransform();
  updateFitReadout();
  markDirty();
}

function adjustScale(delta) {
  state.transform.scale = clamp(state.transform.scale + delta, .55, 1.65);
  applyTransform();
  updateFitReadout();
  markDirty();
}

async function loadGlbFile(file, kind) {
  const buffer = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    loader.parse(buffer, "", (gltf) => {
      if (kind === "bag") {
        const customId = `custom-bag-${file.name}`;
        replaceBag(customId, gltf.scene, file.name.replace(/\.glb$/i, ""));
        $("#renderSource").textContent = `包：本地 GLB · 挂件：${activeCharm().source}`;
      } else {
        const customId = `custom-charm-${file.name}`;
        replaceCharm(customId, gltf.scene, file.name.replace(/\.glb$/i, ""));
        $("#renderSource").textContent = `挂件：本地 GLB · 包：${activeBag().source}`;
      }
      showToast(`${file.name} 已在浏览器内加载，不会上传。`);
      resolve();
    }, reject);
  });
}

function activeBag() {
  return MODEL_LIBRARY.bags.find((item) => item.id === state.baseModelId) || MODEL_LIBRARY.bags[0];
}

function activeCharm() {
  return MODEL_LIBRARY.charms.find((item) => item.id === state.attachmentModelId) || MODEL_LIBRARY.charms[0];
}

function loadHunyuanSample() {
  const revision = ++sampleLoadRevision;
  loader.load(
    "./assets/models/little-blue-whale-v1-shape.glb",
    (gltf) => {
      if (revision !== sampleLoadRevision || state.attachmentModelId !== "charm-whale-01") return;
      const savedAt = state.savedAt;
      replaceCharm("charm-whale-01", gltf.scene, "小蓝鲸挂件", true);
      if (savedAt) {
        state.savedAt = savedAt;
        markSaved(new Date(savedAt));
      }
      $("#renderSource").textContent = "挂件：本机混元 GLB · 包：演示几何";
      announce("本机混元 GLB 已载入");
    },
    undefined,
    (error) => {
      console.warn("Hunyuan sample GLB unavailable; using procedural fallback.", error);
      $("#renderSource").textContent = "混元样例未载入，已使用演示几何";
    }
  );
}

async function checkHunyuanRuntime() {
  const ribbon = $("#runtimeRibbon");
  try {
    const response = await fetch("/api/runtime/hunyuan", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const runtime = await response.json();
    if (runtime.status === "ready") {
      ribbon.innerHTML = `
        <span class="pulse"></span>
        <span><b>本机引擎</b> ${runtime.engine} 已就绪</span>
        <small>RTX 4060 · SHAPE ONLY</small>
      `;
      return;
    }
    ribbon.classList.add("is-limited");
    ribbon.innerHTML = `
      <span class="pulse"></span>
      <span><b>样例模式</b> 可预览，暂不能生成</span>
      <small>CHECK LOCAL RUNTIME</small>
    `;
  } catch {
    ribbon.classList.add("is-limited");
    ribbon.innerHTML = `
      <span class="pulse"></span>
      <span><b>预览模式</b> 混元状态待重启后确认</span>
      <small>3D COMPOSER AVAILABLE</small>
    `;
  }
}

function wireUi() {
  $("#bagAssetList").addEventListener("click", (event) => {
    const card = event.target.closest("[data-bag-id]");
    if (!card) return;
    replaceBag(card.dataset.bagId);
    $("#renderSource").textContent = "当前为可交互演示几何";
    announce(`已换成${activeBag().name}`);
  });

  $("#charmAssetList").addEventListener("click", (event) => {
    const card = event.target.closest("[data-charm-id]");
    if (!card) return;
    replaceCharm(card.dataset.charmId);
    $("#renderSource").textContent = "当前为可交互演示几何";
    if (card.dataset.charmId === "charm-whale-01") loadHunyuanSample();
    announce(`已换成${activeCharm().name}`);
  });

  $("#anchorButtons").addEventListener("click", (event) => {
    const button = event.target.closest("[data-anchor-id]");
    if (button) selectAnchor(button.dataset.anchorId);
  });

  $("#viewButtons").addEventListener("click", (event) => {
    const button = event.target.closest("[data-view-id]");
    if (button) setView(button.dataset.viewId);
  });

  $("#positionX").addEventListener("input", (event) => {
    state.transform.position[0] = Number(event.target.value);
    state.anchorId = "free";
    applyTransform();
    updateFitReadout();
    markDirty();
  });
  $("#positionY").addEventListener("input", (event) => {
    state.transform.position[1] = Number(event.target.value);
    state.anchorId = "free";
    applyTransform();
    updateFitReadout();
    markDirty();
  });

  $("#rotateLeftButton").addEventListener("click", () => adjustRotation(-15));
  $("#rotateRightButton").addEventListener("click", () => adjustRotation(15));
  $("#scaleDownButton").addEventListener("click", () => adjustScale(-.1));
  $("#scaleUpButton").addEventListener("click", () => adjustScale(.1));
  $("#saveButton").addEventListener("click", saveComposition);
  $("#restoreButton").addEventListener("click", restoreComposition);
  $("#resetButton").addEventListener("click", resetComposition);
  $("#snapshotButton").addEventListener("click", exportSnapshot);

  $("#bagGlbInput").addEventListener("change", async (event) => {
    const [file] = event.target.files;
    if (!file) return;
    try {
      await loadGlbFile(file, "bag");
    } catch (error) {
      console.error(error);
      showToast("这个 GLB 没能读取，请确认文件没有损坏。");
    }
    event.target.value = "";
  });

  $("#charmGlbInput").addEventListener("change", async (event) => {
    const [file] = event.target.files;
    if (!file) return;
    try {
      await loadGlbFile(file, "charm");
    } catch (error) {
      console.error(error);
      showToast("这个 GLB 没能读取，请确认文件没有损坏。");
    }
    event.target.value = "";
  });

  $("#sourceImageInput").addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (!file) return;
    if (sourceImageUrl) URL.revokeObjectURL(sourceImageUrl);
    sourceImageUrl = URL.createObjectURL(file);
    const drop = $(".capture-drop");
    drop.style.backgroundImage = `linear-gradient(rgba(12,15,13,.18),rgba(12,15,13,.5)),url("${sourceImageUrl}")`;
    drop.classList.add("has-image");
    $("#capturePreview").textContent = file.name;
    $("#queueGenerationButton").disabled = false;
    $("#captureNote").textContent = "图片已通过前端校验。点击后会给出本机生成命令；完成的 GLB 可直接载入上方橱窗。";
  });

  $("#queueGenerationButton").addEventListener("click", () => {
    $("#captureNote").innerHTML = "已就绪：在项目目录运行 <code>npm run generate:3d -- --input &lt;图片路径&gt; --output apps/web/assets/models/item.glb</code>";
    showToast("本机生成入口已准备好；网页不会直接获得你的系统执行权限。");
  });

  window.addEventListener("keydown", (event) => {
    if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
    const delta = event.shiftKey ? .1 : .03;
    if (event.key === "ArrowLeft") state.transform.position[0] -= delta;
    else if (event.key === "ArrowRight") state.transform.position[0] += delta;
    else if (event.key === "ArrowUp") state.transform.position[1] += delta;
    else if (event.key === "ArrowDown") state.transform.position[1] -= delta;
    else return;
    event.preventDefault();
    state.anchorId = "free";
    state.transform.position[0] = clamp(state.transform.position[0], -1.35, 1.35);
    state.transform.position[1] = clamp(state.transform.position[1], -.65, 1.25);
    applyTransform();
    updateFitReadout();
    markDirty();
  });
}

function exportSnapshot() {
  renderer.render(scene, camera);
  const link = document.createElement("a");
  link.download = `挂件试搭-${new Date().toISOString().slice(0, 10)}.png`;
  link.href = renderer.domElement.toDataURL("image/png");
  link.click();
  showToast("当前视角已导出为 PNG。");
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -.72);
const dragPoint = new THREE.Vector3();

function updatePointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = (event.clientX - rect.left) / rect.width * 2 - 1;
  pointer.y = -(event.clientY - rect.top) / rect.height * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

canvas.addEventListener("pointerdown", (event) => {
  if (!charmRoot) return;
  updatePointer(event);
  const hits = raycaster.intersectObject(charmRoot, true);
  if (!hits.some((hit) => hit.object.userData.attachmentHitTarget)) return;
  event.stopPropagation();
  dragActive = true;
  controls.enabled = false;
  canvas.setPointerCapture(event.pointerId);
  $("#dragTip").classList.add("is-hidden");
  announce("正在移动挂件");
}, true);

canvas.addEventListener("pointermove", (event) => {
  if (!dragActive) return;
  updatePointer(event);
  if (!raycaster.ray.intersectPlane(dragPlane, dragPoint)) return;
  state.anchorId = "free";
  state.transform.position[0] = clamp(dragPoint.x, -1.35, 1.35);
  state.transform.position[1] = clamp(dragPoint.y, -.65, 1.25);
  applyTransform();
  updateFitReadout();
  markDirty();
});

function endDrag(event) {
  if (!dragActive) return;
  dragActive = false;
  controls.enabled = true;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  announce("位置已更新");
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

const resizeObserver = new ResizeObserver(() => {
  const { width, height } = viewport.getBoundingClientRect();
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
});
resizeObserver.observe(viewport);

function animate() {
  requestAnimationFrame(animate);
  if (!dragActive && camera.position.distanceTo(cameraGoal) > .015) {
    camera.position.lerp(cameraGoal, .075);
  }
  controls.update();
  renderer.render(scene, camera);
}

function initialize() {
  renderAssetLists();
  renderAnchorButtons();
  renderViewButtons();
  wireUi();
  replaceBag(state.baseModelId);
  replaceCharm(state.attachmentModelId);
  setView(state.view, true);
  applyTransform();
  updateFitReadout();
  $("#saveState").innerHTML = "<i></i> 尚未保存";
  checkHunyuanRuntime();
  loadHunyuanSample();
  animate();
}

initialize();
