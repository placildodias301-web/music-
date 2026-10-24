import { describe, expect, it } from "vitest";
import { encodeWav } from "./wavEncode";

describe("encodeWav", () => {
  it("writes a valid 16-bit stereo header and clamps samples", () => {
    const wav = encodeWav([new Float32Array([0, 1]), new Float32Array([-1, 2])], 44100);
    const view = new DataView(wav.buffer);
    const tag = (at: number) => String.fromCharCode(...wav.slice(at, at + 4));
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint32(40, true)).toBe(8); // 4 samples x 2 bytes
    expect(wav.length).toBe(44 + 8);
    expect([view.getInt16(44, true), view.getInt16(46, true), view.getInt16(48, true), view.getInt16(50, true)]).toEqual([0, 32767, -32768, 32767]);
  });
});
