import { ParticleCanvasPlayer } from "@clockwyrks/particle-runtime/canvas";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import type {
  Game,
  InitApi,
  RenderApi,
  UpdateApi,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";

export const BACKGROUND = "#050812";
type Screen = C.Screen;
type Kind = C.PodKind;
type FX = "widen" | "narrow" | "pierce";
type PFX = "burst" | "spark" | "burnup";
interface Ball {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly parked: boolean;
  readonly spawnTick: number;
}
interface Target {
  readonly slot: number;
  readonly hp: number;
}
interface Ring {
  readonly angleDeg: number;
  readonly speedDegPerSec: number;
  readonly targets: readonly Target[];
}
interface Pod {
  readonly id: number;
  readonly kind: Kind;
  readonly radius: number;
  readonly angleDeg: number;
}
interface Burst {
  readonly id: number;
  readonly kind: PFX;
  readonly x: number;
  readonly y: number;
}
interface Assets {
  readonly planet: ImageBitmap;
  readonly pods: Readonly<Record<Kind, ImageBitmap>>;
  readonly balls: readonly ImageBitmap[];
  readonly particles: Readonly<Record<PFX, ParticleSystem>>;
}
export interface KesslerState {
  readonly screen: Screen;
  readonly ticks: number;
  readonly accumulator: number;
  readonly wave: number;
  readonly score: number;
  readonly lives: number;
  readonly interstitialTicks: number;
  readonly waveAdvance: boolean;
  readonly podSpawn: boolean;
  readonly nextPod: Kind | "none" | null;
  readonly paddleAngleDeg: number;
  readonly balls: readonly Ball[];
  readonly rings: readonly Ring[];
  readonly pods: readonly Pod[];
  readonly widenTicks: number;
  readonly narrowTicks: number;
  readonly pierceTicks: number;
  readonly shieldActive: boolean;
  readonly menuIndex: number;
  readonly pointerArmed: number | null;
  readonly nextId: number;
  readonly bursts: readonly Burst[];
  readonly assets: Assets;
}
type Read = DeepReadonly<KesslerState>;
export interface Snapshot {
  readonly screen: Screen;
  readonly ticks: number;
  readonly wave: number;
  readonly score: number;
  readonly lives: number;
  readonly interstitialTicks: number;
  readonly waveAdvance: boolean;
  readonly podSpawn: boolean;
  readonly nextPod: Kind | "none" | null;
  readonly paddle: { readonly angleDeg: number; readonly spanDeg: number };
  readonly balls: readonly {
    readonly x: number;
    readonly y: number;
    readonly vx: number;
    readonly vy: number;
    readonly parked: boolean;
    readonly piercing: boolean;
  }[];
  readonly rings: readonly {
    readonly angleDeg: number;
    readonly speedDegPerSec: number;
    readonly targets: readonly Target[];
  }[];
  readonly pods: readonly {
    readonly kind: Kind;
    readonly x: number;
    readonly y: number;
  }[];
  readonly effects: {
    readonly widenTicks: number;
    readonly narrowTicks: number;
    readonly pierceTicks: number;
    readonly shieldActive: boolean;
  };
  readonly menu: { readonly index: number };
}
type Rect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};
export interface KesslerDebugApi {
  readonly version: 1;
  reset(s: Read): KesslerState;
  reconcile(s: Read): KesslerState;
  snapshot(s: Read): Snapshot;
  menuItemRect(s: Read, i: number): Rect | null;
  setScreen(s: Read, n: Screen): KesslerState;
  setScore(s: Read, n: number): KesslerState;
  setLives(s: Read, n: number): KesslerState;
  setMenuIndex(s: Read, n: number): KesslerState;
  setInterstitialTicks(s: Read, n: number): KesslerState;
  setWave(s: Read, n: number): KesslerState;
  setPaddleAngle(s: Read, n: number): KesslerState;
  launchBall(s: Read): KesslerState;
  clearBalls(s: Read): KesslerState;
  spawnBall(
    s: Read,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ): KesslerState;
  parkBall(s: Read): KesslerState;
  clearTargets(s: Read): KesslerState;
  spawnTarget(s: Read, r: number, slot: number, hp: number): KesslerState;
  setRingAngle(s: Read, r: number, n: number): KesslerState;
  setRingSpeed(s: Read, r: number, n: number): KesslerState;
  clearPods(s: Read): KesslerState;
  spawnPod(s: Read, k: Kind, x: number, y: number): KesslerState;
  setNextPod(s: Read, k: Kind | "none"): KesslerState;
  drawPod(s: Read): Kind | null;
  setEffectTicks(s: Read, k: FX, n: number): KesslerState;
  setShield(s: Read, on: boolean): KesslerState;
  setWaveAdvance(s: Read, on: boolean): KesslerState;
  setPodSpawn(s: Read, on: boolean): KesslerState;
}

const rd = (n: number) => (n * Math.PI) / 180,
  dg = (n: number) => (n * 180) / Math.PI,
  norm = (n: number) => ((n % 360) + 360) % 360;
const da = (a: number, b: number) => ((a - b + 540) % 360) - 180;
const polar = (r: number, a: number) => ({
  x: C.STAGE_CX + r * Math.cos(rd(a)),
  y: C.STAGE_CY + r * Math.sin(rd(a)),
});
const radius = (x: number, y: number) =>
    Math.hypot(x - C.STAGE_CX, y - C.STAGE_CY),
  angle = (x: number, y: number) =>
    norm(dg(Math.atan2(y - C.STAGE_CY, x - C.STAGE_CX)));
