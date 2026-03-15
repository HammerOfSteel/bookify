import { execFile, spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import type { Audiobook, AudiobookChapter, User } from "@prisma/client";
import { publicPathToAbsolute, writeGeneratedFile } from "@/lib/storage";
import { formatDuration, slugify } from "@/lib/utils";

const execFileAsync = promisify(execFile);

export type ProgressCallback = (percent: number, message: string) => void;
export type AudiobookOutputMode = "MP4_YOUTUBE_FAST" | "M4B_FAST";

type AudiobookWithRelations = Audiobook & {
  chapters: AudiobookChapter[];
  owner: Pick<User, "name">;
};

function resolveOutputMode(value: string | null | undefined): AudiobookOutputMode {
  if (value === "M4B_FAST" || value === "AUDIO") {
    return "M4B_FAST";
  }

  return "MP4_YOUTUBE_FAST";
}

async function assertBinary(command: string) {
  try {
    await execFileAsync(command, ["-version"]);
  } catch {
    throw new Error(`${command} is required for audiobook generation. Start the app through Docker Compose or install ${command} locally.`);
  }
}

async function getAudioDurationSeconds(filePath: string) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);

  return Math.max(1, Math.round(Number.parseFloat(stdout.trim()) || 0));
}

function spawnFfmpeg(args: string[], totalSeconds: number, percentStart: number, percentEnd: number, onProgress?: ProgressCallback): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    const errChunks: Buffer[] = [];
    const startedAt = Date.now();
    let lastProgressPercent = -1;
    let lastProgressAt = 0;

    proc.stderr.on("data", (chunk: Buffer) => {
      errChunks.push(chunk);

      if (onProgress && totalSeconds > 0) {
        const text = chunk.toString();
        const match = text.match(/time=(\d+):(\d+):(\d+\.\d+)/);

        if (match) {
          const decoded = Number.parseInt(match[1]) * 3600 + Number.parseInt(match[2]) * 60 + Number.parseFloat(match[3]);
          const ratio = Math.min(1, decoded / totalSeconds);
          const percent = Math.round(percentStart + ratio * (percentEnd - percentStart));
          const now = Date.now();
          const elapsedSeconds = Math.max(1, (now - startedAt) / 1000);
          const speed = decoded / elapsedSeconds;
          const remainingAudioSeconds = Math.max(0, totalSeconds - decoded);
          const etaSeconds = Math.round(speed > 0 ? remainingAudioSeconds / speed : remainingAudioSeconds);

          // Avoid flooding SSE logs while still giving frequent and meaningful updates.
          if (percent === lastProgressPercent && now - lastProgressAt < 1500) {
            return;
          }

          lastProgressPercent = percent;
          lastProgressAt = now;

          const timeLabel = `${formatDuration(Math.round(decoded))} / ${formatDuration(totalSeconds)}`;
          onProgress(
            percent,
            `ffmpeg: ${Math.round(ratio * 100)}% encoded (${timeLabel}) - ETA ${formatDuration(etaSeconds)} - ${speed.toFixed(2)}x`,
          );
        }
      }
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(errChunks).toString().slice(-1000);
        reject(new Error(`ffmpeg exited with code ${code}:\n${stderr}`));
      } else {
        resolve();
      }
    });

    proc.on("error", reject);
  });
}

async function createEncodedAudioOutput(
  inputPaths: string[],
  outputPath: string,
  totalDurationSeconds: number,
  onProgress?: ProgressCallback,
) {
  await mkdir(dirname(outputPath), { recursive: true });

  if (inputPaths.length === 1) {
    await spawnFfmpeg(
      [
        "-y",
        "-i",
        inputPaths[0],
        "-vn",
        "-ar",
        "44100",
        "-ac",
        "2",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        outputPath,
      ],
      totalDurationSeconds,
      22,
      88,
      onProgress,
    );

    return;
  }

  const filter = `${inputPaths.map((_, index) => `[${index}:a]`).join("")}concat=n=${inputPaths.length}:v=0:a=1[outa]`;

  await spawnFfmpeg(
    [
      "-y",
      ...inputPaths.flatMap((inputPath) => ["-i", inputPath]),
      "-filter_complex",
      filter,
      "-map",
      "[outa]",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      outputPath,
    ],
    totalDurationSeconds,
    22,
    88,
    onProgress,
  );
}

