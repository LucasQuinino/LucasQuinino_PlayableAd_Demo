
import * as THREE from "three";

// ============================================================
// GAMEPLAY SETTINGS
// ============================================================

// Enemy spawning.
const ENEMY_COUNT = 18;
const ENEMY_SPAWN_MIN_RADIUS = 12;
const ENEMY_SPAWN_MAX_RADIUS = 20;

// Enemy movement.
const ENEMY_MOVE_SPEED = 2.0;
const ENEMY_COLLISION_RADIUS = 1.0;
const ENEMY_STOP_DISTANCE = 1.2;

// Sword.
const SWORD_ORBIT_SPEED = 15.0;
const SWORD_LENGTH = 1.5;
const SWORD_START_DISTANCE = 1;
const SWORD_HEIGHT = 1.1;
const SWORD_HIT_RADIUS = 1;

// Movement detection.
const MOVEMENT_THRESHOLD = 0.001;

// Gems.
const GEM_PICKUP_RADIUS = 2.5;
const GEM_FLOAT_HEIGHT = 1;
const GEM_FLOAT_SPEED = 2.5;
const GEM_ROTATION_SPEED = 2.0;

// Gem magnet
const GEM_ATTRACTION_RADIUS = 5.0;
const GEM_ATTRACTION_SPEED = 8.0;
const GEM_ATTRACTION_ACCELERATION = 12.0;

// Jump animation
const GEM_JUMP_HEIGHT = 1.5;
const GEM_JUMP_FREQUENCY = 5.0;

// Gem collection flash
const GEM_FLASH_PARTICLE_COUNT = 10;
const GEM_FLASH_DURATION = 0.35;
const GEM_FLASH_SPEED = 3.0;
const GEM_FLASH_PARTICLE_SIZE = 0.2;


// ============================================================
// TYPES
// ============================================================

interface Enemy {
    group: THREE.Group;
    alive: boolean;
}

interface Gem {
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    attracted: boolean;
    jumpProgress: number;
}


// ============================================================
// COMBAT SYSTEM
// ============================================================