const speed = (w: number) =>
  Math.min(
    C.BALL_SPEED_BASE + C.BALL_SPEED_PER_WAVE * (w - 1),
    C.BALL_SPEED_CAP,
  );
const rs = (i: number, w: number) => {
  const r = C.RINGS[i];
  return (
    r.orbitSign *
    Math.min(
      r.orbitBaseDegPerSec + r.orbitPerWaveDegPerSec * (w - 1),
      r.orbitCapDegPerSec,
    )
  );
};
const span = (s: Read) =>
  s.widenTicks
    ? C.WIDEN_SPAN_DEG
    : s.narrowTicks
      ? C.NARROW_SPAN_DEG
      : C.DEFLECTOR_BASE_SPAN_DEG;
const rings = (w: number): Ring[] =>
  C.RINGS.map((r, i) => ({
    angleDeg: 0,
    speedDegPerSec: rs(i, w),
    targets: Array.from({ length: r.slots }, (_, slot) => ({
      slot,
      hp: r.hitPoints,
    })),
  }));
const copy = (s: Read): KesslerState => ({
  ...s,
  balls: s.balls.map((x) => ({ ...x })),
  rings: s.rings.map((x) => ({
    ...x,
    targets: x.targets.map((t) => ({ ...t })),
  })),
  pods: s.pods.map((x) => ({ ...x })),
  bursts: s.bursts.map((x) => ({ ...x })),
  assets: s.assets as Assets,
});
const base = (a: Assets): KesslerState => ({
  screen: "title",
  ticks: 0,
  accumulator: 0,
  wave: 1,
  score: 0,
  lives: C.START_LIVES,
  interstitialTicks: 0,
  waveAdvance: true,
  podSpawn: true,
  nextPod: null,
  paddleAngleDeg: C.DEFLECTOR_START_ANGLE_DEG,
  balls: [],
  rings: rings(1),
  pods: [],
  widenTicks: 0,
  narrowTicks: 0,
  pierceTicks: 0,
  shieldActive: false,
  menuIndex: 0,
  pointerArmed: null,
  nextId: 1,
  bursts: [],
  assets: a,
});
const whole = (n: number, min: number, name: string) => {
  if (!Number.isInteger(n) || n < min)
    throw new RangeError(`${name} must be a whole number >= ${min}`);
};
const rect = (screen: Screen, i: number): Rect | null =>
  (screen === "title" || screen === "paused") && i >= 0 && i < 2
    ? { x: 330, y: 590 + i * 82, width: 340, height: 62 }
    : null;
const parked = (s: Read): Ball => ({
  id: s.nextId,
  ...polar(C.DEFLECTOR_BALL_CONTACT_RADIUS, s.paddleAngleDeg),
  vx: 0,
  vy: 0,
  parked: true,
  spawnTick: s.ticks,
});
function park(s: Read) {
  if (s.balls.some((b) => b.parked) || s.balls.length >= C.BALL_CAP)
    throw new Error("Kessler: cannot park ball");
  return {
    ...copy(s),
    balls: [...s.balls.map((b) => ({ ...b })), parked(s)],
    nextId: s.nextId + 1,
  };
}
function launch(s: Read) {
  const i = s.balls.findIndex((b) => b.parked);
  if (i < 0) throw new Error("Kessler: no parked ball");
  const v = speed(s.wave),
    a = rd(s.paddleAngleDeg);
  return {
    ...copy(s),
    balls: s.balls.map((b, j) =>
      j === i
        ? { ...b, parked: false, vx: Math.cos(a) * v, vy: Math.sin(a) * v }
        : { ...b },
    ),
  };
}
function drawPod(): Kind | null {
  if (Math.random() >= C.POD_DROP_CHANCE) return null;
  let n = Math.random();
  for (const p of C.POD_KIND_TABLE) {
    n -= p.probability;
    if (n <= 0) return p.kind;
  }
  return "narrow";
}
function snap(s: Read): Snapshot {
  return {
    screen: s.screen,
    ticks: s.ticks,
    wave: s.wave,
    score: s.score,
    lives: s.lives,
    interstitialTicks: s.interstitialTicks,
    waveAdvance: s.waveAdvance,
    podSpawn: s.podSpawn,
    nextPod: s.nextPod,
    paddle: { angleDeg: norm(s.paddleAngleDeg), spanDeg: span(s) },
    balls: s.balls.map((b) => ({
      x: b.x,
      y: b.y,
      vx: b.vx,
      vy: b.vy,
      parked: b.parked,
      piercing: s.pierceTicks > 0,
    })),
    rings: s.rings.map((r) => ({
      angleDeg: norm(r.angleDeg),
      speedDegPerSec: r.speedDegPerSec,
      targets: r.targets.map((t) => ({ ...t })),
    })),
    pods: s.pods.map((p) => ({ kind: p.kind, ...polar(p.radius, p.angleDeg) })),
    effects: {
      widenTicks: s.widenTicks,
      narrowTicks: s.narrowTicks,
      pierceTicks: s.pierceTicks,
      shieldActive: s.shieldActive,
    },
    menu: {
      index: s.screen === "title" || s.screen === "paused" ? s.menuIndex : 0,
    },
  };
}

