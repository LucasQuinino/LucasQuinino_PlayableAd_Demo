
export function createHUD(container: HTMLElement) {
    // Main HUD container.
    const hud = document.createElement("div");
    hud.className = "game-hud";

    // Gem counter.
    const gemCounter = document.createElement("div");
    gemCounter.className = "hud-counter gem-counter";

    const gemIcon = document.createElement("span");
    gemIcon.className = "hud-icon";
    gemIcon.textContent = "◆";

    const gemValue = document.createElement("span");
    gemValue.className = "hud-value";
    gemValue.textContent = "0";

    gemCounter.append(gemIcon, gemValue);

    // Remaining enemies counter.
    const enemyCounter = document.createElement("div");
    enemyCounter.className = "hud-counter enemy-counter";

    const enemyIcon = document.createElement("span");
    enemyIcon.className = "hud-icon";
    enemyIcon.textContent = "●";

    const enemyValue = document.createElement("span");
    enemyValue.className = "hud-value";
    enemyValue.textContent = "0";

    enemyCounter.append(enemyIcon, enemyValue);

    hud.append(gemCounter, enemyCounter);
    container.appendChild(hud);

    // Cache previous values to avoid unnecessary DOM updates.
    let previousGemCount = -1;
    let previousEnemyCount = -1;

    function update(gemCount: number, remainingEnemies: number) {
        if (gemCount !== previousGemCount) {
            gemValue.textContent = String(gemCount);
            previousGemCount = gemCount;
        }

        if (remainingEnemies !== previousEnemyCount) {
            enemyValue.textContent = String(remainingEnemies);
            previousEnemyCount = remainingEnemies;
        }
    }

    function dispose() {
        hud.remove();
    }

    return {
        update,
        dispose
    };
}
