import "mathlive";
import "./app.css";
import { MathfieldElement } from "mathlive";
import { mountApp } from "./ui/app";

// Self-host the math fonts (vendored into public/ by scripts/copy-mathlive-assets.mjs)
// so math renders with no network. Sound effects are not wanted.
MathfieldElement.fontsDirectory = "/mathlive/fonts";
MathfieldElement.soundsDirectory = null;

const template = document.getElementById("screen-template") as HTMLTemplateElement | null;
if (template) {
  template.replaceWith(template.content.cloneNode(true));
}

mountApp();
registerServiceWorker();

/** Register the offline app-shell worker (production builds only). */
function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support is a bonus; never let it break the app.
    });
  });
}