function makeDebug(a: Assets): KesslerDebugApi {
  const ri = (r: number) => {
    whole(r, 1, "ring");
    if (r > 3) throw new RangeError("ring must be 1..3");
    return r - 1;
  };
  const setR = (s: Read, i: number, r: Ring) => ({
    ...copy(s),
    rings: s.rings.map((x, j) =>
      j === i ? r : { ...x, targets: x.targets.map((t) => ({ ...t })) },
    ),
  });
  return {
    version: 1,
    reset: () => base(a),
    reconcile: copy,
    snapshot: snap,
    menuItemRect: (s, i) => rect(s.screen, i),
    setScreen: (s, n) => {
      if (!(C.SCREENS as readonly string[]).includes(n))
        throw new RangeError("invalid screen");
      return { ...copy(s), screen: n };
    },
    setScore: (s, n) => {
      whole(n, 0, "score");
      return { ...copy(s), score: n };
    },
    setLives: (s, n) => {
      whole(n, 0, "lives");
      return { ...copy(s), lives: n };
    },
    setMenuIndex: (s, n) => {
      whole(n, 0, "menu");
      if (!rect(s.screen, n)) throw new RangeError("invalid menu entry");
      return { ...copy(s), menuIndex: n };
    },
    setInterstitialTicks: (s, n) => {
      whole(n, 0, "timer");
      return { ...copy(s), interstitialTicks: n };
    },
    setWave: (s, n) => {
      whole(n, 1, "wave");
      return {
        ...copy(s),
        wave: n,
        rings: s.rings.map((r, i) => ({
          ...r,
          speedDegPerSec: rs(i, n),
          targets: r.targets.map((t) => ({ ...t })),
        })),
      };
    },
    setPaddleAngle: (s, n) => {
      if (!Number.isFinite(n)) throw new RangeError("angle");
      const an = norm(n),
        p = polar(C.DEFLECTOR_BALL_CONTACT_RADIUS, an);
      return {
        ...copy(s),
        paddleAngleDeg: an,
        balls: s.balls.map((b) => (b.parked ? { ...b, ...p } : { ...b })),
      };
    },
    launchBall: launch,
    clearBalls: (s) => ({ ...copy(s), balls: [] }),
    spawnBall: (s, x, y, vx, vy) => {
      if (
        ![x, y, vx, vy].every(Number.isFinite) ||
        s.balls.length >= C.BALL_CAP
      )
        throw new RangeError("invalid ball");
      return {
        ...copy(s),
        balls: [
          ...s.balls.map((b) => ({ ...b })),
          { id: s.nextId, x, y, vx, vy, parked: false, spawnTick: s.ticks },
        ],
        nextId: s.nextId + 1,
      };
    },
    parkBall: park,
    clearTargets: (s) => ({
      ...copy(s),
      rings: s.rings.map((r) => ({ ...r, targets: [] })),
    }),
    spawnTarget: (s, r, slot, hp) => {
      const i = ri(r);
      whole(slot, 0, "slot");
      whole(hp, 1, "hp");
      if (slot >= C.RINGS[i].slots) throw new RangeError("slot");
      const q = s.rings[i];
      return setR(s, i, {
        ...q,
        targets: [
          ...q.targets.filter((t) => t.slot !== slot).map((t) => ({ ...t })),
          { slot, hp },
        ].sort((x, y) => x.slot - y.slot),
      });
    },
    setRingAngle: (s, r, n) => {
      const i = ri(r);
      if (!Number.isFinite(n)) throw new RangeError("angle");
      return setR(s, i, {
        ...s.rings[i],
        angleDeg: norm(n),
        targets: s.rings[i].targets.map((t) => ({ ...t })),
      });
    },
    setRingSpeed: (s, r, n) => {
      const i = ri(r);
      if (!Number.isFinite(n)) throw new RangeError("speed");
      return setR(s, i, {
        ...s.rings[i],
        speedDegPerSec: n,
        targets: s.rings[i].targets.map((t) => ({ ...t })),
      });
    },
    clearPods: (s) => ({ ...copy(s), pods: [] }),
    spawnPod: (s, k, x, y) => {
      if (
        !(C.POD_KINDS as readonly string[]).includes(k) ||
        ![x, y].every(Number.isFinite)
      )
        throw new RangeError("pod");
      return {
        ...copy(s),
        pods: [
          ...s.pods.map((p) => ({ ...p })),
          {
            id: s.nextId,
            kind: k,
            radius: radius(x, y),
            angleDeg: angle(x, y),
          },
        ],
        nextId: s.nextId + 1,
      };
    },
    setNextPod: (s, k) => {
      if (k !== "none" && !(C.POD_KINDS as readonly string[]).includes(k))
        throw new RangeError("pod");
      return { ...copy(s), nextPod: k };
    },
    drawPod: () => drawPod(),
    setEffectTicks: (s, k, n) => {
      whole(n, 0, "effect");
      if (!["widen", "narrow", "pierce"].includes(k))
        throw new RangeError("effect");
      return {
        ...copy(s),
        widenTicks: k === "widen" ? n : k === "narrow" && n ? 0 : s.widenTicks,
        narrowTicks:
          k === "narrow" ? n : k === "widen" && n ? 0 : s.narrowTicks,
        pierceTicks: k === "pierce" ? n : s.pierceTicks,
      };
    },
    setShield: (s, on) => ({ ...copy(s), shieldActive: on }),
    setWaveAdvance: (s, on) => ({ ...copy(s), waveAdvance: on }),
    setPodSpawn: (s, on) => ({ ...copy(s), podSpawn: on }),
  };
}

