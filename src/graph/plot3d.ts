/**
 * 3D surface plot z = f(x, y) on a 2D canvas: a sampled mesh, rotated and
 * projected with light perspective, painted back to front, shaded by a fixed
 * light and coloured by height.
 *
 * Touch: drag to spin (it keeps spinning a little when you let go), pinch to
 * zoom, double-tap to reset. Left alone it slowly turns by itself.
 */

import type { Fn2 } from "./equation";

export interface Surface {
  fn: Fn2;
  color: string;
}

interface Mesh {
  /** Normalised vertex positions, (n+1)^2 of them, NaN for gaps. */
  xs: Float64Array;
  ys: Float64Array;
  zs: Float64Array;
  color: string;
}

const N = 40;
/** Height of the box in normalised units (x and y span -1..1). */
const BOX_Z = 0.75;
const HEIGHT_COLORS: [number, number, number][] = [
  [0, 0, 128],
  [0, 96, 192],
  [0, 160, 160],
  [64, 176, 64],
  [232, 200, 0],
  [232, 80, 0],
];
const FONT = '12px Tahoma, Verdana, "Segoe UI", sans-serif';

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function heightColor(t: number): [number, number, number] {
  const scaled = Math.min(Math.max(t, 0), 1) * (HEIGHT_COLORS.length - 1);
  const index = Math.min(Math.floor(scaled), HEIGHT_COLORS.length - 2);
  const f = scaled - index;
  const a = HEIGHT_COLORS[index];
  const b = HEIGHT_COLORS[index + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

export class Plot3D {
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private surfaces: Surface[] = [];
  private meshes: Mesh[] = [];
  /** Half-width of the x/y domain. */
  private range = 5;
  private zLow = -1;
  private zHigh = 1;

  private yaw = -0.7;
  private pitch = 0.5;
  private zoom = 1;
  private spinVelocity = 0;
  private tiltVelocity = 0;
  private rise = 1;
  private riseStart = 0;
  private lastInteraction = 0;
  private active = false;
  private looping = false;

  private pointers = new Map<number, { x: number; y: number }>();
  private lastTap = 0;
  private moved = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly motion: () => boolean,
    private readonly onRange?: (range: number) => void,
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

  setSurfaces(surfaces: Surface[], animate: boolean): void {
    this.surfaces = surfaces;
    this.sample();
    if (animate && this.motion()) {
      this.rise = 0;
      this.riseStart = performance.now();
    }
    this.kick();
  }

  /** Start/stop the animation loop when the tab is shown/hidden. */
  setActive(active: boolean): void {
    this.active = active;
    this.lastInteraction = performance.now();
    if (active) {
      this.resize();
      this.kick();
    }
  }

  zoomRange(factor: number): void {
    this.range = Math.min(Math.max(this.range * factor, 0.01), 1e5);
    this.onRange?.(this.range);
    this.sample();
    this.kick();
  }

  reset(): void {
    this.yaw = -0.7;
    this.pitch = 0.5;
    this.zoom = 1;
    this.spinVelocity = 0;
    this.tiltVelocity = 0;
    if (this.range !== 5) {
      this.range = 5;
      this.onRange?.(this.range);
      this.sample();
    }
    this.kick();
  }

  // -- sampling -------------------------------------------------------------

  private sample(): void {
    const values: number[] = [];
    const raw = this.surfaces.map((surface) => {
      const zs = new Float64Array((N + 1) * (N + 1));
      for (let j = 0; j <= N; j += 1) {
        const y = -this.range + (2 * this.range * j) / N;
        for (let i = 0; i <= N; i += 1) {
          const x = -this.range + (2 * this.range * i) / N;
          const z = surface.fn(x, y);
          zs[j * (N + 1) + i] = z;
          if (Number.isFinite(z)) {
            values.push(z);
          }
        }
      }
      return zs;
    });

    // Robust height range: ignore the wildest 1% at each end (poles).
    values.sort((a, b) => a - b);
    let low = values.length ? values[Math.floor(values.length * 0.01)] : -1;
    let high = values.length ? values[Math.ceil(values.length * 0.99) - 1] : 1;
    if (!(high - low > 1e-9)) {
      low -= 1;
      high += 1;
    }
    this.zLow = low;
    this.zHigh = high;
    const span = high - low;
    const cutLow = low - span * 0.25;
    const cutHigh = high + span * 0.25;

    this.meshes = raw.map((zs, index) => {
      const xs = new Float64Array(zs.length);
      const ys = new Float64Array(zs.length);
      const nz = new Float64Array(zs.length);
      for (let j = 0; j <= N; j += 1) {
        for (let i = 0; i <= N; i += 1) {
          const k = j * (N + 1) + i;
          xs[k] = -1 + (2 * i) / N;
          ys[k] = -1 + (2 * j) / N;
          const z = zs[k];
          nz[k] =
            Number.isFinite(z) && z >= cutLow && z <= cutHigh
              ? ((z - low) / span) * 2 * BOX_Z - BOX_Z
              : Number.NaN;
        }
      }
      return { xs, ys, zs: nz, color: this.surfaces[index].color };
    });
  }

  // -- loop -----------------------------------------------------------------

  private kick(): void {
    if (this.looping) {
      return;
    }
    this.looping = true;
    requestAnimationFrame((now) => this.tick(now));
  }

  private tick(now: number): void {
    const motion = this.motion();
    let busy = false;

    if (this.rise < 1) {
      const t = Math.min((now - this.riseStart) / 900, 1);
      // Spring-ish overshoot
      this.rise = t >= 1 ? 1 : 1 - Math.cos(t * Math.PI * 2.5) * Math.exp(-t * 5);
      busy = t < 1;
    }

    if (this.pointers.size === 0 && (Math.abs(this.spinVelocity) > 1e-4 || Math.abs(this.tiltVelocity) > 1e-4)) {
      this.yaw += this.spinVelocity;
      this.pitch = this.clampPitch(this.pitch + this.tiltVelocity);
      this.spinVelocity *= 0.94;
      this.tiltVelocity *= 0.9;
      busy = true;
    }

    const idle = this.pointers.size === 0 && now - this.lastInteraction > 2500;
    if (motion && this.active && idle) {
      this.yaw += 0.0035;
      busy = true;
    }

    this.render();
    if ((busy || this.pointers.size > 0) && this.active) {
      requestAnimationFrame((next) => this.tick(next));
    } else {
      this.looping = false;
    }
  }

  private clampPitch(pitch: number): number {
    return Math.min(Math.max(pitch, -0.1), 1.2);
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }
    const ratio = window.devicePixelRatio || 1;
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * ratio);
    this.canvas.height = Math.round(rect.height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.render();
  }

  // -- drawing --------------------------------------------------------------

  private render(): void {
    const { ctx, width, height } = this;
    if (width === 0) {
      return;
    }
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);

    const cosYaw = Math.cos(this.yaw);
    const sinYaw = Math.sin(this.yaw);
    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);
    const size = Math.min(width * 0.3, height * 0.36) * this.zoom;
    const cx = width / 2;
    const cy = height / 2 + size * 0.05;
    const distance = 4.5;

    /** World (normalised) -> screen x, y and depth (larger = farther). */
    const project = (x: number, y: number, z: number): [number, number, number] => {
      const rx = x * cosYaw - y * sinYaw;
      const ry = x * sinYaw + y * cosYaw;
      const depth = ry * cosPitch - z * sinPitch;
      const up = z * cosPitch + ry * sinPitch;
      const f = distance / (distance + depth);
      return [cx + rx * f * size, cy - up * f * size, depth];
    };

    this.drawFloor(project);

    // Light from the upper left, fixed relative to the viewer.
    const light = [-0.45 * cosYaw - 0.55 * sinYaw, 0.45 * sinYaw - 0.55 * cosYaw, 0.7];
    const lightLength = Math.hypot(light[0], light[1], light[2]);

    interface Quad {
      depth: number;
      points: number[];
      fill: string;
      stroke: string;
    }
    const quads: Quad[] = [];
    const solid = this.meshes.length > 1;
    const rise = this.rise;

    for (const mesh of this.meshes) {
      const count = (N + 1) * (N + 1);
      const sx = new Float64Array(count);
      const sy = new Float64Array(count);
      const sd = new Float64Array(count);
      for (let k = 0; k < count; k += 1) {
        const z = mesh.zs[k];
        if (Number.isNaN(z)) {
          sd[k] = Number.NaN;
          continue;
        }
        const [px, py, depth] = project(mesh.xs[k], mesh.ys[k], z * rise);
        sx[k] = px;
        sy[k] = py;
        sd[k] = depth;
      }
      const base = solid ? hexToRgb(mesh.color) : null;

      for (let j = 0; j < N; j += 1) {
        for (let i = 0; i < N; i += 1) {
          const a = j * (N + 1) + i;
          const b = a + 1;
          const c = a + N + 2;
          const d = a + N + 1;
          if (Number.isNaN(sd[a] + sd[b] + sd[c] + sd[d])) {
            continue;
          }
          // Normal from the diagonals (in world space).
          const ux = mesh.xs[c] - mesh.xs[a];
          const uy = mesh.ys[c] - mesh.ys[a];
          const uz = (mesh.zs[c] - mesh.zs[a]) * rise;
          const vx = mesh.xs[d] - mesh.xs[b];
          const vy = mesh.ys[d] - mesh.ys[b];
          const vz = (mesh.zs[d] - mesh.zs[b]) * rise;
          const nx = uy * vz - uz * vy;
          const ny = uz * vx - ux * vz;
          const nz = ux * vy - uy * vx;
          const nLength = Math.hypot(nx, ny, nz) || 1;
          const lambert = Math.abs(nx * light[0] + ny * light[1] + nz * light[2]) / (nLength * lightLength);
          const shade = 0.4 + 0.6 * lambert;

          const zMid = (mesh.zs[a] + mesh.zs[b] + mesh.zs[c] + mesh.zs[d]) / 4;
          const rgb = base ?? heightColor((zMid + BOX_Z) / (2 * BOX_Z));
          const r = Math.round(rgb[0] * shade);
          const g = Math.round(rgb[1] * shade);
          const bl = Math.round(rgb[2] * shade);
          quads.push({
            depth: (sd[a] + sd[b] + sd[c] + sd[d]) / 4,
            points: [sx[a], sy[a], sx[b], sy[b], sx[c], sy[c], sx[d], sy[d]],
            fill: `rgb(${r},${g},${bl})`,
            stroke: `rgb(${Math.round(r * 0.7)},${Math.round(g * 0.7)},${Math.round(bl * 0.7)})`,
          });
        }
      }
    }

    quads.sort((p, q) => q.depth - p.depth);
    ctx.lineWidth = 0.6;
    ctx.lineJoin = "round";
    for (const quad of quads) {
      const p = quad.points;
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(p[2], p[3]);
      ctx.lineTo(p[4], p[5]);
      ctx.lineTo(p[6], p[7]);
      ctx.closePath();
      ctx.fillStyle = quad.fill;
      ctx.fill();
      ctx.strokeStyle = quad.stroke;
      ctx.stroke();
    }

    this.drawAxes(project);
  }

  private drawFloor(project: (x: number, y: number, z: number) => [number, number, number]): void {
    const { ctx } = this;
    const z = -BOX_Z;
    ctx.strokeStyle = "#d8d8d8";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = -1; k <= 1.0001; k += 0.25) {
      const [ax, ay] = project(k, -1, z);
      const [bx, by] = project(k, 1, z);
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      const [cx, cy] = project(-1, k, z);
      const [dx, dy] = project(1, k, z);
      ctx.moveTo(cx, cy);
      ctx.lineTo(dx, dy);
    }
    ctx.stroke();
  }

  private drawAxes(project: (x: number, y: number, z: number) => [number, number, number]): void {
    const { ctx } = this;
    const z0 = -BOX_Z;
    const axis = (from: [number, number, number], to: [number, number, number], name: string): void => {
      const [ax, ay] = project(...from);
      const [bx, by] = project(...to);
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      const dx = bx - ax;
      const dy = by - ay;
      const length = Math.hypot(dx, dy) || 1;
      ctx.font = `bold italic 15px "Times New Roman", serif`;
      ctx.fillStyle = "#000080";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(name, bx + (dx / length) * 12, by + (dy / length) * 12);
    };
    axis([-1, -1, z0], [1, -1, z0], "x");
    axis([-1, -1, z0], [-1, 1, z0], "y");
    axis([-1, -1, z0], [-1, -1, BOX_Z], "z");

    // Ranges, as a Win95 tooltip-style label in the corner.
    const r = trimNumber(this.range);
    const lines = [`x, y: −${r} to ${r}`, `z: ${trimNumber(this.zLow)} to ${trimNumber(this.zHigh)}`];
    ctx.font = FONT;
    const boxW = Math.max(...lines.map((line) => ctx.measureText(line).width)) + 12;
    ctx.fillStyle = "#ffffe1";
    ctx.fillRect(8, 8, boxW, 36);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.strokeRect(8.5, 8.5, Math.round(boxW), 36);
    ctx.fillStyle = "#000";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    lines.forEach((line, index) => ctx.fillText(line, 14, 18 + index * 16));
  }

  // -- input ----------------------------------------------------------------

  private bindInput(): void {
    const canvas = this.canvas;

    canvas.addEventListener("pointerdown", (event) => {
      canvas.setPointerCapture(event.pointerId);
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      this.spinVelocity = 0;
      this.tiltVelocity = 0;
      this.moved = false;
      this.lastInteraction = performance.now();
      this.kick();
    });

    canvas.addEventListener("pointermove", (event) => {
      const previous = this.pointers.get(event.pointerId);
      if (!previous) {
        return;
      }
      const point = { x: event.clientX, y: event.clientY };
      this.lastInteraction = performance.now();

      if (this.pointers.size === 1) {
        const dx = point.x - previous.x;
        const dy = point.y - previous.y;
        if (Math.abs(dx) + Math.abs(dy) > 1) {
          this.moved = true;
        }
        this.spinVelocity = dx * 0.008;
        this.tiltVelocity = dy * 0.006;
        this.yaw += this.spinVelocity;
        this.pitch = this.clampPitch(this.pitch + this.tiltVelocity);
      } else {
        const other = [...this.pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
        if (other) {
          const before = Math.hypot(previous.x - other.x, previous.y - other.y);
          const after = Math.hypot(point.x - other.x, point.y - other.y);
          if (before > 0) {
            this.zoom = Math.min(Math.max(this.zoom * (after / before), 0.4), 4);
          }
          this.moved = true;
        }
      }
      this.pointers.set(event.pointerId, point);
    });

    const end = (event: PointerEvent): void => {
      const wasSingle = this.pointers.size === 1;
      this.pointers.delete(event.pointerId);
      this.lastInteraction = performance.now();
      if (!this.motion()) {
        this.spinVelocity = 0;
        this.tiltVelocity = 0;
      }
      if (event.type === "pointerup" && wasSingle && !this.moved) {
        const now = performance.now();
        if (now - this.lastTap < 300) {
          this.reset();
        }
        this.lastTap = now;
      }
      this.kick();
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);

    canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        this.zoom = Math.min(Math.max(this.zoom * Math.exp(-event.deltaY * 0.0015), 0.4), 4);
        this.lastInteraction = performance.now();
        this.kick();
      },
      { passive: false },
    );
  }
}

function trimNumber(value: number): string {
  if (Object.is(value, -0) || Math.abs(value) < 1e-12) {
    return "0";
  }
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude >= 1e5 || magnitude < 1e-3)) {
    return value.toExponential(1).replace("-", "−");
  }
  return String(Number.parseFloat(value.toPrecision(3))).replace("-", "−");
}
