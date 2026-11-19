/**
 * 2D graph on a <canvas>: grid, axes, explicit curves (y = f(x), x = g(y)) and
 * implicit curves (F(x, y) = 0, by marching squares).
 *
 * Touch: drag to pan, pinch to zoom, tap a curve to trace a point, double-tap
 * to reset. Mouse: drag, wheel to zoom, click to trace.
 */

import type { Plot2DEquation } from "./equation";

export interface Curve {
  eq: Plot2DEquation;
  color: string;
}

interface View {
  cx: number;
  cy: number;
  /** CSS pixels per unit. */
  scale: number;
}

interface Trace {
  curve: number;
  x: number;
  y: number;
}

const FONT = '11px Tahoma, Verdana, "Segoe UI", sans-serif';

/** 1, 2, 5 x 10^n closest above `raw`. */
function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
}

export function formatTick(value: number): string {
  if (Math.abs(value) < 1e-10) {
    return "0";
  }
  const magnitude = Math.abs(value);
  if (magnitude >= 1e5 || magnitude < 1e-3) {
    return value.toExponential(1).replace("e+", "e");
  }
  return String(Number.parseFloat(value.toPrecision(6)));
}

function formatCoord(value: number): string {
  if (!Number.isFinite(value)) {
    return "–";
  }
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude >= 1e6 || magnitude < 1e-4)) {
    return value.toExponential(3);
  }
  return String(Number.parseFloat(value.toFixed(4)));
}

export class Plot2D {
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private view: View = { cx: 0, cy: 0, scale: 40 };
  private curves: Curve[] = [];
  private trace: Trace | null = null;
  /** Implicit curve points from the last render, for tracing. */
  private implicitPoints: { curve: number; x: number; y: number }[] = [];
  private reveal = 1;
  private frame = 0;
  private viewAnimation = 0;