const rotate = (vx: number, vy: number, a: number) => ({
  vx: vx * Math.cos(rd(a)) - vy * Math.sin(rd(a)),
  vy: vx * Math.sin(rd(a)) + vy * Math.cos(rd(a)),
});
function reflect(b: Ball, face: boolean, kick = 0) {
  const a = angle(b.x, b.y),
    n = { x: Math.cos(rd(a)), y: Math.sin(rd(a)) },
    t = { x: -n.y, y: n.x },
    axis = face ? n : t,
    d = b.vx * axis.x + b.vy * axis.y,
    sp = Math.hypot(b.vx, b.vy);
  let vx = b.vx - 2 * d * axis.x + kick * t.x,
    vy = b.vy - 2 * d * axis.y + kick * t.y;
  const m = Math.hypot(vx, vy) || 1;
  vx *= sp / m;
  vy *= sp / m;
  const va = norm(dg(Math.atan2(vy, vx))),
    po = da(va, a),
    pi = da(va, norm(a + 180)),
    p = Math.abs(po) <= Math.abs(pi) ? po : pi,
    v = rotate(
      vx,
      vy,
      -Math.sign(p) * Math.min(C.ORBITAL_DECAY_DEG, Math.abs(p)),
    );
  return { ...b, ...v };
}
function paddleBounce(b: Ball, s: Read) {
  const a = angle(b.x, b.y),
    nx = Math.cos(rd(a)),
    ny = Math.sin(rd(a)),
    d = b.vx * nx + b.vy * ny;
  const v = rotate(
      b.vx - 2 * d * nx,
      b.vy - 2 * d * ny,
      C.ENGLISH_DEG_PER_OFFSET_DEG * da(a, s.paddleAngleDeg),
    ),
    off = Math.max(
      -C.BOUNCE_CLAMP_DEG,
      Math.min(C.BOUNCE_CLAMP_DEG, da(norm(dg(Math.atan2(v.vy, v.vx))), a)),
    ),
    sp = speed(s.wave);
  return {
    ...b,
    vx: Math.cos(rd(a + off)) * sp,
    vy: Math.sin(rd(a + off)) * sp,
  };
}
const arc = (a: number, r: Ring, i: number, slot: number) =>
  Math.abs(
    da(
      a,
      norm(
        r.angleDeg +
          slot * C.RINGS[i].slotWidthDeg +
          C.STRUCTURAL_GAP_DEG +
          C.RINGS[i].targetArcDeg / 2,
      ),
    ),
  ) <=
  C.RINGS[i].targetArcDeg / 2;
