import { describe, expect, it } from "vitest";
import { formatClock, mixToMono, pickRecordingMimeType, resampleLinear } from "@/lib/voice/audio";

describe("mixToMono", () => {
  it("averages channels sample by sample", () => {
    const left = new Float32Array([1, 0, -1, 0.5]);
    const right = new Float32Array([0, 0, 1, 0.5]);
    expect(Array.from(mixToMono([left, right]))).toEqual([0.5, 0, 0, 0.5]);
  });

  it("copies a single channel instead of returning it", () => {
    const only = new Float32Array([0.25, -0.25]);
    const out = mixToMono([only]);
    expect(Array.from(out)).toEqual([0.25, -0.25]);
    expect(out).not.toBe(only);
  });

  it("returns an empty array for no channels", () => {
    expect(mixToMono([]).length).toBe(0);
  });
});

describe("resampleLinear", () => {
  it("is a no-op at the same rate", () => {
    const input = new Float32Array([1, 2, 3]);
    expect(resampleLinear(input, 16000, 16000)).toBe(input);
  });

  it("scales the length by the rate ratio", () => {
    const input = new Float32Array(48000);
    expect(resampleLinear(input, 48000, 16000).length).toBe(16000);
    expect(resampleLinear(new Float32Array(44100), 44100, 16000).length).toBe(16000);
    expect(resampleLinear(new Float32Array(8000), 8000, 16000).length).toBe(16000);
  });

  it("keeps a constant signal constant", () => {
    const input = new Float32Array(1000).fill(0.3);
    for (const v of resampleLinear(input, 44100, 16000)) expect(v).toBeCloseTo(0.3, 6);
  });

  it("interpolates a ramp linearly, without reading past the end", () => {
    const input = Float32Array.from({ length: 101 }, (_, i) => i / 100);
    const out = resampleLinear(input, 100, 50);
    expect(out.length).toBe(51);
    expect(out[0]).toBe(0);
    expect(out[25]).toBeCloseTo(0.5, 6);
    expect(out[50]).toBeCloseTo(1, 6);
    // Upsampling: midpoints land between neighbours.
    const up = resampleLinear(new Float32Array([0, 1]), 1, 2);
    expect(Array.from(up)).toEqual([0, 0.5, 1, 1]);
  });
});

describe("formatClock", () => {
  it("formats minutes and zero-padded seconds", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(7.9)).toBe("0:07");
    expect(formatClock(67)).toBe("1:07");
    expect(formatClock(120)).toBe("2:00");
    expect(formatClock(-3)).toBe("0:00");
  });
});

describe("pickRecordingMimeType", () => {
  it("prefers webm/opus, then mp4 (Safari)", () => {
    expect(pickRecordingMimeType((t) => t.startsWith("audio/webm"))).toBe("audio/webm;codecs=opus");
    expect(pickRecordingMimeType((t) => t === "audio/mp4")).toBe("audio/mp4");
  });

  it("returns undefined when nothing is supported or the probe throws", () => {
    expect(pickRecordingMimeType(() => false)).toBeUndefined();
    expect(
      pickRecordingMimeType(() => {
        throw new Error("no MediaRecorder");
      }),
    ).toBeUndefined();
  });
});
