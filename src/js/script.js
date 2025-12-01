import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { RectAreaLightHelper } from 'three/examples/jsm/helpers/RectAreaLightHelper.js';
import GUI from 'lil-gui';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x121212); // slightly lighter to help visibility

// Status HUD helper
function updateStatus(text, subtext) {
  try {
    const el = document.getElementById('status');
    if (!el) return;
    el.innerHTML = text + (subtext ? '<br/><small style="opacity:0.8">' + subtext + '</small>' : '');
  } catch (e) {
    console.log('Status update failed', e);
  }
}
updateStatus('Starting…', 'Use mouse + scroll to orbit — WASD/QE disabled by default');

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(2, 2, 4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = true; // enable shadows
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Use physically correct lights and ACES tone mapping for realistic PBR results
renderer.physicallyCorrectLights = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

// Initialize area light uniforms so RectAreaLight works correctly
RectAreaLightUniformsLib.init();

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Raycaster + pointer helpers for click-to-look
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let lookLerp = { active: false, start: new THREE.Vector3(), end: new THREE.Vector3(), startTime: 0.0, duration: 250 };

// Free-look (Unity-like) flags
// free look variables removed; OrbitControls handles view rotation

// No pointer lock; we'll use OrbitControls + keyboard movement for a free camera

// Lighting: Hemisphere + Directional (shadows) + subtle rim light
const hemiLight = new THREE.HemisphereLight(0xeeeeff, 0x444444, 1.2);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 2.2);
// Move the main directional light to the left side, so it lights the model from the left
dirLight.position.set(-8, 12, 8);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
const d = 40;
dirLight.shadow.camera.left = -d;
dirLight.shadow.camera.right = d;
dirLight.shadow.camera.top = d;
dirLight.shadow.camera.bottom = -d;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 100;
scene.add(dirLight);

const rimLight = new THREE.PointLight(0xffe7d6, 0.6, 25);
rimLight.position.set(-8, 6, -6);
scene.add(rimLight);

// Add a subtle ambient fallback to ensure scene isn't fully dark
const fallbackAmbient = new THREE.AmbientLight(0xffffff, 0.12);
scene.add(fallbackAmbient);

// GLTF model loader
const loader = new GLTFLoader();

// 👇 import your model (Parcel requires using URL import)
import modelUrl from '../models/b123_ff.glb';

