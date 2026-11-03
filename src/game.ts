
import * as THREE from "three";

import {
  scene,
  camera,
  renderer,
  player,
  playerAnimation
} from "./scene";

import { createSnowSystem } from "./snow";

import { createCombatSystem } from "./combat";

import { createHUD } from "./hud";

import { createEndScreen } from "./endScreen";

// Game timing
const clock = new THREE.Clock();

//#region JOYSTICK SETTINGS
const gameArea = document.querySelector<HTMLDivElement>(
  "#game"
)!;

const joystick = document.querySelector<HTMLDivElement>(
  "#joystick"
)!;

const knob = document.querySelector<HTMLDivElement>(
  "#joystick-knob"
)!;

const joystickInput = new THREE.Vector2();

let joystickActive = false;
let activePointerId: number | null = null;

const JOYSTICK_RADIUS = 55;
const KNOB_RADIUS = 23;

function updateJoystick(event: PointerEvent) {
  const rect = gameArea.getBoundingClientRect();

  const centerX = parseFloat(joystick.style.left);
  const centerY = parseFloat(joystick.style.top);

  let x = event.clientX - rect.left - centerX;
  let y = event.clientY - rect.top - centerY;

  const maxDistance = JOYSTICK_RADIUS - KNOB_RADIUS;
  const distance = Math.hypot(x, y);

  if (distance > maxDistance) {
    x = (x / distance) * maxDistance;
    y = (y / distance) * maxDistance;
  }

  joystickInput.set(
    x / maxDistance,
    y / maxDistance
  );

  knob.style.transform = `translate(${x}px, ${y}px)`;
}

// Create joystick wherever the user touches.
gameArea.addEventListener("pointerdown", (event) => {
  if (joystickActive) return;

  joystickActive = true;
  activePointerId = event.pointerId;

  const rect = gameArea.getBoundingClientRect();

  joystick.style.left = `${event.clientX - rect.left}px`;
  joystick.style.top = `${event.clientY - rect.top}px`;

  joystick.style.display = "flex";

  gameArea.setPointerCapture(event.pointerId);

  updateJoystick(event);
});

// Move the joystick knob.
gameArea.addEventListener("pointermove", (event) => {
  if (!joystickActive || event.pointerId !== activePointerId) return;

  updateJoystick(event);
});

// Hide joystick when released.
function resetJoystick() {
  joystickActive = false;
  activePointerId = null;

  joystickInput.set(0, 0);

  joystick.style.display = "none";
  knob.style.transform = "translate(0px, 0px)";
}

gameArea.addEventListener("pointerup", (event) => {
  if (event.pointerId === activePointerId) {
    resetJoystick();
  }
});

gameArea.addEventListener("pointercancel", (event) => {
  if (event.pointerId === activePointerId) {
    resetJoystick();
  }
});
//#endregion

//#region PLAYER MOVEMENT SETTINGS
const MOVE_SPEED = 8;

function movePlayer(deltaTime: number) {
  // Read joystick direction.
  const directionX = joystickInput.x;
  const directionZ = joystickInput.y;

  // Move the player.
  player.position.x += directionX * MOVE_SPEED * deltaTime;
  player.position.z += directionZ * MOVE_SPEED * deltaTime;

  const movementDirection = new THREE.Vector3(directionX, 0, directionZ);
  playerAnimation?.setMoving(
    movementDirection.lengthSq() > 0.001
  );
}

// PLAYER ROTATION SETTINGS
const ROTATION_SPEED = 15;

function updateRotation(deltaTime: number) {
  //const directionX = targetX - player.position.x;
  //const directionZ = targetZ - player.position.z;

  const directionX = (player.position.x + joystickInput.x) - player.position.x;
  const directionZ = (player.position.z + joystickInput.y) - player.position.z;

  // Don't rotate if the player isn't moving.
  if (Math.abs(directionX) < 0.01 &&
      Math.abs(directionZ) < 0.01) return;

  const targetRotation = Math.atan2(directionX, directionZ);

  const angleDifference = THREE.MathUtils.euclideanModulo(targetRotation - player.rotation.y + Math.PI, Math.PI * 2) - Math.PI;

    player.rotation.y += angleDifference * (1 - Math.exp(-ROTATION_SPEED * deltaTime));
}
//#endregion

//#region CAMERA SETTINGS
const CAMERA_FOLLOW_SPEED = 3;
const CAMERA_DEAD_ZONE = 1.0;

const cameraTarget = new THREE.Vector3(0, 0, 0);

function updateCamera(deltaTime: number) {
  const offsetX = player.position.x - cameraTarget.x;
  const offsetZ = player.position.z - cameraTarget.z;

  const distance = Math.hypot(offsetX, offsetZ);

  if (distance > CAMERA_DEAD_ZONE) {
    const excessDistance = distance - CAMERA_DEAD_ZONE;

    const directionX = offsetX / distance;
    const directionZ = offsetZ / distance;

    cameraTarget.x += directionX * excessDistance;
    cameraTarget.z += directionZ * excessDistance;
  }

  // Preserve the original camera offset from its target.
  const cameraOffset = new THREE.Vector3(0, 15, 12);

  const desiredCameraPosition = cameraTarget.clone().add(cameraOffset);

  camera.position.x = THREE.MathUtils.damp(
    camera.position.x,
    desiredCameraPosition.x,
    CAMERA_FOLLOW_SPEED,
    deltaTime
  );

  camera.position.y = THREE.MathUtils.damp(
    camera.position.y,
    desiredCameraPosition.y,
    CAMERA_FOLLOW_SPEED,
    deltaTime
  );

  camera.position.z = THREE.MathUtils.damp(
    camera.position.z,
    desiredCameraPosition.z,
    CAMERA_FOLLOW_SPEED,
    deltaTime
  );

  camera.lookAt(cameraTarget);
}
//#endregion

 const snow = createSnowSystem(
  scene,
  player,
  renderer
);

// Create Combat System
const combat = createCombatSystem(scene, player);

// Create HUD
const gameContainer = document.querySelector<HTMLElement>("#game");

if (!gameContainer) {
    throw new Error("Game container #game was not found.");
}

const hud = createHUD(gameContainer);

// Create End Screen
const endScreen = createEndScreen(gameContainer);
let gameCompleted = false;

//GAME UPDATE
function update(deltaTime: number) {

  if(!gameCompleted) {  
    // Move the player.
    movePlayer(deltaTime);

    // Rotate toward the movement direction.
    updateRotation(deltaTime);

    // Update combat mechanics.
    combat.update(deltaTime);

    // Update HUD.
    hud.update(combat.gemCount, combat.remainingEnemies);

    // Update Snow.
    snow.update(player, deltaTime);

    playerAnimation?.update(deltaTime);

    // Camera track player.
    updateCamera(deltaTime);

    // Check for victory.
    if (
        combat.remainingEnemies === 0 &&
        combat.remainingGems === 0
    ) {
        gameCompleted = true;
        endScreen.show();
    }
  }

}

function animate() {
  requestAnimationFrame(animate);

  const deltaTime = Math.min(
    clock.getDelta(),
    0.05
  );

  update(deltaTime);
  renderer.render(scene, camera);
}

animate();
