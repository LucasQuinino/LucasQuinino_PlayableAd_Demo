
import * as THREE from "three";

// ============================================================
// SNOW GROUND SETTINGS
// ============================================================

// The square ground follows the player.
const SNOW_GROUND_SIZE = 64;

// Number of subdivisions along each side of the square.
// Higher values give smoother geometric deformation,
// but increase vertex processing cost.
const GRID_SEGMENTS = 384;

// ============================================================
// DEFORMATION TEXTURE SETTINGS
// ============================================================

// World-space area covered by the deformation texture.
const DEFORMATION_AREA_SIZE = 128;

// Resolution of the GPU deformation texture.
const DEFORMATION_TEXTURE_RESOLUTION = 1024;

// Footprint brush radius in world units.
const DEFORMATION_BRUSH_RADIUS = 0.8;

// Maximum downward displacement of compressed snow.
const SNOW_COMPRESSION_DEPTH = 0.5;

// ============================================================
// RECOVERY SETTINGS
// ============================================================

// Time before compressed snow begins recovering.
const SNOW_RECOVERY_DELAY = 2.0;

// Compression removed per second after the delay.
const SNOW_RECOVERY_SPEED = 0.5;

// ============================================================
// SNOW COLORS
// ============================================================

const SNOW_COLOR = 0xeaf3ff;
const COMPRESSED_SNOW_COLOR = 0x9ebbd6;


// ============================================================
// GPU DEFORMATION UPDATE MATERIAL
// ============================================================

function createDeformationUpdateMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            uPreviousTexture: {
                value: null
            },

            // Movement of the texture center in UV space.
            uTextureShift: {
                value: new THREE.Vector2()
            },

            // Previous player position relative to the new center.
            // X is world X; Y is inverted world Z.
            uPreviousPosition: {
                value: new THREE.Vector2()
            },

            uBrushRadius: {
                value: DEFORMATION_BRUSH_RADIUS
            },

            uDeltaTime: {
                value: 0
            },

            uRecoveryDelay: {
                value: SNOW_RECOVERY_DELAY
            },

            uRecoverySpeed: {
                value: SNOW_RECOVERY_SPEED
            },

            uAreaSize: {
                value: DEFORMATION_AREA_SIZE
            }
        },

        vertexShader: `
            varying vec2 vUv;

            void main() {
                vUv = uv;

                gl_Position =
                    projectionMatrix *
                    modelViewMatrix *
                    vec4(position, 1.0);
            }
        `,

        fragmentShader: `
            uniform sampler2D uPreviousTexture;

            uniform vec2 uTextureShift;
            uniform vec2 uPreviousPosition;

            uniform float uBrushRadius;
            uniform float uDeltaTime;

            uniform float uRecoveryDelay;
            uniform float uRecoverySpeed;

            uniform float uAreaSize;

            varying vec2 vUv;

            void main() {
                // ------------------------------------------------
                // 1. RECENTER THE EXISTING DEFORMATION TEXTURE
                // ------------------------------------------------

                // Sample the previous texture at the position
                // corresponding to the current world-space position.
                vec2 previousUV = vUv + uTextureShift;

                float insideTexture =
                    step(0.0, previousUV.x) *
                    step(previousUV.x, 1.0) *
                    step(0.0, previousUV.y) *
                    step(previousUV.y, 1.0);

                vec2 previousData = texture2D(
                    uPreviousTexture,
                    previousUV
                ).rg * insideTexture;

                float compression = previousData.r;
                float age = previousData.g;

                // ------------------------------------------------
                // 2. RECOVERY
                // ------------------------------------------------

                if (compression > 0.0) {
                    age += uDeltaTime;

                    if (age > uRecoveryDelay) {
                        compression = max(
                            0.0,
                            compression -
                            uRecoverySpeed * uDeltaTime
                        );
                    }
                }

                // ------------------------------------------------
                // 3. PAINT THE MOVEMENT TRAIL
                // ------------------------------------------------

                // Convert texture UV into world-space local coordinates.
                vec2 localPosition =
                    (vUv - 0.5) * uAreaSize;

                // Previous and current player positions.
                // The current position is always the texture center.
                vec2 trailStart = uPreviousPosition;
                vec2 trailEnd = vec2(0.0);

                // Find the closest point on the movement segment.
                vec2 segment = trailEnd - trailStart;

                float segmentLengthSquared =
                    dot(segment, segment);

                float t = 0.0;

                if (segmentLengthSquared > 0.000001) {
                    t = clamp(
                        dot(
                            localPosition - trailStart,
                            segment
                        ) / segmentLengthSquared,
                        0.0,
                        1.0
                    );
                }

                vec2 closestPoint =
                    trailStart + segment * t;

                float distanceToTrail = length(
                    localPosition - closestPoint
                );

                // Soft circular brush along the movement segment.
                float brushMask = 1.0 - smoothstep(
                    uBrushRadius * 0.55,
                    uBrushRadius,
                    distanceToTrail
                );

                // Apply compression without reducing existing marks.
                compression = max(
                    compression,
                    brushMask
                );

                // Restart recovery wherever the brush has touched.
                if (brushMask > 0.001) {
                    age = 0.0;
                }

                // ------------------------------------------------
                // 4. OUTPUT
                // ------------------------------------------------

                // R = compression
                // G = time since last compression
                gl_FragColor = vec4(
                    compression,
                    age,
                    0.0,
                    1.0
                );
            }
        `,

        depthTest: false,
        depthWrite: false
    });
}


