
const END_SCREEN_TITLE = "MISSION COMPLETE!";
const END_SCREEN_MESSAGE = "You defeated every enemy and collected every gem.";
const END_SCREEN_BUTTON_LABEL = "PLAY NOW";

// Replace this with your destination URL.
const DESTINATION_URL = "https://lucasquinino.artstation.com/";

export function createEndScreen(container: HTMLElement) {
    const overlay = document.createElement("div");
    overlay.className = "end-screen";

    const panel = document.createElement("div");
    panel.className = "end-screen-panel";

    const title = document.createElement("h1");
    title.textContent = END_SCREEN_TITLE;

    const message = document.createElement("p");
    message.textContent = END_SCREEN_MESSAGE;

    const button = document.createElement("button");
    button.className = "end-screen-button";
    button.textContent = END_SCREEN_BUTTON_LABEL;

    button.addEventListener("click", () => {
        window.open(DESTINATION_URL, "_blank", "noopener,noreferrer");
    });

    panel.append(title, message, button);
    overlay.appendChild(panel);
    container.appendChild(overlay);

    // Hidden until the game is completed.
    overlay.style.display = "none";

    function show() {
        overlay.style.display = "flex";
    }

    function dispose() {
        overlay.remove();
    }

    return { show, dispose };
}
