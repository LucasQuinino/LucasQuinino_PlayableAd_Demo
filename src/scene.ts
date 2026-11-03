import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as THREE from "three";
import { createPlayerAnimation } from "./playerAnimation";

//#region SCENE CONFIGURATION
// Create the scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xD2E5FF);//new THREE.Color(0x87ceeb);

// Create the camera
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);

camera.position.set(0, 15, 12);
camera.lookAt(0, 0, 0);

// Create the renderer
const renderer = new THREE.WebGLRenderer({
  antialias: false
});

renderer.setPixelRatio(
  Math.min(window.devicePixelRatio, 1.5)
);

renderer.setSize(
  window.innerWidth,
  window.innerHeight
);

// Add the canvas to the page
document.querySelector("#game")!.appendChild(
  renderer.domElement
);

// Add lighting
const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
directionalLight.position.set(15,10,15);
directionalLight.target.position.set(0, 0, 0)

scene.add(new THREE.HemisphereLight(0xffffff, 0x607080, 0.5));
scene.add(directionalLight);
scene.add(directionalLight.target);
//#endregion

/* const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200, 1, 1),
        new THREE.MeshStandardMaterial({color: THREE.Color.NAMES.lightgreen, roughness: 0.5})
);
ground.rotation.set(-THREE.MathUtils.degToRad(90), 0, 0);

scene.add(ground); */

//#region Create the player
const player = new THREE.Group();
scene.add(player);

let playerAnimation: ReturnType<typeof createPlayerAnimation> | null = null;

const loader = new GLTFLoader();

loader.load(
  "/models/SK_Player_Character.glb",
  (gltf) => {
    const model = gltf.scene;

    player.add(model);

    playerAnimation = createPlayerAnimation(
        model,
        gltf.animations
    );
  },
  undefined,
  (error) => {
    console.error("Error loading player model:", error);
  }
  
);

//player.position.y = 0.4;
//#endregion

// Resize the scene when the browser changes size
function resize() {
  const game = document.querySelector("#game")!;

  const width = game.clientWidth;
  const height = game.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
}

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(document.querySelector("#game")!);

// Export the objects other modules need
export {
  scene,
  camera,
  renderer,
  player,
  playerAnimation
};