// ============================================================
// GPU DEFORMATION SYSTEM
// ============================================================

function createGPUDeformationSystem(
    renderer: THREE.WebGLRenderer
) {
    const resolution = DEFORMATION_TEXTURE_RESOLUTION;

    // Two render targets allow us to read one texture
    // while writing the updated result into the other.
    const targetOptions: THREE.RenderTargetOptions = {
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
        stencilBuffer: false
    };

    const targetA = new THREE.WebGLRenderTarget(
        resolution,
        resolution,
        targetOptions
    );

    const targetB = new THREE.WebGLRenderTarget(
        resolution,
        resolution,
        targetOptions
    );

    targetA.texture.colorSpace = THREE.NoColorSpace;
    targetB.texture.colorSpace = THREE.NoColorSpace;

    let readTarget = targetA;
    let writeTarget = targetB;

    // Fullscreen quad used to execute the update shader.
    const updateScene = new THREE.Scene();

    const updateCamera = new THREE.OrthographicCamera(
        -1, 1, 1, -1, 0, 1
    );

    const updateMaterial =
        createDeformationUpdateMaterial();

    const updateQuad = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        updateMaterial
    );

    updateScene.add(updateQuad);

    // Current center of the deformation texture.
    let centerX = 0;
    let centerZ = 0;

    /**
     * Initialize both render targets to untouched snow.
     */
    function clearTargets() {
        const previousColor =
            renderer.getClearColor(new THREE.Color()).clone();

        const previousAlpha = renderer.getClearAlpha();

        const previousTarget = renderer.getRenderTarget();

        renderer.setClearColor(0x000000, 0);

        renderer.setRenderTarget(targetA);
        renderer.clear();

        renderer.setRenderTarget(targetB);
        renderer.clear();

        renderer.setRenderTarget(previousTarget);

        renderer.setClearColor(
            previousColor,
            previousAlpha
        );
    }

    clearTargets();

    /**
     * Update the deformation texture on the GPU.
     *
     * The previous texture is shifted, recovered,
     * and painted in one fullscreen shader pass.
     */
    function update(
        player: THREE.Group,
        previousX: number,
        previousZ: number,
        deltaTime: number
    ) {
        const currentX = player.position.x;
        const currentZ = player.position.z;

        const deltaX = currentX - centerX;
        const deltaZ = currentZ - centerZ;

        centerX = currentX;
        centerZ = currentZ;

        // Old marks need to shift opposite to player movement.
        updateMaterial.uniforms.uTextureShift.value.set(
            deltaX / DEFORMATION_AREA_SIZE,
            -deltaZ / DEFORMATION_AREA_SIZE
        );

        // Previous player position relative to the new center.
        updateMaterial.uniforms.uPreviousPosition.value.set(
            previousX - currentX,
            -(previousZ - currentZ)
        );

        updateMaterial.uniforms.uPreviousTexture.value =
            readTarget.texture;

        updateMaterial.uniforms.uDeltaTime.value =
            Math.min(deltaTime, 0.05);

        // Render the update into the other texture.
        const previousTarget = renderer.getRenderTarget();

        renderer.setRenderTarget(writeTarget);
        renderer.render(updateScene, updateCamera);
        renderer.setRenderTarget(previousTarget);

        // Swap read and write targets.
        const temp = readTarget;
        readTarget = writeTarget;
        writeTarget = temp;

        return readTarget.texture;
    }

    return {
        update,

        get texture() {
            return readTarget.texture;
        },

        dispose() {
            targetA.dispose();
            targetB.dispose();

            updateMaterial.dispose();
            updateQuad.geometry.dispose();
        }
    };
}


// ============================================================
// SQUARE SNOW GRID
// ============================================================