const burst = (
  s: KesslerState,
  kind: PFX,
  x: number,
  y: number,
): KesslerState => ({
  ...s,
  bursts: [...s.bursts, { id: s.nextId, kind, x, y }],
  nextId: s.nextId + 1,
});
function caught(s: KesslerState, p: Pod, api: UpdateApi) {
  api.audio.play(p.kind === "narrow" ? C.CUES.podCatchNarrow : C.CUES.podCatch);
  let n = { ...s, score: s.score + C.POD_CATCH_SCORE };
  if (p.kind === "widen")
    n = { ...n, widenTicks: C.WIDEN_DURATION_TICKS, narrowTicks: 0 };
  if (p.kind === "narrow")
    n = { ...n, narrowTicks: C.NARROW_DURATION_TICKS, widenTicks: 0 };
  if (p.kind === "pierce") n = { ...n, pierceTicks: C.PIERCE_DURATION_TICKS };
  if (p.kind === "shield") n = { ...n, shieldActive: true };
  if (p.kind === "multiball") {
    const bs = [...n.balls];
    let used = 0;
    for (
      let i = 0;
      i < C.MULTIBALL_LAUNCH_COUNT && bs.length < C.BALL_CAP;
      i++
    ) {
      const h =
          n.paddleAngleDeg +
          (i ? -C.MULTIBALL_OFFSET_DEG : C.MULTIBALL_OFFSET_DEG),
        q = polar(C.DEFLECTOR_BALL_CONTACT_RADIUS, n.paddleAngleDeg),
        v = speed(n.wave);
      bs.push({
        id: n.nextId + used,
        ...q,
        vx: Math.cos(rd(h)) * v,
        vy: Math.sin(rd(h)) * v,
        parked: false,
        spawnTick: n.ticks,
      });
      used++;
    }
    n = { ...n, balls: bs, nextId: n.nextId + used };
  }
  return n;
}
function destroyed(
  s: KesslerState,
  i: number,
  t: Target,
  a: number,
  api: UpdateApi,
) {
  const cfg = C.RINGS[i],
    q = polar(cfg.midRadius, a);
  api.audio.play(C.CUES.targetBreak);
  let n = burst(
    {
      ...s,
      score: s.score + cfg.destroyScore,
      rings: s.rings.map((r, j) =>
        j === i
          ? { ...r, targets: r.targets.filter((x) => x.slot !== t.slot) }
          : r,
      ),
    },
    "burst",
    q.x,
    q.y,
  );
  if (n.podSpawn) {
    const out =
      n.nextPod === null ? drawPod() : n.nextPod === "none" ? null : n.nextPod;
    n = { ...n, nextPod: null };
    if (out)
      n = {
        ...n,
        pods: [
          ...n.pods,
          { id: n.nextId, kind: out, radius: cfg.midRadius, angleDeg: a },
        ],
        nextId: n.nextId + 1,
      };
  }
  if (n.waveAdvance && n.rings.every((r) => r.targets.length === 0)) {
    api.audio.play(C.CUES.waveClear);
    n = {
      ...n,
      screen: "waveclear",
      score: n.score + C.WAVE_CLEAR_BONUS_PER_WAVE * n.wave,
      interstitialTicks: C.WAVECLEAR_TICKS,
      balls: [],
      pods: [],
      widenTicks: 0,
      narrowTicks: 0,
      pierceTicks: 0,
      shieldActive: false,
    };
  }
  return n;
}
function tick(s0: KesslerState, api: UpdateApi): KesslerState {
  if (s0.screen === "waveclear") {
    if (s0.interstitialTicks <= 1) {
      const w = s0.wave + 1;
      return park({
        ...s0,
        ticks: s0.ticks + 1,
        screen: "playing",
        wave: w,
        interstitialTicks: 0,
        rings: rings(w),
      });
    }
    return {
      ...s0,
      ticks: s0.ticks + 1,
      interstitialTicks: s0.interstitialTicks - 1,
    };
  }
  if (s0.screen !== "playing") return { ...s0, ticks: s0.ticks + 1 };
  let s: KesslerState = {
    ...s0,
    ticks: s0.ticks + 1,
    paddleAngleDeg: norm(
      s0.paddleAngleDeg +
        (api.input.value("right") - api.input.value("left")) *
          C.DEFLECTOR_TURN_DEG_PER_SEC *
          C.TICK_DT,
    ),
    rings: s0.rings.map((r) => ({
      ...r,
      angleDeg: norm(r.angleDeg + r.speedDegPerSec * C.TICK_DT),
    })),
    widenTicks: Math.max(0, s0.widenTicks - 1),
    narrowTicks: Math.max(0, s0.narrowTicks - 1),
    pierceTicks: Math.max(0, s0.pierceTicks - 1),
  };
  const pp = polar(C.DEFLECTOR_BALL_CONTACT_RADIUS, s.paddleAngleDeg);
  s = { ...s, balls: s.balls.map((b) => (b.parked ? { ...b, ...pp } : b)) };
  const pods: Pod[] = [];
  for (const p of s.pods) {
    const nr = p.radius - C.POD_FALL_SPEED * C.TICK_DT,
      np = { ...p, radius: nr };
    if (
      p.radius > C.DEFLECTOR_POD_CATCH_RADIUS &&
      nr <= C.DEFLECTOR_POD_CATCH_RADIUS &&
      Math.abs(da(p.angleDeg, s.paddleAngleDeg)) <= span(s) / 2
    )
      s = caught(s, np, api);
    else if (nr <= C.BURNUP_RADIUS) {
      const q = polar(nr, p.angleDeg);
      api.audio.play(C.CUES.podBurn);
      s = burst(s, "burnup", q.x, q.y);
    } else pods.push(np);
  }
  s = { ...s, pods };
  const balls: Ball[] = [];
  let ballBurned = false;
  for (const old of s.balls) {
    if (s.screen !== "playing") break;
    if (old.parked) {
      balls.push(old);
      continue;
    }
    const pr = radius(old.x, old.y),
      pa = angle(old.x, old.y);
    let b = {
      ...old,
      x: old.x + old.vx * C.TICK_DT,
      y: old.y + old.vy * C.TICK_DT,
    };
    const nr = radius(b.x, b.y),
      a = angle(b.x, b.y),
      rv = b.vx * Math.cos(rd(a)) + b.vy * Math.sin(rd(a));
    if (
      s.shieldActive &&
      pr > C.SHIELD_CONTACT_RADIUS &&
      nr <= C.SHIELD_CONTACT_RADIUS &&
      rv < 0
    ) {
      b = reflect(b, true);
      s = burst({ ...s, shieldActive: false }, "spark", b.x, b.y);
      api.audio.play(C.CUES.shieldReflect);
    } else if (
      pr > C.DEFLECTOR_BALL_CONTACT_RADIUS &&
      nr <= C.DEFLECTOR_BALL_CONTACT_RADIUS &&
      rv < 0 &&
      Math.abs(da(a, s.paddleAngleDeg)) <= span(s) / 2
    ) {
      b = paddleBounce(b, s);
      s = burst(s, "spark", b.x, b.y);
      api.audio.play(C.CUES.paddleBounce);
    } else if (nr <= C.BURNUP_RADIUS) {
      api.audio.play(C.CUES.ballLost);
      s = burst(s, "burnup", b.x, b.y);
      ballBurned = true;
      continue;
    } else if (
      pr < C.FIELD_CONTACT_RADIUS &&
      nr >= C.FIELD_CONTACT_RADIUS &&
      rv > 0
    ) {
      b = reflect(b, true);
      s = burst(s, "spark", b.x, b.y);
      api.audio.play(C.CUES.fieldBounce);
    } else {
      let done = false;
      for (let i = 0; i < C.RINGS.length && !done; i++) {
        const cfg = C.RINGS[i],
          r = s.rings[i];
        let t: Target | undefined,
          face = false;
        if (
          (pr > cfg.outerContactRadius && nr <= cfg.outerContactRadius) ||
          (pr < cfg.innerContactRadius && nr >= cfg.innerContactRadius)
        ) {
          t = r.targets.find((x) => arc(a, r, i, x.slot));
          face = !!t;
        }
        if (!t && nr >= cfg.innerContactRadius && nr <= cfg.outerContactRadius)
          t = r.targets.find(
            (x) =>
              !arc(
                pa,
                {
                  ...r,
                  angleDeg: norm(r.angleDeg - r.speedDegPerSec * C.TICK_DT),
                },
                i,
                x.slot,
              ) && arc(a, r, i, x.slot),
          );
        if (t) {
          done = true;
          const ta = norm(
            r.angleDeg +
              t.slot * cfg.slotWidthDeg +
              C.STRUCTURAL_GAP_DEG +
              cfg.targetArcDeg / 2,
          );
          if (s.pierceTicks || t.hp <= 1) s = destroyed(s, i, t, ta, api);
          else {
            api.audio.play(C.CUES.targetHit);
            s = {
              ...s,
              score: s.score + C.HIT_SCORE,
              rings: s.rings.map((x, j) =>
                j === i
                  ? {
                      ...x,
                      targets: x.targets.map((y) =>
                        y.slot === t?.slot ? { ...y, hp: y.hp - 1 } : y,
                      ),
                    }
                  : x,
              ),
            };
          }
          if (!s.pierceTicks)
            b = reflect(
              b,
              face,
              C.RING_KICK_FACTOR * rd(r.speedDegPerSec) * nr,
            );
        }
      }
    }
    if (s.screen === "playing") balls.push(b);
  }
  if (s.screen !== "playing") return s;
  s = { ...s, balls };
  if (ballBurned && !s.balls.length) {
    const lives = Math.max(0, s.lives - 1);
    s = {
      ...s,
      lives,
      pods: [],
      widenTicks: 0,
      narrowTicks: 0,
      pierceTicks: 0,
      shieldActive: false,
    };
    if (!lives) {
      api.audio.play(C.CUES.gameOver);
      s = { ...s, screen: "gameover" };
    } else s = park(s);
  }
  return s;
}

