/**
 * Motion helpers, adapted from the lookbook animations:
 *  AN-01 fade-through swap, AN-03 staggered reveal, AN-04 circle clip reveal,
 *  AN-06 press squish + spring, AN-10 copy -> check morph, AN-11 shake on error.
 *
 * Everything uses the Web Animations API on transform/opacity/clip-path, and
 * is skipped when motion is off (setting or prefers-reduced-motion).
 */

const EASE_OUT = "cubic-bezier(.2,.8,.2,1)";
const EASE_IN = "cubic-bezier(.4,0,1,1)";
/** Spring with a small overshoot, as a linear() curve (AN-06). Older Safari
 *  has no linear(), and an unknown easing makes animate() throw, so fall back. */
const LINEAR_SPRING =
  "linear(0, 0.21 6%, 0.68 15%, 0.96 23%, 1.06 30%, 1.08 36%, 1.05 44%, 1.01 54%, 0.99 66%, 1)";
export const SPRING =
  typeof CSS !== "undefined" && CSS.supports("transition-timing-function", LINEAR_SPRING)
    ? LINEAR_SPRING
    : "cubic-bezier(.34,1.56,.64,1)";

const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

export function motionOn(): boolean {
  return document.documentElement.dataset.motion !== "off" && !reducedQuery.matches;
}

/** AN-01: fade the old content out fast, swap, fade the new content in from 92%. */
export async function fadeThrough(element: HTMLElement, swap: () => void): Promise<void> {
  if (!motionOn()) {
    swap();
    return;
  }
  element.getAnimations().forEach((animation) => animation.cancel());
  const out = element.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: 90,
    easing: EASE_IN,
    fill: "forwards",
  });
  await out.finished.catch(() => undefined);
  swap();
  out.cancel();
  element.animate(
    [
      { opacity: 0, transform: "scale(.92)" },
      { opacity: 1, transform: "scale(1)" },
    ],
    { duration: 210, easing: "cubic-bezier(0,0,.2,1)" },
  );
}

/** AN-03: children rise 12px and fade in, 60ms apart. */
export function staggerIn(children: Iterable<Element>, max = 12): void {
  if (!motionOn()) {
    return;
  }
  let index = 0;
  for (const child of children) {
    if (index >= max) {
      break;
    }
    (child as HTMLElement).animate(
      [
        { opacity: 0, transform: "translateY(12px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 360, delay: index * 60, easing: EASE_OUT, fill: "backwards" },
    );
    index += 1;
  }
}

/**
 * AN-04: a circle grows from a point until it covers `surface`; `midway` runs
 * once it is covered, then the cover fades away revealing the new state.
 */
export async function circleWipe(
  surface: HTMLElement,
  from: { x: number; y: number },
  midway: () => void,
): Promise<void> {
  if (!motionOn()) {
    midway();
    return;
  }
  const rect = surface.getBoundingClientRect();
  const x = from.x - rect.left;
  const y = from.y - rect.top;
  const radius = Math.hypot(Math.max(x, rect.width - x), Math.max(y, rect.height - y));

  const cover = document.createElement("div");
  cover.className = "wipe";
  surface.append(cover);
  await cover
    .animate(
      [
        { clipPath: `circle(0px at ${x}px ${y}px)` },
        { clipPath: `circle(${radius}px at ${x}px ${y}px)` },
      ],
      { duration: 420, easing: "cubic-bezier(.65,0,.35,1)", fill: "forwards" },
    )
    .finished.catch(() => undefined);
  midway();
  await cover
    .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: EASE_IN, fill: "forwards" })
    .finished.catch(() => undefined);
  cover.remove();
}

/** AN-11: shake side to side with decaying amplitude. */
export function shake(element: HTMLElement): void {
  if (!motionOn()) {
    return;
  }
  element.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-9px)" },
      { transform: "translateX(8px)" },
      { transform: "translateX(-6px)" },
      { transform: "translateX(4px)" },
      { transform: "translateX(-2px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 420, easing: "cubic-bezier(.36,.07,.19,.97)" },
  );
}

/** Result arrives: rise and settle with a little spring. */
export function riseIn(element: HTMLElement): void {
  if (!motionOn()) {
    return;
  }
  element.animate(
    [
      { opacity: 0, transform: "translateY(14px) scale(.96)" },
      { opacity: 1, transform: "none" },
    ],
    { duration: 520, easing: SPRING },
  );
}

/** AN-10: label morphs to a check ("Copied"), resets after 1.6s. */
export function flashConfirm(button: HTMLElement, text: string): void {
  const label = button.querySelector<HTMLElement>(".toolbar__label");
  if (!label) {
    return;
  }
  const original = button.dataset.label ?? label.textContent ?? "";
  button.dataset.label = original;
  window.clearTimeout(Number(button.dataset.timer));

  label.innerHTML = `<svg class="check" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8.5l3.5 3.5 7.5-8"/></svg>${text}`;
  button.classList.add("is-confirmed");
  if (motionOn()) {
    label.animate(
      [
        { opacity: 0, transform: "scale(.6) rotate(-20deg)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 300, easing: "cubic-bezier(.34,1.56,.64,1)" },
    );
  }

  button.dataset.timer = String(
    window.setTimeout(() => {
      label.textContent = original;
      button.classList.remove("is-confirmed");
    }, 1600),
  );
}

/**
 * Win95-style window open: zoom out of the button that opened it.
 * Returns nothing; the dialog is already shown.
 */
export function zoomOpen(windowEl: HTMLElement, origin?: DOMRect): void {
  if (!motionOn()) {
    return;
  }
  const target = windowEl.getBoundingClientRect();
  let transform = "scale(.85)";
  if (origin) {
    const dx = origin.left + origin.width / 2 - (target.left + target.width / 2);
    const dy = origin.top + origin.height / 2 - (target.top + target.height / 2);
    transform = `translate(${dx}px, ${dy}px) scale(${Math.max(origin.width / target.width, 0.15)})`;
  }
  windowEl.animate(
    [
      { opacity: 0, transform },
      { opacity: 1, transform: "none" },
    ],
    { duration: 300, easing: EASE_OUT },
  );
}

/** Close a window quickly (closes faster than it opens). */
export async function zoomClose(windowEl: HTMLElement): Promise<void> {
  if (!motionOn()) {
    return;
  }
  await windowEl
    .animate(
      [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: "scale(.9)" },
      ],
      { duration: 160, easing: EASE_IN, fill: "forwards" },
    )
    .finished.catch(() => undefined);
}
