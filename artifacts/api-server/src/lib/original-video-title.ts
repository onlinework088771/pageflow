import { execFile } from "node:child_process";
import fs from "fs";
import path from "path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_METADATA_TITLE_LENGTH = 512;
const FFPROBE_TIMEOUT_MS = 10_000;

export function parseBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

export function normalizeTitle(value: unknown): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

export function titleFromLocalFile(originalName: string): string | null {
  const baseName = path.basename(originalName.replace(/\\/g, "/")).replace(/\.[^.]+$/, "").trim();
  return baseName || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function metadataString(value: unknown): string | null {
  const normalized = normalizeTitle(value);
  if (!normalized || normalized.length > MAX_METADATA_TITLE_LENGTH) return null;
  return normalized;
}

function isGenericMetadata(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (/^(?:lavf|lavc)\d/i.test(normalized) || /^(?:ffmpeg|libav|handbrake|mencoder|moviepy|x264|x265)(?:[\s\d._-]|$)/i.test(normalized)) {
    return true;
  }
  return /^(?:untitled|unknown|none|null|video|movie)$/.test(normalized);
}

function tagValue(tags: unknown, key: string): string | null {
  if (!isRecord(tags)) return null;
  return metadataString(tags[key]);
}

/**
 * Select a usable title from ffprobe's format/stream tag output. Container and
 * stream title tags are primary; comment/description are only secondary and
 * generic encoder/application values are rejected.
 */
export function pickEmbeddedTitle(probe: unknown): string | null {
  if (!isRecord(probe)) return null;

  const format = isRecord(probe.format) ? probe.format : {};
  const formatTags = format.tags;
  const streams = Array.isArray(probe.streams) ? probe.streams : [];

  const primaryCandidates = [
    tagValue(formatTags, "title"),
    ...streams.map((stream) => tagValue(isRecord(stream) ? stream.tags : undefined, "title")),
  ];
  for (const candidate of primaryCandidates) {
    if (candidate && !isGenericMetadata(candidate)) return candidate;
  }

  const secondaryCandidates = [
    tagValue(formatTags, "comment"),
    tagValue(formatTags, "description"),
    ...streams.flatMap((stream) => {
      const tags = isRecord(stream) ? stream.tags : undefined;
      return [tagValue(tags, "comment"), tagValue(tags, "description")];
    }),
  ];
  for (const candidate of secondaryCandidates) {
    if (candidate && !isGenericMetadata(candidate)) return candidate;
  }

  return null;
}

/**
 * Read embedded MP4/QuickTime metadata without rewriting the media file.
 * The resolved path must remain inside the server upload root.
 */
export async function extractEmbeddedTitle(filePath: string, uploadsRoot: string): Promise<string | null> {
  try {
    const root = await fs.promises.realpath(uploadsRoot);
    const target = await fs.promises.realpath(filePath);
    if (target === root || !target.startsWith(`${root}${path.sep}`)) return null;
    await fs.promises.access(target, fs.constants.R_OK);
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v", "error",
        "-of", "json",
        "-show_entries", "format_tags=title,comment,description:stream_tags=title,comment,description",
        target,
      ],
      { timeout: FFPROBE_TIMEOUT_MS, maxBuffer: 128 * 1024 },
    );
    return pickEmbeddedTitle(JSON.parse(stdout));
  } catch {
    return null;
  }
}

export function hashtagsFromDescription(description: string): string {
  return (description.match(/#[\w\u0080-\uFFFF]+/g) ?? []).join(" ");
}