function music(screen: Screen, api: UpdateApi) {
  const title = screen === "title" || screen === "howto",
    play =
      screen === "playing" || screen === "waveclear" || screen === "paused";
  if (title) {
    api.audio.loop("music-title");
    api.audio.stop("music-play");
  } else if (play) {
    api.audio.stop("music-title");
    api.audio.loop("music-play");
  } else {
    api.audio.stop("music-title");
    api.audio.stop("music-play");
  }
}
function accept(s: KesslerState, api: UpdateApi): KesslerState {
  api.audio.play(C.CUES.menuSelect);
  if (s.screen === "title") {
    if (s.menuIndex) return { ...s, screen: "howto" as const };
    return park({ ...base(s.assets), screen: "playing" });
  }
  if (s.screen === "paused")
    return s.menuIndex ? base(s.assets) : { ...s, screen: "playing" as const };
  return s;
}
function inputs(s0: KesslerState, api: UpdateApi): KesslerState {
  let s: KesslerState = s0;
  const screen = s.screen;
  if (screen === "title" || screen === "paused") {
    const up = api.input.pressed("up");
    const down = api.input.pressed("down");
    if (up || down) {
      s = {
        ...s,
        menuIndex: (s.menuIndex + (up ? -1 : 1) + 2) % 2,
      };
      api.audio.play(C.CUES.menuMove);
    }
    const p = api.input.pointer(),
      hover = [0, 1].find((i) => {
        const r = rect(screen, i)!;
        return (
          p.x >= r.x &&
          p.x <= r.x + r.width &&
          p.y >= r.y &&
          p.y <= r.y + r.height
        );
      });
    if (hover !== undefined && hover !== s.menuIndex) {
      s = { ...s, menuIndex: hover };
      api.audio.play(C.CUES.menuMove);
    }
    if (api.input.pointerPressed()) s = { ...s, pointerArmed: hover ?? null };
    if (api.input.pointerReleased()) {
      if (hover !== undefined && s.pointerArmed === hover) s = accept(s, api);
      s = { ...s, pointerArmed: null };
    } else if (api.input.pressed("confirm")) s = accept(s, api);
    else if (
      screen === "paused" &&
      (api.input.pressed("back") || api.input.pressed("pause"))
    )
      s = { ...s, screen: "playing", menuIndex: 0 };
  } else if (
    screen === "howto" &&
    (api.input.pressed("confirm") || api.input.pressed("back"))
  ) {
    api.audio.play(C.CUES.menuSelect);
    s = { ...s, screen: "title", menuIndex: 1 };
  } else if (screen === "playing") {
    if (api.input.pressed("back") || api.input.pressed("pause"))
      s = { ...s, screen: "paused", menuIndex: 0 };
    else if (api.input.pressed("launch") && s.balls.some((b) => b.parked))
      s = launch(s);
  } else if (screen === "gameover" && api.input.pressed("confirm")) {
    api.audio.play(C.CUES.menuSelect);
    s = base(s.assets);
  }
  return s;
}

const players = new Map<
  number,
  { p: ParticleCanvasPlayer; born: number; x: number; y: number }