function createSnowGeometry(): THREE.PlaneGeometry {
    const geometry = new THREE.PlaneGeometry(
        SNOW_GROUND_SIZE,
        SNOW_GROUND_SIZE,
        GRID_SEGMENTS,
        GRID_SEGMENTS
    );

    // Turn the plane horizontal.
    geometry.rotateX(-Math.PI / 2);

    return geometry;
}


// ============================================================
// SNOW MATERIAL
// ============================================================

function createSnowMaterial(
    deformationTexture: THREE.Texture
) {
    return new THREE.ShaderMaterial({
        uniforms: {
            uPlayerPosition: {
                value: new THREE.Vector3()
            },

            uDeformationTexture: {
                value: deformationTexture
            },

            uDeformationAreaSize: {
                value: DEFORMATION_AREA_SIZE
            },

            uSnowDepth: {
                value: SNOW_COMPRESSION_DEPTH
            },

            uSnowColor: {
                value: new THREE.Color(SNOW_COLOR)
            },

            uCompressedSnowColor: {
                value: new THREE.Color(
                    COMPRESSED_SNOW_COLOR
                )
            }
        },

        vertexShader: `
            uniform vec3 uPlayerPosition;

            uniform sampler2D uDeformationTexture;

            uniform float uDeformationAreaSize;
            uniform float uSnowDepth;

            varying float vCompression;

            void main() {
                // Get the vertex position in world space.
                vec4 worldPosition =
                    modelMatrix * vec4(position, 1.0);

                // Map world position to the player-centered texture.
                vec2 localPosition =
                    worldPosition.xz -
                    uPlayerPosition.xz;

                // Texture Y corresponds to inverted world Z.
                vec2 deformationUV = vec2(
                    localPosition.x,
                    -localPosition.y
                ) / uDeformationAreaSize + 0.5;

                float insideTexture =
                    step(0.0, deformationUV.x) *
                    step(deformationUV.x, 1.0) *
                    step(0.0, deformationUV.y) *
                    step(deformationUV.y, 1.0);

                float compression = texture2D(
                    uDeformationTexture,
                    deformationUV
                ).r * insideTexture;

                vCompression = compression;

                // Displace the snow downward.
                worldPosition.y -=
                    compression * uSnowDepth;

                gl_Position =
                    projectionMatrix *
                    viewMatrix *
                    worldPosition;
            }
        `,

        fragmentShader: `
            uniform vec3 uSnowColor;
            uniform vec3 uCompressedSnowColor;

            varying float vCompression;

            void main() {
                vec3 color = mix(
                    uSnowColor,
                    uCompressedSnowColor,
                    vCompression
                );

                gl_FragColor = vec4(color, 1.0);
            }
        `,

        side: THREE.DoubleSide
    });
}


// ============================================================
// MAIN SNOW SYSTEM
// ============================================================

export function createSnowSystem(
    scene: THREE.Scene,
    player: THREE.Group,
    renderer: THREE.WebGLRenderer
) {
    // Create the GPU deformation system.
    const deformation = createGPUDeformationSystem(
        renderer
    );

    // Create square ground geometry.
    const snowGeometry = createSnowGeometry();

    // Create material using the GPU deformation texture.
    const snowMaterial = createSnowMaterial(
        deformation.texture
    );

    const snowGround = new THREE.Mesh(
        snowGeometry,
        snowMaterial
    );

    snowGround.position.set(
        0,//player.position.x,
        SNOW_COMPRESSION_DEPTH,
        0//player.position.z
    );

    // The grid follows the camera/player area.
    snowGround.frustumCulled = false;

    scene.add(snowGround);

    // Previous player position for trail generation.
    const previousPlayerPosition = new THREE.Vector3(
        player.position.x,
        player.position.y,
        player.position.z
    );

    /**
     * Update the snow system.
     *
     * Call after updating player movement each frame.
     */
    function update(
        player: THREE.Group,
        deltaTime: number
    ) {
        const currentX = player.position.x;
        const currentZ = player.position.z;

        // Update the GPU deformation texture.
        const updatedTexture = deformation.update(
            player,
            previousPlayerPosition.x,
            previousPlayerPosition.z,
            deltaTime
        );

        // Keep the snow material sampling the latest texture.
        snowMaterial.uniforms
            .uDeformationTexture.value = updatedTexture;

        // Update player position uniform.
        snowMaterial.uniforms
            .uPlayerPosition.value.set(
                currentX,
                player.position.y,
                currentZ
            );

        // Move the square ground with the player.
        snowGround.position.x = currentX;
        snowGround.position.z = currentZ;

        // Save player position for the next frame.
        previousPlayerPosition.copy(player.position);
    }

    function dispose() {
        scene.remove(snowGround);

        snowGeometry.dispose();
        snowMaterial.dispose();

        deformation.dispose();
    }

    return {
        snowGround,
        update,
        dispose
    };
}