export async function generateAudiobookAssets(audiobook: AudiobookWithRelations, onProgress?: ProgressCallback) {
  const report = onProgress ?? (() => {});
  const mode = resolveOutputMode(audiobook.outputPreference);

  const chapters = audiobook.chapters
    .filter((chapter) => chapter.audioPath)
    .sort((left, right) => left.position - right.position);

  if (chapters.length === 0) {
    throw new Error("Upload at least one chapter audio file before generating an audiobook.");
  }

  report(2, "Checking ffmpeg...");
  await assertBinary("ffmpeg");
  report(5, "Checking ffprobe...");
  await assertBinary("ffprobe");

  const slug = slugify(audiobook.title || "audiobook");
  const inputPaths = chapters.map((chapter) => publicPathToAbsolute(chapter.audioPath!));

  report(6, `Measuring duration of ${chapters.length} chapter${chapters.length === 1 ? "" : "s"}...`);
  const durations = await Promise.all(
    inputPaths.map(async (filePath, index) => {
      const dur = await getAudioDurationSeconds(filePath);
      const pct = 6 + Math.round(((index + 1) / inputPaths.length) * 16);
      report(pct, `Measured "${chapters[index].title}": ${formatDuration(dur)}`);
      return dur;
    }),
  );

  const totalDurationSeconds = durations.reduce((total, dur) => total + dur, 0);

  const intermediateAudioRelativePath = `/storage/generated/audiobooks/${slug}-${Date.now()}-audio.m4a`;
  const intermediateAudioAbsolutePath = publicPathToAbsolute(intermediateAudioRelativePath);

  report(22, `Fast audio encode of ${chapters.length} track${chapters.length === 1 ? "" : "s"} (runtime: ${formatDuration(totalDurationSeconds)})...`);
  await createEncodedAudioOutput(inputPaths, intermediateAudioAbsolutePath, totalDurationSeconds, onProgress);
  report(88, "Audio track complete.");

  let offset = 0;
  const timestampText = chapters
    .map((chapter, index) => {
      const line = `${formatDuration(offset)} ${chapter.title}`;
      offset += durations[index];
      return line;
    })
    .join("\n");

  report(90, "Writing chapter timestamps...");
  const timestampPath = await writeGeneratedFile(
    `storage/generated/audiobooks/${slug}-${Date.now()}-timestamps.txt`,
    timestampText,
  );

  if (mode === "MP4_YOUTUBE_FAST") {
    if (!audiobook.coverImagePath) {
      throw new Error("Upload a cover image before generating a video audiobook.");
    }

    const videoRelativePath = `/storage/generated/audiobooks/${slug}-${Date.now()}.mp4`;
    const videoAbsolutePath = publicPathToAbsolute(videoRelativePath);
    await mkdir(dirname(videoAbsolutePath), { recursive: true });

    report(92, "Rendering YouTube-fast MP4 (1 fps still image)...");
    await spawnFfmpeg(
      [
        "-y",
        "-loop",
        "1",
        "-i",
        publicPathToAbsolute(audiobook.coverImagePath),
        "-i",
        intermediateAudioAbsolutePath,
        "-r",
        "1",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-tune",
        "stillimage",
        "-c:a",
        "copy",
        "-movflags",
        "+faststart",
        "-pix_fmt",
        "yuv420p",
        "-shortest",
        videoAbsolutePath,
      ],
      totalDurationSeconds,
      92,
      98,
      onProgress,
    );

    report(98, "YouTube-fast video render complete.");

    return {
      outputPath: videoRelativePath,
      timestampPath,
      durations,
    };
  }

  const m4bRelativePath = `/storage/generated/audiobooks/${slug}-${Date.now()}.m4b`;
  const m4bAbsolutePath = publicPathToAbsolute(m4bRelativePath);
  await mkdir(dirname(m4bAbsolutePath), { recursive: true });

  report(94, "Packaging M4B audiobook...");
  await spawnFfmpeg(
    [
      "-y",
      "-i",
      intermediateAudioAbsolutePath,
      "-c:a",
      "copy",
      m4bAbsolutePath,
    ],
    totalDurationSeconds,
    94,
    99,
    onProgress,
  );

  report(99, "M4B package complete.");

  return {
    outputPath: m4bRelativePath,
    timestampPath,
    durations,
  };
}