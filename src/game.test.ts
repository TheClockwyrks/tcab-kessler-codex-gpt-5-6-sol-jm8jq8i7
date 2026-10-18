import { describe, expect, it } from "vitest";
import type { InitApi, UpdateApi } from "@clockwyrks/simple-2d";
import { TICK_DT } from "./constants";
import { game, type KesslerState } from "./game";

const initApi = {
  input: { register() {}, layout: () => null },
  audio: { load: async () => {} },
  assets: {
    loadImage: async () => ({}) as ImageBitmap,
    load: async () =>
      new Blob([
        JSON.stringify({
          dimensions: 2,
          field: { width: 1000, height: 1000 },
          emitters: [],
          forces: {},
          timeline: { durationMs: 1, loop: false },
        }),
      ]),
  },
  diagnostics: { register() {} },
} as unknown as InitApi<KesslerState>;

const updateApi = {
  input: {
    value: () => 0,
    pressed: () => false,
    pointer: () => ({ x: 0, y: 0, down: false, device: "mouse", buttons: [] }),
    pointerPressed: () => false,
    pointerReleased: () => false,
  },
  audio: { play() {}, loop() {}, stop() {}, looping: () => false },
} as unknown as UpdateApi;

describe("Kessler simulation", () => {
  it("boots with the complete field and exact debug snapshot", async () => {
    const [state, debug] = await game.initialize(initApi);
    const snap = debug.snapshot(state);
    expect(snap.screen).toBe("title");
    expect(snap.lives).toBe(3);
    expect(snap.rings.map((r) => r.targets.length)).toEqual([12, 16, 20]);
    expect(debug.menuItemRect(state, 0)).toEqual({
      x: 330,
      y: 590,
      width: 340,
      height: 62,
    });
  });

  it("launches at wave speed and advances exact fixed ticks", async () => {
    const [boot, debug] = await game.initialize(initApi);
    let state = debug.parkBall(debug.setScreen(boot, "playing"));
    state = debug.launchBall(state);
    expect(debug.snapshot(state).balls[0].vy).toBeCloseTo(240);
    state = game.update(state, updateApi, TICK_DT * 2);
    expect(debug.snapshot(state).ticks).toBe(2);
    expect(debug.snapshot(state).balls[0].y).toBeCloseTo(702);
  });

  it("poses effects, pods, and ring angles", async () => {
    const [boot, debug] = await game.initialize(initApi);
    let state = debug.setEffectTicks(boot, "widen", 42);
    state = debug.spawnPod(state, "shield", 500, 800);
    state = debug.setRingAngle(state, 2, -15);
    expect(debug.snapshot(state).paddle.spanDeg).toBe(72);
    expect(debug.snapshot(state).pods[0]).toMatchObject({
      kind: "shield",
      x: 500,
      y: 800,
    });
    expect(debug.snapshot(state).rings[1].angleDeg).toBe(345);
    expect(() => debug.setLives(state, -1)).toThrow(RangeError);
  });
});
