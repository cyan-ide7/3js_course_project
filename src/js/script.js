import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202020);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(2, 2, 4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Lighting
const ambient = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambient);
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(5, 10, 5);
scene.add(dirLight);

// GLTF model loader
const loader = new GLTFLoader();

// 👇 import your model (Parcel requires using URL import)
import modelUrl from '../models/b123_ff.glb';

loader.load(
  modelUrl,
  (gltf) => {
    const model = gltf.scene;
    scene.add(model);

    // Center and scale the model nicely in view
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    model.position.sub(center);
    camera.position.set(0, size.y * 0.6, size.z * 1.5);
    controls.target.set(0, size.y * 0.3, 0);
    controls.update();

    console.log('✅ Model loaded successfully');
  },
  (xhr) => console.log(`Loading model: ${(xhr.loaded / xhr.total * 100).toFixed(2)}%`),
  (err) => console.error('❌ Error loading GLB:', err)
);

// Resize handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
