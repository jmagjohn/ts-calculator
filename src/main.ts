import "mathlive";
import "./retro.css";
import "./app.css";
import { MathfieldElement } from "mathlive";
import { mountCalculator } from "./ui/calculator";

// Self-host the math fonts (vendored into public/ by scripts/copy-mathlive-assets.mjs)
// so math renders with no network. Sound effects are not wanted.
MathfieldElement.fontsDirectory = "/mathlive/fonts";
MathfieldElement.soundsDirectory = null;

mountCalculator();
registerServiceWorker();
syncThemeColor();

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

/** Keep the mobile status-bar colour in step with the selected theme. */
function syncThemeColor(): void {
  document.addEventListener("retro:theme", (event) => {
    const palette = (event as CustomEvent<{ bg?: string }>).detail;
    if (!palette?.bg) {
      return;
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", palette.bg);
  });
}
