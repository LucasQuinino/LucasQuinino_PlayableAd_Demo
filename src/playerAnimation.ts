
import * as THREE from "three";

export function createPlayerAnimation(
    model: THREE.Object3D,
    animations: THREE.AnimationClip[]
) {
    const mixer = new THREE.AnimationMixer(model);

    // Find animations by their names in the GLB.
    const idleClip = THREE.AnimationClip.findByName(animations, "AC_IDLE");
    const runClip = THREE.AnimationClip.findByName(animations, "AC_RUN");

    if (!idleClip || !runClip) {
        console.error(
            "Could not find Idle or Run animations. Check the animation names in your GLB.",
            animations.map(clip => clip.name)
        );

        return {
            update: (_deltaTime: number) => {},
            setMoving: (_moving: boolean) => {},
            dispose: () => {}
        };
    }

    const idleAction = mixer.clipAction(idleClip);
    const runAction = mixer.clipAction(runClip);

    // Both animations loop continuously.
    idleAction.setLoop(THREE.LoopRepeat, Infinity);
    runAction.setLoop(THREE.LoopRepeat, Infinity);

    idleAction.clampWhenFinished = false;
    runAction.clampWhenFinished = false;

    // Start in the idle animation.
    idleAction.play();

    let isMoving = false;

    function setMoving(moving: boolean) {
        if (moving === isMoving) return;

        isMoving = moving;

        const nextAction = moving ? runAction : idleAction;
        const previousAction = moving ? idleAction : runAction;

        nextAction.reset();
        nextAction.play();
        nextAction.crossFadeFrom(previousAction, 0.2, true);
    }

    function update(deltaTime: number) {
        mixer.update(deltaTime);
    }

    function dispose() {
        mixer.stopAllAction();
        mixer.uncacheRoot(model);
    }

    return { update, setMoving, dispose };
}