>();
function drawArc(c: CanvasRenderingContext2D, r: number, a: number, b: number) {
  c.beginPath();
  c.arc(500, 500, r, rd(a), rd(b));
  c.stroke();
}
function field(s: Read, api: RenderApi) {
  const c = api.ctx,
    g = c.createRadialGradient(500, 500, 40, 500, 500, 700);
  g.addColorStop(0, "#10243b");
  g.addColorStop(0.55, "#070c1a");
  g.addColorStop(1, BACKGROUND);
  c.fillStyle = g;
  c.fillRect(0, 0, 1000, 1000);
  c.fillStyle = "#c7e4ff";
  for (let i = 0; i < 150; i++) {
    c.globalAlpha = 0.25 + ((i * 17) % 70) / 100;
    c.beginPath();
    c.arc(
      (i * 197 + 37) % 1000,
      (i * 431 + 83) % 1000,
      i % 19 === 0 ? 1.8 : i % 5 === 0 ? 1.1 : 0.55,
      0,
      Math.PI * 2,
    );
    c.fill();
  }
  c.globalAlpha = 1;
  c.save();
  c.shadowBlur = 18;
  c.shadowColor = "#55d8ff";
  c.strokeStyle = "rgba(99,220,255,.5)";
  c.lineWidth = 2;
  c.setLineDash([4, 10]);
  c.beginPath();
  c.arc(500, 500, C.FIELD_RADIUS, 0, Math.PI * 2);
  c.stroke();
  c.restore();
  for (let i = 2; i >= 0; i--) {
    const q = C.RINGS[i],
      r = s.rings[i];
    c.strokeStyle = "rgba(83,160,184,.16)";
    c.lineWidth = q.outerRadius - q.innerRadius;
    c.beginPath();
    c.arc(500, 500, (q.innerRadius + q.outerRadius) / 2, 0, Math.PI * 2);
    c.stroke();
    for (const t of r.targets) {
      const st = r.angleDeg + t.slot * q.slotWidthDeg + C.STRUCTURAL_GAP_DEG;
      c.save();
      c.lineCap = "round";
      c.lineWidth = q.outerRadius - q.innerRadius - 4;
      c.shadowBlur = 10;
      c.shadowColor = i === 2 ? "#ff6ee7" : "#55e5ef";
      c.strokeStyle =
        t.hp < q.hitPoints
          ? "#ff9a62"
          : i === 0
            ? "#83f2d0"
            : i === 1
              ? "#58d7e7"
              : "#ca75d8";
      drawArc(c, (q.innerRadius + q.outerRadius) / 2, st, st + q.targetArcDeg);
      c.restore();
    }
  }
  c.drawImage(s.assets.planet, 420, 420, 160, 160);
  c.strokeStyle = "rgba(53,128,160,.4)";
  c.lineWidth = 2;
  c.beginPath();
  c.arc(500, 500, 178, 0, Math.PI * 2);
  c.stroke();
  if (s.shieldActive) {
    c.save();
    c.shadowBlur = 20;
    c.shadowColor = "#5af7ff";
    c.strokeStyle = "#79ecff";
    c.lineWidth = 4;
    c.setLineDash([12, 7]);
    c.beginPath();
    c.arc(500, 500, C.SHIELD_RADIUS, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }
  c.save();
  c.lineCap = "round";
  c.shadowBlur = 16;
  c.shadowColor = "#fff2b5";
  c.strokeStyle = "#f9d66c";
  c.lineWidth = 16;
  drawArc(
    c,
    178,
    s.paddleAngleDeg - span(s) / 2,
    s.paddleAngleDeg + span(s) / 2,
  );
  c.restore();
  for (const b of s.balls) {
    const f =
      Math.floor(Math.max(0, s.ticks - b.spawnTick) / C.BALL_FRAME_TICKS) % 6;
    c.drawImage(s.assets.balls[f], b.x - 12, b.y - 12, 24, 24);
  }
  for (const p of s.pods) {
    const q = polar(p.radius, p.angleDeg);
    c.drawImage(s.assets.pods[p.kind], q.x - 12, q.y - 12, 24, 24);
  }
  c.fillStyle = "#d7efff";
  c.font = "600 22px system-ui";
  c.textAlign = "left";
  c.fillText(`SCORE  ${String(s.score).padStart(6, "0")}`, 34, 42);
  c.textAlign = "center";
  c.fillText(`WAVE  ${s.wave}`, 500, 42);
  c.textAlign = "right";
  c.fillText(`LIVES  ${s.lives}`, 966, 42);
  for (const e of s.bursts)
    if (!players.has(e.id))
      players.set(e.id, {
        p: new ParticleCanvasPlayer(
          s.assets.particles[e.kind] as ParticleSystem,
          c,
          { clear: false, pixelRadius: e.kind === "burst" ? 8 : 5 },
        ),
        born: api.frame().timeMs,
        x: e.x,
        y: e.y,
      });
  for (const [id, p] of players) {
    if (api.frame().timeMs - p.born > 1500) {
      players.delete(id);
      continue;
    }
    c.save();
    c.translate(p.x - 500, p.y - 500);
    p.p.update(Math.max(0, api.frame().lastDeltaMs / 1000));
    c.restore();
  }
}
function panel(c: CanvasRenderingContext2D, title: string, sub: string) {
  c.fillStyle = "rgba(3,7,16,.84)";
  c.fillRect(170, 185, 660, 630);
  c.strokeStyle = "rgba(102,227,255,.5)";
  c.strokeRect(170, 185, 660, 630);
  c.textAlign = "center";
  c.fillStyle = "#eafaff";
  c.font = "800 68px system-ui";
  c.fillText(title, 500, 300);
  c.fillStyle = "#82ddea";
  c.font = "500 19px system-ui";
  c.fillText(sub, 500, 343);
}
function menu(c: CanvasRenderingContext2D, s: Read, items: readonly string[]) {
  items.forEach((x, i) => {
    const r = rect(s.screen, i)!;
    c.fillStyle =
      i === s.menuIndex ? "rgba(79,220,234,.18)" : "rgba(13,28,42,.7)";
    c.fillRect(r.x, r.y, r.width, r.height);
    c.strokeStyle = i === s.menuIndex ? "#65e8f2" : "#567684";
    c.lineWidth = i === s.menuIndex ? 3 : 1;
    c.strokeRect(r.x, r.y, r.width, r.height);
    c.fillStyle = i === s.menuIndex ? "#ecfeff" : "#87a9b6";
    c.font = "700 25px system-ui";
    c.textAlign = "center";
    c.fillText(x, 500, r.y + 40);
  });
}
function render(s: Read, api: RenderApi) {
  field(s, api);
  const c = api.ctx;
  if (s.screen === "title") {
    c.fillStyle = "rgba(2,6,15,.58)";
    c.fillRect(0, 0, 1000, 1000);
    c.textAlign = "center";
    c.shadowBlur = 28;
    c.shadowColor = "#53e5ff";
    c.fillStyle = "#e9fcff";
    c.font = "800 112px system-ui";
    c.fillText(C.TITLE_TEXT, 500, 385);
    c.shadowBlur = 0;
    c.fillStyle = "#70cfdd";
    c.font = "500 20px system-ui";
    c.fillText("ORBITAL DEMOLITION // LOW EARTH CLEANUP", 500, 430);
    menu(c, s, C.TITLE_ITEMS);
  } else if (s.screen === "howto") {
    panel(c, "FLIGHT BRIEFING", "KEEP THE SKY CLEAR. KEEP THE PLANET SAFE.");
    c.textAlign = "left";
    c.fillStyle = "#c7e4ec";
    c.font = "500 21px system-ui";
    [
      "Circle the planet with A / D or the arrow keys.",
      "Press SPACE to launch. Meet the ball with the deflector to steer it.",
      "Miss it and it burns up; losing the last live ball costs a life.",
      "Break every derelict to clear the wave and bank the wave bonus.",
      "Catch salvage: widen, multiball, shield, pierce — and narrow.",
      "P or ESC pauses. ENTER / SPACE confirms.",
    ].forEach((x, i) => c.fillText(x, 235, 405 + i * 55));
    c.textAlign = "center";
    c.fillStyle = "#63dce8";
    c.fillText("PRESS ENTER, SPACE, OR ESC TO RETURN", 500, 755);
  } else if (s.screen === "paused") {
    c.fillStyle = "rgba(2,5,13,.66)";
    c.fillRect(0, 0, 1000, 1000);
    panel(c, "ORBIT HOLD", "SIMULATION PAUSED");
    menu(c, s, C.PAUSE_ITEMS);
  } else if (s.screen === "waveclear") {
    c.fillStyle = "rgba(3,12,23,.7)";
    c.fillRect(0, 350, 1000, 300);
    c.textAlign = "center";
    c.fillStyle = "#bffcff";
    c.font = "800 62px system-ui";
    c.fillText(`WAVE ${s.wave} CLEARED`, 500, 485);
    c.font = "500 23px system-ui";
    c.fillText(
      `ORBIT PURGED  +${C.WAVE_CLEAR_BONUS_PER_WAVE * s.wave}`,
      500,
      535,
    );
  } else if (s.screen === "gameover") {
    c.fillStyle = "rgba(4,3,10,.8)";
    c.fillRect(0, 0, 1000, 1000);
    panel(c, C.GAMEOVER_TEXT, "THE CASCADE WON");
    c.fillStyle = "#ffd0c2";
    c.font = "700 30px system-ui";
    c.fillText(`FINAL SCORE  ${s.score}`, 500, 470);
    c.fillText(`WAVE REACHED  ${s.wave}`, 500, 520);
    c.fillStyle = "#85dce5";
    c.font = "500 20px system-ui";
    c.fillText("PRESS ENTER OR SPACE", 500, 650);
  }
}

export const game: Game<KesslerState, KesslerDebugApi> = {
  async initialize(api: InitApi<KesslerState>) {
    for (const x of C.ACTIONS)
      api.input.register(x, {
        keys: [...C.BINDINGS[x]],
        kind: x === "left" || x === "right" ? "analog" : "digital",
      });
    const audio = Object.entries(C.CUE_PATHS).map(([n, p]) =>
      api.audio.load(n, p),
    );
    audio.push(
      api.audio.load("music-title", C.BED_PATHS.title),
      api.audio.load("music-play", C.BED_PATHS.play),
    );
    const paths = [
        C.SPRITE_PATHS.planet,
        ...C.POD_KINDS.map((k) => C.SPRITE_PATHS.pods[k]),
        ...C.SPRITE_PATHS.ball,
      ],
      imgs = await Promise.all(paths.map((p) => api.assets.loadImage(p))),
      ps = await Promise.all(
        Object.entries(C.PARTICLE_PATHS).map(
          async ([k, p]) =>
            [k, JSON.parse(await (await api.assets.load(p)).text())] as const,
        ),
      );
    await Promise.all(audio);
    const a: Assets = {
      planet: imgs[0],
      pods: Object.fromEntries(
        C.POD_KINDS.map((k, i) => [k, imgs[i + 1]]),
      ) as Record<Kind, ImageBitmap>,
      balls: imgs.slice(6),
      particles: Object.fromEntries(ps) as Record<PFX, ParticleSystem>,
    };
    const regs: [string, (s: Read) => string | number | boolean][] = [
      ["screen", (s) => s.screen],
      ["score", (s) => s.score],
      ["lives", (s) => s.lives],
      ["wave", (s) => s.wave],
      ["paddle", (s) => `${s.paddleAngleDeg.toFixed(1)} / ${span(s)}`],
      ["balls", (s) => s.balls.length],
      ["targets", (s) => s.rings.reduce((n, r) => n + r.targets.length, 0)],
      ["pods", (s) => s.pods.length],
      ["widen", (s) => s.widenTicks],
      ["narrow", (s) => s.narrowTicks],
      ["pierce", (s) => s.pierceTicks],
      ["shield", (s) => s.shieldActive],
    ];
    for (const [n, f] of regs) api.diagnostics.register(n, f);
    return [base(a), makeDebug(a)];
  },
  update(read, api, dt) {
    let s = inputs(copy(read), api);
    music(s.screen, api);
    if (!Number.isFinite(dt) || dt < 0) return s;
    let a = s.accumulator + dt;
    while (a + 1e-12 >= C.TICK_DT) {
      s = tick(s, api);
      a -= C.TICK_DT;
    }
    return { ...s, accumulator: Math.max(0, a) };
  },
  render,
};