loader.load(
  modelUrl,
  (gltf) => {
    const model = gltf.scene;
    // Convert or tune materials to be PBR-friendly and enable shadows
    updateStatus('Model loaded, preparing...');
    model.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        if (obj.material) {
          if (!(obj.material.isMeshStandardMaterial || obj.material.isMeshPhysicalMaterial)) {
            // Keep the texture map if there is one when converting
            obj.material = new THREE.MeshStandardMaterial({ map: obj.material.map, color: obj.material.color || new THREE.Color(0xffffff) });
          }
          // Provide sensible defaults for roughness/metalness when missing
          obj.material.roughness = (obj.material.roughness !== undefined) ? obj.material.roughness : 0.7;
          obj.material.metalness = (obj.material.metalness !== undefined) ? obj.material.metalness : 0.0;
          obj.material.needsUpdate = true;
        }
      }
    });
    scene.add(model);

    // Center and scale the model nicely in view
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    model.position.sub(center);
    camera.position.set(0, size.y * 0.6, size.z * 1.8);
    // place pointer lock starting position a bit further back so you're not inside the model
    // Initialize camera starting position in front of model
    camera.position.set(0, Math.max(1.6, size.y * 0.6), size.z * 1.8);
    controls.target.set(0, size.y * 0.3, 0);
    controls.update();

    console.log('✅ Model loaded successfully');
    updateStatus('Model loaded', `size: ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`);
    console.log(`Model size: ${size.toArray().join(', ')}`);

    // Ensure meshes receive shadows and convert materials to MeshStandardMaterial for PBR
    model.traverse(obj => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        if (obj.material && !(obj.material.isMeshStandardMaterial || obj.material.isMeshPhysicalMaterial)) {
          obj.material = new THREE.MeshStandardMaterial({ map: obj.material.map, color: obj.material.color || new THREE.Color(0xffffff) });
        }
      }
    });

    // Create 3 RectAreaLights spaced along the model width and placed above it
    const areaLights = [];
    // Make area lights smaller rectangles for more focused lighting
    const areaWidth = Math.max(size.x / 4, 0.5);
    const areaHeight = Math.max(size.y / 4, 0.3);
    const xSpacing = Math.max(size.x / 2, areaWidth + 0.5);
    const lightIntensity = 6; // increase area light intensity default to ensure visibility
    const yAbove = Math.max(size.y, 1) + 1.0; // a little above the model
    // Move the area lights slightly back of the model (negative z is behind the model because camera is at +z)
    const zFront = Math.max(size.z, 1) * 0.6;

    // Move the area lights slightly left by default; tweak `lightXOffset` to adjust
    const lightXOffset = -xSpacing / 2; // shift left by half the spacing
    const xs = [-xSpacing + lightXOffset, 0 + lightXOffset, xSpacing + lightXOffset];
    for (let i = 0; i < 3; i++) {
      const area = new THREE.RectAreaLight(0xffffff, lightIntensity, areaWidth, areaHeight);
      area.position.set(xs[i], yAbove, zFront);
      area.lookAt(0, 0, 0);
      scene.add(area);
      areaLights.push(area);

      // helper to visualize area light (optional to remove in production)
      const helper = new RectAreaLightHelper(area);
      area.add(helper);
    }

    // When the area lights are created, capture per-light orientation settings (degrees) for GUI
    const areaParams = areaLights.map(a => ({
      rotX: THREE.MathUtils.radToDeg(a.rotation.x),
      rotY: THREE.MathUtils.radToDeg(a.rotation.y),
      rotZ: THREE.MathUtils.radToDeg(a.rotation.z)
    }));

    // Note: No scene collision or invisible floor for free camera mode

    // ---- Setup pointer lock UI and movement variables ----
    // pointer lock / overlay references removed - OrbitControls + Keyboard used

    // (Local key handlers removed) - global handlers are used instead

    // Free camera mode: no collision resolution / player radius required

    // Duplicate updateControls removed; using OrbitControls only
    // Add a 'C' key to recenter player in front of the model
    document.addEventListener('keydown', (ev) => {
      if (ev.code === 'KeyC') {
        const startY = Math.max(1.6, globalSize.y * 0.6);
        const startZ = globalSize.z * 1.5;
        camera.position.set(0, startY, startZ);
        controls.target.set(0, globalSize.y * 0.3, 0);
        console.log('Camera recentered to model front.');
      }
    });
    // Create a GUI to control the three area lights and main lighting
    const gui = new GUI();
    settings = {
      intensity: lightIntensity,
      color: '#ffffff',
      width: areaWidth,
      height: areaHeight,
      xOffset: lightXOffset,
      yAbove: yAbove,
      zFront: zFront,
      dirIntensity: dirLight.intensity,
      dirX: dirLight.position.x,
      showHelpers: true,
      floorVisible: false
    };
    function applySettings() {
      for (let i = 0; i < areaLights.length; i++) {
        const area = areaLights[i];
        area.width = settings.width;
        area.height = settings.height;
        area.intensity = settings.intensity;
        area.color.set(settings.color);
        const xPos = xs[i] + settings.xOffset;
        // use zFront: positive z places light in front of model (camera side)
        area.position.set(xPos, settings.yAbove, Math.max(1, settings.zFront));
        // apply rotation overrides from areaParams (degrees -> radians)
        const p = areaParams[i];
        area.rotation.set(THREE.MathUtils.degToRad(p.rotX), THREE.MathUtils.degToRad(p.rotY), THREE.MathUtils.degToRad(p.rotZ));
        if (area.children.length > 0) area.children.forEach(child => child.update && child.update());
      }
      dirLight.intensity = settings.dirIntensity;
      dirLight.position.x = settings.dirX;
      areaLights.forEach((a) => {
        a.children.forEach((c) => c.visible = settings.showHelpers);
      });
      // toggle invisible floor visibility
      const floorMesh = scene.getObjectByName('invisibleFloor');
      if (floorMesh) floorMesh.material.opacity = settings.floorVisible ? 0.5 : 0.0;
    }
    // area lights folder
    const areaFolder = gui.addFolder('Area Lights');
    areaFolder.add(settings, 'intensity', 0, 20, 0.1).onChange(applySettings);
    areaFolder.addColor(settings, 'color').onChange(applySettings);
    areaFolder.add(settings, 'width', 0.1, globalSize.x).onChange(applySettings);
    areaFolder.add(settings, 'height', 0.1, globalSize.y).onChange(applySettings);
    areaFolder.add(settings, 'xOffset', -globalSize.x, globalSize.x).onChange(applySettings);
    areaFolder.add(settings, 'yAbove', 0, globalSize.y + 5).onChange(applySettings);
    areaFolder.add(settings, 'zFront', 0, globalSize.z * 1.5).name('z front').onChange(applySettings);
    areaFolder.add(settings, 'showHelpers').onChange(applySettings);
    areaFolder.open();
    // Create rotation subfolders per light
    for (let i = 0; i < areaLights.length; i++) {
      const p = areaParams[i];
      const lf = areaFolder.addFolder(`Light ${i+1} Orientation`);
      lf.add(p, 'rotX', -180, 180, 1).name('rot X (deg)').onChange(applySettings);
      lf.add(p, 'rotY', -180, 180, 1).name('rot Y (deg)').onChange(applySettings);
      lf.add(p, 'rotZ', -180, 180, 1).name('rot Z (deg)').onChange(applySettings);
      lf.open();
    }
    // vertical speed control removed (was part of free-flight controls)
    // directional light folder
    const dirFolder = gui.addFolder('Directional Light');
    dirFolder.add(settings, 'dirIntensity', 0, 3, 0.01).onChange(applySettings);
    dirFolder.add(settings, 'dirX', -20, 20, 0.1).name('dirX').onChange(applySettings);
    dirFolder.add(settings, 'floorVisible').name('floor visible').onChange(applySettings);
    dirFolder.open();
    // Movement settings (disabled — OrbitControls only)
    // initialize GUI values to apply immediately
    // update global size now that the model loaded
    globalSize.copy(size);
    applySettings();
  },
  (xhr) => console.log(`Loading model: ${(xhr.loaded / xhr.total * 100).toFixed(2)}%`),
  (err) => {
    console.error(' Error loading GLB:', err);
    updateStatus('Model failed to load', err.message || err);
    // Do not add fallback geometry — keep scene clean and advise the user
    camera.position.set(2, 2, 4);
    controls.target.set(0, 0, 0);
    controls.update();
    // make sure globalSize isn't zero (helps any GUI ranges)
    globalSize.set(1, 1, 1);
  }
);

