import { fail, type MediaAsset } from "@meditaur/domain";

export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export const ALLOWED_AUDIO_MIME = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/ogg",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
  "audio/flac",
] as const;

export const ALLOWED_IMAGE_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export const MEDIA_ERRORS = {
  nameRequired: "Name is required",
  emptyFile: "File is empty",
  tooLarge: "File is too large",
  badType: "File type is not supported",
} as const;

function mediaFail(key: keyof typeof MEDIA_ERRORS): never {
  fail(`media.${key}`, MEDIA_ERRORS[key]);
}

export function requireMediaName(value: string): string {
  const name = value.trim();
  if (!name) mediaFail("nameRequired");
  return name;
}

export function requireMediaBytes(bytes: ArrayBuffer, kind: MediaAsset["kind"]): ArrayBuffer {
  if (bytes.byteLength === 0) mediaFail("emptyFile");
  const max = kind === "image" ? IMAGE_MAX_BYTES : MEDIA_MAX_BYTES;
  if (bytes.byteLength > max) mediaFail("tooLarge");
  return bytes;
}

export function requireMediaMime(value: string, kind: MediaAsset["kind"]): string {
  const mime = value.trim().toLowerCase();
  const allowed: readonly string[] = kind === "image" ? ALLOWED_IMAGE_MIME : ALLOWED_AUDIO_MIME;
  if (!allowed.includes(mime)) {
    mediaFail("badType");
  }
  return mime;
}

export function mediaAssetFromUpload(input: {
  id: string;
  workspaceId: string;
  kind: MediaAsset["kind"];
  name: string;
  durationMs: number;
  /** Where it goes in the list: after the last row, which the caller looks up. */
  sortOrder: number;
}): MediaAsset {
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    kind: input.kind,
    name: requireMediaName(input.name),
    storagePath: input.id,
    durationMs: Math.max(0, Math.round(input.durationMs)),
    sortOrder: input.sortOrder,
    // A brand new row starts unversioned; the write that stores it is what
    // stamps the first revision.
    revision: 0,
    updatedAt: 0,
  };
}
