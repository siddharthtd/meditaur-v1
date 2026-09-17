export const GRAPHIC_BANDS_HZ = [
  32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
] as const;

export const EQ_Q = 1.4;

export type EqBand = {
  hz: number;
  gainDb: number;
  q: number;
};

export type EarEq = {
  bands: EqBand[];
};

export function defaultEarEq(): EarEq {
  return {
    bands: GRAPHIC_BANDS_HZ.map((hz) => ({ hz, gainDb: 0, q: EQ_Q })),
  };
}

export function clampGainDb(gainDb: number): number {
  if (!Number.isFinite(gainDb)) {
    return 0;
  }
  return Math.min(12, Math.max(-12, gainDb));
}

export function setBandGain(eq: EarEq, hz: number, gainDb: number): EarEq {
  return {
    bands: eq.bands.map((band) =>
      band.hz === hz ? { ...band, gainDb: clampGainDb(gainDb) } : band,
    ),
  };
}

export function linkEq(from: EarEq): EarEq {
  return {
    bands: from.bands.map((band) => ({ ...band })),
  };
}

export function isFlatEq(eq: EarEq): boolean {
  return eq.bands.every((band) => band.gainDb === 0);
}
