import { execFile } from "node:child_process";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";

export const publicRoot = path.join(process.cwd(), "public");
const execFileAsync = promisify(execFile);
export type AudioConversionFormat = "mp3" | "m4a" | "ogg";

const conversionConfig: Record<AudioConversionFormat, { extension: string; args: string[] }> = {
  mp3: { extension: ".mp3", args: ["-c:a", "libmp3lame", "-b:a", "192k"] },
  m4a: { extension: ".m4a", args: ["-c:a", "aac", "-b:a", "160k"] },
  ogg: { extension: ".ogg", args: ["-c:a", "libvorbis", "-q:a", "5"] },
};

export async function saveUpload(file: File, folder: string) {
  if (!file || file.size === 0) {
    return null;
  }

  const extension = path.extname(file.name) || "";
  const fileName = `${Date.now()}-${randomUUID()}${extension}`;
  const targetDir = path.join(publicRoot, "storage", folder);
  const absolutePath = path.join(targetDir, fileName);

  await mkdir(targetDir, { recursive: true });
  await writeFile(absolutePath, Buffer.from(await file.arrayBuffer()));

  return `/storage/${folder}/${fileName}`;
}

export async function saveAudioUpload(file: File, folder: string, format: AudioConversionFormat = "mp3") {
  if (!file || file.size === 0) {
    return null;
  }

  const targetDir = path.join(publicRoot, "storage", folder);
  await mkdir(targetDir, { recursive: true });

  const tempExtension = path.extname(file.name) || ".wav";
  const tempFileName = `${Date.now()}-${randomUUID()}${tempExtension}`;
  const tempAbsolutePath = path.join(targetDir, tempFileName);
  const config = conversionConfig[format] ?? conversionConfig.mp3;
  const convertedFileName = `${Date.now()}-${randomUUID()}${config.extension}`;
  const convertedAbsolutePath = path.join(targetDir, convertedFileName);

  await writeFile(tempAbsolutePath, Buffer.from(await file.arrayBuffer()));

  try {
    await execFileAsync("ffmpeg", [
      "-y",
      "-i",
      tempAbsolutePath,
      "-vn",
      "-ar",
      "44100",
      "-ac",
      "2",
      ...config.args,
      convertedAbsolutePath,
    ]);

    await unlink(tempAbsolutePath).catch(() => undefined);

    return `/storage/${folder}/${convertedFileName}`;
  } catch {
    // Fallback to original upload if ffmpeg is unavailable.
    return `/storage/${folder}/${tempFileName}`;
  }
}

export async function saveAudioUploadAsMp3(file: File, folder: string) {
  return saveAudioUpload(file, folder, "mp3");
}

export async function writeGeneratedFile(relativePath: string, content: string) {
  const normalized = relativePath.replace(/^\/+/, "");
  const absolutePath = path.join(publicRoot, normalized);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");

  return `/${normalized}`;
}

export function publicPathToAbsolute(publicPath: string) {
  return path.join(publicRoot, publicPath.replace(/^\/+/, ""));
}
