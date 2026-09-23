"use client";

import { app } from "@/composition";
import { WebAudioMixer } from "@meditaur/audio-web";
import {
  SessionEngine,
  sessionIsLive,
  systemClock,
} from "@meditaur/domain";

export type MixerScope = "runner" | "tuner";

const mixers = new Map<MixerScope, WebAudioMixer>();
let runnerEngine: SessionEngine | null = null;

async function decodeAsset(scope: MixerScope, assetId: string) {
  const bytes = await app.getMediaBytes(assetId);
  if (!bytes) return null;
  const ctx = mixers.get(scope)?.getContext();
  if (!ctx) return null;
  return ctx.decodeAudioData(bytes.slice(0));
}

export function getMixer(scope: MixerScope): WebAudioMixer {
  const existing = mixers.get(scope);
  if (existing) return existing;
  const mixer = new WebAudioMixer(undefined, (assetId) => decodeAsset(scope, assetId));
  const resume = mixer.resume.bind(mixer);
  mixer.resume = async () => {
    for (const [key, other] of mixers) {
      if (key !== scope) other.suspend();
    }
    await resume();
  };
  mixers.set(scope, mixer);
  return mixer;
}

export function getEngine(): SessionEngine {
  if (!runnerEngine) {
    runnerEngine = new SessionEngine(systemClock, getMixer("runner"));
  }
  return runnerEngine;
}

export function liveSessionInstanceId(): string | null {
  const view = getEngine().getSnapshot();
  return sessionIsLive(view.status) ? view.instanceId : null;
}

export async function startSession(
  userId: string,
  workspaceId: string,
  planId: string,
): Promise<string> {
  const liveId = liveSessionInstanceId();
  if (liveId) return liveId;
  const snapshot = await app.compileSession(userId, workspaceId, planId);
  getEngine().load(snapshot);
  return snapshot.instanceId;
}

export async function startSessionFromMeditation(
  userId: string,
  workspaceId: string,
  meditationId: string,
): Promise<string> {
  const liveId = liveSessionInstanceId();
  if (liveId) return liveId;
  const snapshot = await app.startSessionFromMeditation(userId, workspaceId, meditationId);
  getEngine().load(snapshot);
  return snapshot.instanceId;
}