export function createCombatSystem(
    scene: THREE.Scene,
    player: THREE.Group
) {
    // --------------------------------------------------------
    // SHARED GEOMETRIES AND MATERIALS
    // --------------------------------------------------------

    const enemyGeometry = new THREE.SphereGeometry(
        ENEMY_COLLISION_RADIUS,
        12,
        12
    );

    const enemyMaterial = new THREE.MeshStandardMaterial({
        color: 0xc94b4b,
        roughness: 0.8
    });

    const swordGeometry = new THREE.CylinderGeometry(
        0.09,
        0.13,
        SWORD_LENGTH,
        8
    );

    const swordMaterial = new THREE.MeshStandardMaterial({
        color: 0xdce6f5,
        metalness: 0.8,
        roughness: 0.25
    });

    const gemGeometry = new THREE.OctahedronGeometry(0.5);

    const gemMaterial = new THREE.MeshStandardMaterial({
        color: 0x42e8ff,
        emissive: 0x087b9b,
        emissiveIntensity: 1.5,
        metalness: 0.4,
        roughness: 0.2
    });


    // --------------------------------------------------------
    // SWORD
    // --------------------------------------------------------

    // The pivot rotates around the player.
    const swordPivot = new THREE.Group();

    swordPivot.position.y = SWORD_HEIGHT;
    swordPivot.visible = false;

    // Cylinder is initially vertical.
    const swordMesh = new THREE.Mesh(
        swordGeometry,
        swordMaterial
    );

    // Rotate it horizontally so it extends along local X.
    swordMesh.rotation.z = -Math.PI / 2;

    // Move it away from the pivot to create an orbiting blade.
    swordMesh.position.x =
        SWORD_START_DISTANCE + SWORD_LENGTH * 0.5;

    swordPivot.add(swordMesh);
    scene.add(swordPivot);

    let swordAngle = 0;


    // --------------------------------------------------------
    // ENEMIES
    // --------------------------------------------------------

    const enemies: Enemy[] = [];

    function spawnEnemies() {
        for (let i = 0; i < ENEMY_COUNT; i++) {
            const angle = Math.random() * Math.PI * 2;

            const spawnRadius =
                ENEMY_SPAWN_MIN_RADIUS +
                Math.random() *
                (ENEMY_SPAWN_MAX_RADIUS - ENEMY_SPAWN_MIN_RADIUS);

            const x =
                player.position.x +
                Math.cos(angle) * spawnRadius;

            const z =
                player.position.z +
                Math.sin(angle) * spawnRadius;

            const enemyGroup = new THREE.Group();

            const enemyMesh = new THREE.Mesh(
                enemyGeometry,
                enemyMaterial
            );

            enemyMesh.position.y = ENEMY_COLLISION_RADIUS;

            enemyGroup.add(enemyMesh);
            enemyGroup.position.set(x, 0, z);

            scene.add(enemyGroup);

            enemies.push({
                group: enemyGroup,
                alive: true
            });
        }
    }

    // Spawn the horde immediately when the system is created.
    spawnEnemies();


    // --------------------------------------------------------
    // GEMS
    // --------------------------------------------------------

    const gems: Gem[] = [];

    const gemFlashes: ReturnType<typeof createGemFlash>[] = [];

    let gemCount = 0;

    function dropGem(position: THREE.Vector3) {
        const gemMesh = new THREE.Mesh(
            gemGeometry,
            gemMaterial
        );
        gemMesh.position.set(
            position.x,
            GEM_FLOAT_HEIGHT,
            position.z
        );

        // Small random variation in initial rotation.
        gemMesh.rotation.y = Math.random() * Math.PI * 2;
        const gem: Gem = {
            mesh: gemMesh,
            velocity: new THREE.Vector3(),
            attracted: false,
            jumpProgress: 0
        };

        scene.add(gemMesh);

        gems.push({
            mesh: gemMesh,
            velocity: gem.velocity,
            attracted: gem.attracted,
            jumpProgress: gem.jumpProgress
        });
    }


    // --------------------------------------------------------
    // COLLISION HELPERS
    // --------------------------------------------------------

    /**
     * Calculates the shortest distance from a point to a line segment.
     * Used for checking whether the rotating sword hits an enemy.
     */
    function distanceToSegment(
        point: THREE.Vector2,
        start: THREE.Vector2,
        end: THREE.Vector2
    ): number {
        const segment = new THREE.Vector2().subVectors(
            end,
            start
        );

        const segmentLengthSquared = segment.lengthSq();

        if (segmentLengthSquared <= 0.000001) {
            return point.distanceTo(start);
        }

        const pointOffset = new THREE.Vector2().subVectors(
            point,
            start
        );

        const t = THREE.MathUtils.clamp(
            pointOffset.dot(segment) / segmentLengthSquared,
            0,
            1
        );

        const closestPoint = start.clone().addScaledVector(
            segment,
            t
        );

        return point.distanceTo(closestPoint);
    }


    // --------------------------------------------------------
    // ENEMY DEFEAT
    // --------------------------------------------------------

    function defeatEnemy(enemy: Enemy) {
        if (!enemy.alive) return;

        enemy.alive = false;

        // Drop a gem at the enemy's current position.
        dropGem(enemy.group.position);

        // Remove enemy from the scene.
        scene.remove(enemy.group);
    }


    // --------------------------------------------------------
    // UPDATE ENEMIES
    // --------------------------------------------------------

    function updateEnemies(deltaTime: number) {
        for (const enemy of enemies) {
            if (!enemy.alive) continue;

            const enemyPosition = enemy.group.position;

            const direction = new THREE.Vector3(
                player.position.x - enemyPosition.x,
                0,
                player.position.z - enemyPosition.z
            );

            const distance = direction.length();

            // Stop enemies when they reach the player.
            if (distance <= ENEMY_STOP_DISTANCE) continue;

            direction.normalize();

            enemyPosition.x +=
                direction.x * ENEMY_MOVE_SPEED * deltaTime;

            enemyPosition.z +=
                direction.z * ENEMY_MOVE_SPEED * deltaTime;

            // Face the player.
            enemy.group.rotation.y = Math.atan2(
                direction.x,
                direction.z
            );
        }
    }


    // --------------------------------------------------------
    // UPDATE SWORD
    // --------------------------------------------------------

    function updateSword(
        deltaTime: number,
        isMoving: boolean
    ) {
        swordPivot.visible = isMoving;

        if (!isMoving) return;

        // Move the sword pivot with the player.
        swordPivot.position.set(
            player.position.x,
            SWORD_HEIGHT,
            player.position.z
        );

        // Rotate around the player.
        swordAngle += SWORD_ORBIT_SPEED * deltaTime;

        swordPivot.rotation.y = swordAngle;
    }


    // --------------------------------------------------------
    // SWORD COLLISIONS
    // --------------------------------------------------------

    function checkSwordHits() {
        if (!swordPivot.visible) return;

        // The sword extends along the pivot's local X axis.
        const start = new THREE.Vector2(
            player.position.x +
            Math.cos(swordAngle) * SWORD_START_DISTANCE,

            player.position.z -
            Math.sin(swordAngle) * SWORD_START_DISTANCE
        );

        const end = new THREE.Vector2(
            player.position.x +
            Math.cos(swordAngle) *
            (SWORD_START_DISTANCE + SWORD_LENGTH),

            player.position.z -
            Math.sin(swordAngle) *
            (SWORD_START_DISTANCE + SWORD_LENGTH)
        );

        for (const enemy of enemies) {
            if (!enemy.alive) continue;

            const enemyPosition = new THREE.Vector2(
                enemy.group.position.x,
                enemy.group.position.z
            );

            const distance = distanceToSegment(
                enemyPosition,
                start,
                end
            );

            if (
                distance <=
                ENEMY_COLLISION_RADIUS + SWORD_HIT_RADIUS
            ) {
                defeatEnemy(enemy);
            }
        }
    }


    // --------------------------------------------------------
    // UPDATE GEMS
    // --------------------------------------------------------
    function updateGems(deltaTime: number) {
        const playerPosition = player.position;

        for (let i = gems.length - 1; i >= 0; i--) {
            const gem = gems[i];

            const distance = gem.mesh.position.distanceTo(playerPosition);

            // Start attracting the gem when the player enters the magnet radius.
            if (!gem.attracted && distance <= GEM_ATTRACTION_RADIUS) {
                gem.attracted = true;
            }

            if (gem.attracted) {
                // Move toward the player.
                const direction = new THREE.Vector3()
                    .subVectors(playerPosition, gem.mesh.position);

                direction.y = 0;
                direction.normalize();

                // Smoothly accelerate toward the player.
                gem.velocity.addScaledVector(
                    direction,
                    GEM_ATTRACTION_ACCELERATION * deltaTime
                );

                // Clamp attraction speed.
                if (gem.velocity.length() > GEM_ATTRACTION_SPEED) {
                    gem.velocity.setLength(GEM_ATTRACTION_SPEED);
                }

                gem.mesh.position.addScaledVector(
                    gem.velocity,
                    deltaTime
                );

                // Add a smooth jump arc while the gem is being attracted.
                gem.jumpProgress += deltaTime * GEM_JUMP_FREQUENCY;

                const jumpHeight =
                    Math.abs(Math.sin(gem.jumpProgress)) * GEM_JUMP_HEIGHT;

                gem.mesh.position.y = GEM_FLOAT_HEIGHT + jumpHeight;

                // Collect when close enough.
                if (distance <= GEM_PICKUP_RADIUS) {
                    // Spawn the flash at the gem's exact position.
                    gemFlashes.push(
                        createGemFlash(scene, gem.mesh.position.clone())
                    );
                    scene.remove(gem.mesh);
                    gems.splice(i, 1);
                    gemCount++;
                    continue;
                }
            } else {
                // Existing idle floating and rotation behavior.
                gem.mesh.position.y =
                    GEM_FLOAT_HEIGHT +
                    Math.sin(performance.now() * 0.002 * GEM_FLOAT_SPEED) * 0.12;
            }

            gem.mesh.rotation.y += GEM_ROTATION_SPEED * deltaTime;
        }
    }

    // ------
    // CREATE GEM FLASH
    // --------------------------------------------------------

    
    function createGemFlash(
        scene: THREE.Scene,
        position: THREE.Vector3
        ) {
            const geometry = new THREE.BufferGeometry();

            const positions = new Float32Array(
                GEM_FLASH_PARTICLE_COUNT * 3
            );

            const velocities: THREE.Vector3[] = [];

            for (let i = 0; i < GEM_FLASH_PARTICLE_COUNT; i++) {
                positions[i * 3] = position.x;
                positions[i * 3 + 1] = position.y;
                positions[i * 3 + 2] = position.z;

                // Random direction for each particle.
                const direction = new THREE.Vector3(
                    Math.random() * 2 - 1,
                    Math.random() * 2 - 1,
                    Math.random() * 2 - 1
                ).normalize();

                velocities.push(
                    direction.multiplyScalar(GEM_FLASH_SPEED)
                );
            }

            geometry.setAttribute(
                "position",
                new THREE.BufferAttribute(positions, 3)
            );

            const material = new THREE.PointsMaterial({
                color: 0x42e8ff,
                size: GEM_FLASH_PARTICLE_SIZE,
                transparent: true,
                opacity: 1,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                sizeAttenuation: true
            });

            const particles = new THREE.Points(geometry, material);
            scene.add(particles);

            let elapsed = 0;

            function update(deltaTime: number): boolean {
                elapsed += deltaTime;

                const progress = Math.min(
                    elapsed / GEM_FLASH_DURATION,
                    1
                );

                const positionAttribute =
                    geometry.getAttribute("position") as THREE.BufferAttribute;

                for (let i = 0; i < GEM_FLASH_PARTICLE_COUNT; i++) {
                    positionAttribute.setXYZ(
                        i,
                        position.x + velocities[i].x * elapsed,
                        position.y + velocities[i].y * elapsed,
                        position.z + velocities[i].z * elapsed
                    );
                }

                positionAttribute.needsUpdate = true;

                // Fade the particles as they expand.
                material.opacity = 1 - progress;

                return elapsed >= GEM_FLASH_DURATION;
            }

            function dispose() {
                scene.remove(particles);
                geometry.dispose();
                material.dispose();
            }

            return { update, dispose };
        }



    // --------------------------------------------------------
    // MAIN UPDATE
    // --------------------------------------------------------

    // Used to detect actual player movement.
    const previousPlayerPosition = player.position.clone();

    function update(deltaTime: number) {
        const dx =
            player.position.x - previousPlayerPosition.x;

        const dz =
            player.position.z - previousPlayerPosition.z;

        const movementDistanceSquared =
            dx * dx + dz * dz;

        const isMoving =
            movementDistanceSquared >
            MOVEMENT_THRESHOLD * MOVEMENT_THRESHOLD;

        previousPlayerPosition.copy(player.position);

        updateSword(deltaTime, isMoving);

        updateEnemies(deltaTime);

        checkSwordHits();

        updateGems(deltaTime);

        // Update active gem collection flashes.
        for (let i = gemFlashes.length - 1; i >= 0; i--) {
            const flash = gemFlashes[i];

            if (flash.update(deltaTime)) {
                flash.dispose();
                gemFlashes.splice(i, 1);
            }
        }
    }


    // --------------------------------------------------------
    // CLEANUP
    // --------------------------------------------------------

    function dispose() {
        scene.remove(swordPivot);

        for (const enemy of enemies) {
            scene.remove(enemy.group);
        }

        for (const gem of gems) {
            scene.remove(gem.mesh);
        }

        swordGeometry.dispose();
        swordMaterial.dispose();

        enemyGeometry.dispose();
        enemyMaterial.dispose();

        gemGeometry.dispose();
        gemMaterial.dispose();

        for (const flash of gemFlashes) {
            flash.dispose();
        }

        gemFlashes.length = 0;
    }


    // --------------------------------------------------------
    // PUBLIC API
    // --------------------------------------------------------

    return {
        update,
        dispose,

        get gemCount() {
            return gemCount;
        },

        get remainingEnemies() {
            return enemies.filter(enemy => enemy.alive).length;
        },

        get remainingGems() {
            return gems.length;
        }
    };
}