// Ground plane removed per request. If you want a floor later, add a low-contrast plane here.

let prevTime = performance.now();

// Default size in case the model fails to load
let globalSize = new THREE.Vector3(1, 1, 1);

// Default settings available before GUI loads
const defaultSettings = {
  intensity: 6,
  color: '#ffffff',
  width: 1,
  height: 1,
  xOffset: 0,
  yAbove: 1,
  zFront: 1,
  dirIntensity: dirLight ? dirLight.intensity : 1.6,
  dirX: dirLight ? dirLight.position.x : -8,
  showHelpers: true,
  floorVisible: false
};
let settings = Object.assign({}, defaultSettings);

// Resize handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  // optional: slowly rotate directional light to create subtle dynamic lighting
  // dirLight.position.applyAxisAngle(new THREE.Vector3(0,1,0), 0.0005);
  const time = performance.now();
  const delta = (time - prevTime) / 1000;
  // handle look lerp to smoothly move OrbitControls target
  if (lookLerp.active) {
    const now = performance.now();
    const t = Math.min(1, (now - lookLerp.startTime) / lookLerp.duration);
    controls.target.lerpVectors(lookLerp.start, lookLerp.end, t);
    if (t >= 1) lookLerp.active = false;
    // update controls after target moved so camera orients accordingly this frame
    controls.update();
  }
  prevTime = time;
  // If the scene is black for the user, show the HUD and helper info
  renderer.render(scene, camera);
}
animate();

// Add pointerdown event to set OrbitControls target to clicked world position
renderer.domElement.addEventListener('pointerdown', (ev) => {
  // Only handle left mouse button
  if (ev.button !== 0) return;
  // normalize pointer coords
  pointer.x = (ev.clientX / window.innerWidth) * 2 - 1;
  pointer.y = - (ev.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(scene.children, true);
  let targetPoint;
  if (intersects.length > 0) {
    targetPoint = intersects[0].point.clone();
  } else {
    // no intersection: set a point 10 units in front of camera as fallback position
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    targetPoint = camera.position.clone().add(dir.multiplyScalar(10));
  }
  // setup lerp from current to new target for smooth rotation in ms
  lookLerp.start.copy(controls.target);
  lookLerp.end.copy(targetPoint);
  lookLerp.startTime = performance.now();
  lookLerp.duration = 250; // ms
  lookLerp.active = true;
});
