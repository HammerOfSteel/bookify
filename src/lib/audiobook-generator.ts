import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Audiobook, AudiobookChapter, User } from "@prisma/client";
import { publicPathToAbsolute, writeGeneratedFile } from "@/lib/storage";
import { formatDuration, slugify } from "@/lib/utils";

const execFileAsync = promisify(execFile);

type AudiobookWithRelations = Audiobook & {
  chapters: AudiobookChapter[];
  owner: Pick<User, "name">;
};

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

async function createMp3Output(inputPaths: string[], outputPath: string) {
  if (inputPaths.length === 1) {
    await execFileAsync("ffmpeg", [
      "-y",
      "-i",
      inputPaths[0],
      "-vn",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-b:a",
      "192k",
      outputPath,
    ]);

    return;
  }

  const filter = `${inputPaths.map((_, index) => `[${index}:a]`).join("")}concat=n=${inputPaths.length}:v=0:a=1[outa]`;

  await execFileAsync("ffmpeg", [
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
    "-b:a",
    "192k",
    outputPath,
  ]);
}

export async function generateAudiobookAssets(audiobook: AudiobookWithRelations) {
  const chapters = audiobook.chapters
    .filter((chapter) => chapter.audioPath)
    .sort((left, right) => left.position - right.position);

  if (chapters.length === 0) {
    throw new Error("Upload at least one chapter audio file before generating an audiobook.");
  }

  await assertBinary("ffmpeg");
  await assertBinary("ffprobe");

  const slug = slugify(audiobook.title || "audiobook");
  const audioRelativePath = `/storage/generated/audiobooks/${slug}-${Date.now()}.mp3`;
  const audioAbsolutePath = publicPathToAbsolute(audioRelativePath);
  const inputPaths = chapters.map((chapter) => publicPathToAbsolute(chapter.audioPath!));

  await createMp3Output(inputPaths, audioAbsolutePath);

  const durations = await Promise.all(inputPaths.map((inputPath) => getAudioDurationSeconds(inputPath)));
  let offset = 0;
  const timestampText = chapters
    .map((chapter, index) => {
      const line = `${formatDuration(offset)} ${chapter.title}`;
      offset += durations[index];
      return line;
    })
    .join("\n");

  const timestampPath = await writeGeneratedFile(
    `storage/generated/audiobooks/${slug}-${Date.now()}-timestamps.txt`,
    timestampText,
  );

  if (audiobook.outputPreference === "VIDEO") {
    if (!audiobook.coverImagePath) {
      throw new Error("Upload a cover image before generating a video audiobook.");
    }

    const videoRelativePath = `/storage/generated/audiobooks/${slug}-${Date.now()}.mp4`;
    const videoAbsolutePath = publicPathToAbsolute(videoRelativePath);

    await execFileAsync("ffmpeg", [
      "-y",
      "-loop",
      "1",
      "-i",
      publicPathToAbsolute(audiobook.coverImagePath),
      "-i",
      audioAbsolutePath,
      "-c:v",
      "libx264",
      "-tune",
      "stillimage",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-pix_fmt",
      "yuv420p",
      "-shortest",
      videoAbsolutePath,
    ]);

    return {
      outputPath: videoRelativePath,
      timestampPath,
      durations,
    };
  }

  return {
    outputPath: audioRelativePath,
    timestampPath,
    durations,
  };
}