  private pointers = new Map<number, { x: number; y: number }>();
  private dragged = false;
  private tracing = false;
  private lastTap = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly motion: () => boolean,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D is not available");
    }
    this.ctx = ctx;
    this.bindInput();
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  // -- public ---------------------------------------------------------------

  setCurves(curves: Curve[], animate: boolean): void {
    this.curves = curves;
    if (this.trace && !curves[this.trace.curve]) {
      this.trace = null;
    }
    if (animate && this.motion()) {
      this.animateReveal();
    } else {
      this.request();
    }
  }

  zoomBy(factor: number): void {
    this.animateTo({ ...this.view, scale: this.clampScale(this.view.scale * factor) });
  }

  reset(): void {
    this.trace = null;
    this.animateTo(this.defaultView());
  }

  // -- view -----------------------------------------------------------------

  private defaultView(): View {
    return { cx: 0, cy: 0, scale: Math.max(this.width, 1) / 14 };
  }

  private clampScale(scale: number): number {
    return Math.min(Math.max(scale, 1e-4), 1e7);
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }
    const firstLayout = this.width === 0;
    const ratio = window.devicePixelRatio || 1;
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * ratio);
    this.canvas.height = Math.round(rect.height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (firstLayout) {
      this.view = this.defaultView();
    }
    this.render();
  }

  private sx(x: number): number {
    return this.width / 2 + (x - this.view.cx) * this.view.scale;
  }

  private sy(y: number): number {
    return this.height / 2 - (y - this.view.cy) * this.view.scale;
  }

  private wx(px: number): number {
    return this.view.cx + (px - this.width / 2) / this.view.scale;
  }

  private wy(py: number): number {
    return this.view.cy - (py - this.height / 2) / this.view.scale;
  }

  private animateTo(target: View): void {
    cancelAnimationFrame(this.viewAnimation);
    if (!this.motion()) {
      this.view = target;
      this.request();
      return;
    }
    const start = { ...this.view };
    const began = performance.now();
    const step = (now: number): void => {
      const t = Math.min((now - began) / 320, 1);
      const e = 1 - (1 - t) ** 3;
      const logScale =
        Math.log(start.scale) + (Math.log(target.scale) - Math.log(start.scale)) * e;
      this.view = {
        cx: start.cx + (target.cx - start.cx) * e,
        cy: start.cy + (target.cy - start.cy) * e,
        scale: Math.exp(logScale),
      };
      this.render();
      if (t < 1) {
        this.viewAnimation = requestAnimationFrame(step);
      }
    };
    this.viewAnimation = requestAnimationFrame(step);
  }

  /** Curves draw themselves on from left to right. */
  private animateReveal(): void {
    const began = performance.now();
    const step = (now: number): void => {
      const t = Math.min((now - began) / 650, 1);
      this.reveal = 1 - (1 - t) ** 3;
      this.render();
      if (t < 1) {
        requestAnimationFrame(step);
      }
    };
    this.reveal = 0;
    requestAnimationFrame(step);
  }

  private request(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.render());
  }

  // -- drawing --------------------------------------------------------------

  render(): void {
    const { ctx, width, height } = this;
    if (width === 0) {
      return;
    }
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);

    this.drawGrid();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width * this.reveal, height);
    ctx.clip();
    this.implicitPoints = [];
    this.curves.forEach((curve, index) => this.drawCurve(curve, index));
    ctx.restore();

    this.drawTrace();
  }

  private drawGrid(): void {
    const { ctx, width, height } = this;
    const step = niceStep(80 / this.view.scale);
    const minor = step / 5;
    const left = this.wx(0);
    const right = this.wx(width);
    const top = this.wy(0);
    const bottom = this.wy(height);

    const lines = (spacing: number, color: string): void => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = Math.ceil(left / spacing) * spacing; x <= right; x += spacing) {
        const px = Math.round(this.sx(x)) + 0.5;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, height);
      }
      for (let y = Math.ceil(bottom / spacing) * spacing; y <= top; y += spacing) {
        const py = Math.round(this.sy(y)) + 0.5;
        ctx.moveTo(0, py);
        ctx.lineTo(width, py);
      }
      ctx.stroke();
    };
    lines(minor, "#f0f0f0");
    lines(step, "#d4d4d4");

    // Axes
    const ax = Math.round(this.sx(0)) + 0.5;
    const ay = Math.round(this.sy(0)) + 0.5;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ax >= 0 && ax <= width) {
      ctx.moveTo(ax, 0);
      ctx.lineTo(ax, height);
    }
    if (ay >= 0 && ay <= height) {
      ctx.moveTo(0, ay);
      ctx.lineTo(width, ay);
    }
    ctx.stroke();

    // Labels stick to the edge when the axis is off screen.
    ctx.font = FONT;
    ctx.fillStyle = "#404040";
    const labelY = Math.min(Math.max(ay + 4, 4), height - 16);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let x = Math.ceil(left / step) * step; x <= right; x += step) {
      if (Math.abs(x) < step / 2) {
        continue;
      }
      const px = this.sx(x);
      if (px < 14 || px > width - 14) {
        continue;
      }
      this.label(formatTick(x), px, labelY);
    }
    const labelX = Math.min(Math.max(ax - 5, 30), width - 4);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let y = Math.ceil(bottom / step) * step; y <= top; y += step) {
      if (Math.abs(y) < step / 2) {
        continue;
      }
      const py = this.sy(y);
      if (py < 10 || py > height - 10) {
        continue;
      }
      this.label(formatTick(y), labelX, py);
    }
  }

  private label(text: string, x: number, y: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,.9)";
    ctx.strokeText(text, x, y);
    ctx.restore();
    ctx.fillText(text, x, y);
  }

  private drawCurve(curve: Curve, index: number): void {
    const { ctx } = this;
    ctx.strokeStyle = curve.color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    const { eq } = curve;
    if (eq.kind === "y") {
      this.traceExplicit((px) => this.sy(eq.fn(this.wx(px))), this.width, false);
    } else if (eq.kind === "x") {
      this.traceExplicit((py) => this.sx(eq.fn(this.wy(py))), this.height, true);
    } else {
      this.marchingSquares(eq.fn, index);
    }
    ctx.stroke();
  }

  /**
   * Walk across the screen one pixel at a time. `at(t)` returns the other
   * screen coordinate. Breaks the path at gaps and at vertical asymptotes.
   */
  private traceExplicit(at: (t: number) => number, length: number, swap: boolean): void {
    const { ctx } = this;
    const limit = (swap ? this.width : this.height) * 4;
    let previous = Number.NaN;
    for (let t = -1; t <= length + 1; t += 1) {
      let value = at(t);
      if (!Number.isFinite(value) || Math.abs(value) > 1e6) {
        previous = Number.NaN;
        continue;
      }
      value = Math.max(-limit, Math.min(limit, value));
      if (Number.isFinite(previous) && Math.abs(value - previous) > (swap ? this.width : this.height)) {
        // A big jump: continuous steep curve, or a pole? Check the midpoint.
        const middle = at(t - 0.5);
        const between =
          Number.isFinite(middle) &&
          middle >= Math.min(value, previous) &&
          middle <= Math.max(value, previous);
        if (!between) {
          previous = Number.NaN;
        }
      }
      const [x, y] = swap ? [value, t] : [t, value];
      if (Number.isFinite(previous)) {
        ctx.lineTo(x, y);
      } else {
        ctx.moveTo(x, y);
      }
      previous = value;
    }
  }

  private marchingSquares(fn: (x: number, y: number) => number, index: number): void {
    const { ctx, width, height } = this;
    const cell = 5;
    const cols = Math.ceil(width / cell) + 1;
    const rows = Math.ceil(height / cell) + 1;
    const values = new Float64Array(cols * rows);
    for (let j = 0; j < rows; j += 1) {
      const y = this.wy(j * cell);
      for (let i = 0; i < cols; i += 1) {
        values[j * cols + i] = fn(this.wx(i * cell), y);
      }
    }

    const points = this.implicitPoints;
    const edge = (a: number, b: number, pa: [number, number], pb: [number, number]): [number, number] => {
      const t = a / (a - b);
      return [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t];
    };

    for (let j = 0; j < rows - 1; j += 1) {
      for (let i = 0; i < cols - 1; i += 1) {
        const a = values[j * cols + i];
        const b = values[j * cols + i + 1];
        const c = values[(j + 1) * cols + i + 1];
        const d = values[(j + 1) * cols + i];
        if (!(Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && Number.isFinite(d))) {
          continue;
        }
        const x0 = i * cell;
        const y0 = j * cell;
        const pa: [number, number] = [x0, y0];
        const pb: [number, number] = [x0 + cell, y0];
        const pc: [number, number] = [x0 + cell, y0 + cell];
        const pd: [number, number] = [x0, y0 + cell];

        const crossings: [number, number][] = [];
        if (a > 0 !== b > 0) crossings.push(edge(a, b, pa, pb));
        if (b > 0 !== c > 0) crossings.push(edge(b, c, pb, pc));
        if (c > 0 !== d > 0) crossings.push(edge(c, d, pc, pd));
        if (d > 0 !== a > 0) crossings.push(edge(d, a, pd, pa));
        if (crossings.length < 2) {
          continue;
        }

        // A sign change across a pole (e.g. tan) is not a curve: the value
        // in the middle of the segment would be huge rather than near zero.
        const spread = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));
        const mx = (crossings[0][0] + crossings[1][0]) / 2;
        const my = (crossings[0][1] + crossings[1][1]) / 2;
        const middle = fn(this.wx(mx), this.wy(my));
        if (!Number.isFinite(middle) || Math.abs(middle) > spread) {
          continue;
        }

        for (let k = 0; k + 1 < crossings.length; k += 2) {
          ctx.moveTo(crossings[k][0], crossings[k][1]);
          ctx.lineTo(crossings[k + 1][0], crossings[k + 1][1]);
        }
        if (points.length < 20000) {
          points.push({ curve: index, x: this.wx(mx), y: this.wy(my) });
        }
      }
    }
  }

  private drawTrace(): void {
    const trace = this.trace;
    const curve = trace ? this.curves[trace.curve] : null;
    if (!trace || !curve) {
      return;
    }
    const { ctx } = this;
    const px = this.sx(trace.x);
    const py = this.sy(trace.y);
    if (px < -20 || px > this.width + 20 || py < -20 || py > this.height + 20) {
      return;
    }

    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "#808080";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, this.height);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = curve.color;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Win95 tooltip
    const text = `(${formatCoord(trace.x)}, ${formatCoord(trace.y)})`;
    ctx.font = '12px Tahoma, Verdana, "Segoe UI", sans-serif';
    const boxW = ctx.measureText(text).width + 12;
    const boxH = 20;
    let bx = px + 10;
    let by = py - boxH - 10;
    if (bx + boxW > this.width - 4) bx = px - boxW - 10;
    if (by < 4) by = py + 10;
    ctx.fillStyle = "#ffffe1";
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(bx) + 0.5, Math.round(by) + 0.5, Math.round(boxW), boxH);
    ctx.fillStyle = "#000";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, bx + 6, by + boxH / 2 + 0.5);
  }

  // -- tracing --------------------------------------------------------------

  /** Nearest curve point to a screen position, within `radius` pixels. */
  private nearest(px: number, py: number, radius: number): Trace | null {
    let best: Trace | null = null;
    let bestDistance = radius;
    this.curves.forEach((curve, index) => {
      const { eq } = curve;
      if (eq.kind === "y") {
        const x = this.wx(px);
        const y = eq.fn(x);
        const distance = Math.abs(this.sy(y) - py);
        if (Number.isFinite(y) && distance < bestDistance) {
          bestDistance = distance;
          best = { curve: index, x, y };
        }
      } else if (eq.kind === "x") {
        const y = this.wy(py);
        const x = eq.fn(y);
        const distance = Math.abs(this.sx(x) - px);
        if (Number.isFinite(x) && distance < bestDistance) {
          bestDistance = distance;
          best = { curve: index, x, y };
        }
      }
    });
    for (const point of this.implicitPoints) {
      const distance = Math.hypot(this.sx(point.x) - px, this.sy(point.y) - py);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { ...point };
      }
    }
    return best;
  }

  /** While dragging a trace along an explicit curve, follow the finger. */
  private followTrace(px: number, py: number): void {
    const trace = this.trace;
    const curve = trace ? this.curves[trace.curve] : null;
    if (!trace || !curve) {
      return;
    }
    if (curve.eq.kind === "y") {
      const x = this.wx(px);
      this.trace = { curve: trace.curve, x, y: curve.eq.fn(x) };
    } else if (curve.eq.kind === "x") {
      const y = this.wy(py);
      this.trace = { curve: trace.curve, x: curve.eq.fn(y), y };
    } else {
      this.trace = this.nearest(px, py, 60) ?? trace;
    }
    this.request();
  }

  // -- input ----------------------------------------------------------------

  private local(event: PointerEvent | WheelEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private bindInput(): void {
    const canvas = this.canvas;

    canvas.addEventListener("pointerdown", (event) => {
      canvas.setPointerCapture(event.pointerId);
      cancelAnimationFrame(this.viewAnimation);
      const point = this.local(event);
      this.pointers.set(event.pointerId, point);
      this.dragged = false;
      this.tracing = false;
      if (this.pointers.size === 1 && this.trace) {
        const distance = Math.hypot(this.sx(this.trace.x) - point.x, this.sy(this.trace.y) - point.y);
        this.tracing = distance < 36;
      }
    });

    canvas.addEventListener("pointermove", (event) => {
      const previous = this.pointers.get(event.pointerId);
      if (!previous) {
        return;
      }
      const point = this.local(event);

      if (this.pointers.size === 1) {
        if (Math.hypot(point.x - previous.x, point.y - previous.y) < 1) {
          return;
        }
        this.dragged = true;
        if (this.tracing) {
          this.followTrace(point.x, point.y);
        } else {
          this.view.cx -= (point.x - previous.x) / this.view.scale;
          this.view.cy += (point.y - previous.y) / this.view.scale;
          this.request();
        }
        this.pointers.set(event.pointerId, point);
        return;
      }

      // Pinch: zoom about the midpoint and pan with it.
      const others = [...this.pointers.entries()].filter(([id]) => id !== event.pointerId);
      const other = others[0]?.[1];
      if (!other) {
        return;
      }
      this.dragged = true;
      const before = Math.hypot(previous.x - other.x, previous.y - other.y);
      const after = Math.hypot(point.x - other.x, point.y - other.y);
      const midBefore = { x: (previous.x + other.x) / 2, y: (previous.y + other.y) / 2 };
      const midAfter = { x: (point.x + other.x) / 2, y: (point.y + other.y) / 2 };
      const anchorX = this.wx(midBefore.x);
      const anchorY = this.wy(midBefore.y);
      if (before > 0) {
        this.view.scale = this.clampScale(this.view.scale * (after / before));
      }
      this.view.cx = anchorX - (midAfter.x - this.width / 2) / this.view.scale;
      this.view.cy = anchorY + (midAfter.y - this.height / 2) / this.view.scale;
      this.pointers.set(event.pointerId, point);
      this.request();
    });

    const end = (event: PointerEvent): void => {
      const point = this.pointers.get(event.pointerId);
      const wasSingle = this.pointers.size === 1;
      this.pointers.delete(event.pointerId);
      if (event.type !== "pointerup" || !point || !wasSingle || this.dragged) {
        return;
      }
      const now = performance.now();
      if (now - this.lastTap < 300) {
        this.lastTap = 0;
        this.reset();
        return;
      }
      this.lastTap = now;
      this.trace = this.nearest(point.x, point.y, 32);
      this.request();
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);

    canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const point = this.local(event);
        const anchorX = this.wx(point.x);
        const anchorY = this.wy(point.y);
        this.view.scale = this.clampScale(this.view.scale * Math.exp(-event.deltaY * 0.0015));
        this.view.cx = anchorX - (point.x - this.width / 2) / this.view.scale;
        this.view.cy = anchorY + (point.y - this.height / 2) / this.view.scale;
        this.request();
      },
      { passive: false },
    );
  }
}
