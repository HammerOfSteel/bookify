"use server";

import bcrypt from "bcryptjs";
import { Prisma, ProjectStatus, UserRole } from "@prisma/client";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireAuth } from "@/lib/auth";
import { generateAudiobookAssets } from "@/lib/audiobook-generator";
import { generateEpubForEbook } from "@/lib/ebook-generator";
import { prisma } from "@/lib/prisma";
import { saveAudioUpload, saveUpload, type AudioConversionFormat } from "@/lib/storage";
import { parseJsonInput } from "@/lib/utils";

export type ActionResult = { error: string } | null;

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getNumber(formData: FormData, key: string, fallback = 1) {
  const value = Number.parseInt(getString(formData, key), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getFile(formData: FormData, key: string) {
  const value = formData.get(key);
  return value instanceof File ? value : null;
}

function parseOptionalDate(value: string) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseMetadata(value: string): Prisma.InputJsonValue | undefined {
  try {
    return parseJsonInput(value) as Prisma.InputJsonValue | undefined;
  } catch {
    throw new Error("Metadata must be valid JSON.");
  }
}

function parseAudioFormat(value: string): AudioConversionFormat {
  if (value === "m4a" || value === "ogg") {
    return value;
  }

  return "mp3";
}

function parseAudiobookOutputPreference(value: string) {
  if (value === "M4B_FAST" || value === "AUDIO") {
    return "M4B_FAST";
  }

  return "MP4_YOUTUBE_FAST";
}

type BatchAudioMapping = {
  prologue?: string;
  epilogue?: string;
  chapters?: Record<string, string>;
};

function parseBatchAudioMapping(value: string): BatchAudioMapping {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as BatchAudioMapping;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function normalizeOptional(value: string | null | undefined) {
  if (!value || value === "undefined" || value === "null") {
    return null;
  }

  return value;
}

function deriveAudiobookStatus(chapters: Array<{ title: string; audioPath?: string | null }>) {
  return chapters.length > 0 && chapters.every((chapter) => chapter.title && chapter.audioPath)
    ? ProjectStatus.READY
    : ProjectStatus.DRAFT;
}

function deriveEbookStatus(chapters: Array<{ title: string; content: string }>) {
  return chapters.length > 0 && chapters.every((chapter) => chapter.title && chapter.content.trim())
    ? ProjectStatus.READY
    : ProjectStatus.DRAFT;
}

async function findEditableAudiobook(id: string, actorId: string, actorRole: "ADMIN" | "USER") {
  const audiobook = await prisma.audiobook.findUnique({ include: { chapters: true }, where: { id } });

  if (!audiobook) {
    throw new Error("Audiobook not found.");
  }

  if (actorRole !== "ADMIN" && audiobook.ownerId !== actorId) {
    throw new Error("You do not have access to this audiobook.");
  }

  return audiobook;
}

async function findEditableEbook(id: string, actorId: string, actorRole: "ADMIN" | "USER") {
  const ebook = await prisma.ebook.findUnique({ include: { chapters: true }, where: { id } });

  if (!ebook) {
    throw new Error("Ebook not found.");
  }

  if (actorRole !== "ADMIN" && ebook.ownerId !== actorId) {
    throw new Error("You do not have access to this ebook.");
  }

  return ebook;
}

export async function saveUserAction(_prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    await requireAdmin();

    const userId = getString(formData, "userId");
    const name = getString(formData, "name");
    const email = getString(formData, "email").toLowerCase();
    const password = getString(formData, "password");
    const role = getString(formData, "role") === "ADMIN" ? UserRole.ADMIN : UserRole.USER;

    if (!name || !email) {
      return { error: "Name and email are required." };
    }

    if (!userId && !password) {
      return { error: "Password is required when creating a user." };
    }

    if (userId) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          name,
          email,
          role,
          ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
        },
      });
    } else {
      await prisma.user.create({
        data: {
          name,
          email,
          role,
          passwordHash: await bcrypt.hash(password, 10),
        },
      });
    }

    revalidatePath("/admin/users");
    redirect("/admin/users");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { error: error instanceof Error ? error.message : "Something went wrong saving this user." };
  }
}

export async function saveAudiobookAction(_prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireAuth();
    const audiobookId = getString(formData, "audiobookId");
    const intent = getString(formData, "intent") || "save";

    if (intent === "generate") {
      if (!audiobookId) {
        return { error: "Save draft first before generating." };
      }

      const editable = await findEditableAudiobook(audiobookId, session.user.id, session.user.role);
      const fullAudiobook = await prisma.audiobook.findUnique({
        where: { id: editable.id },
        include: { chapters: true, owner: { select: { name: true } } },
      });

      if (!fullAudiobook) {
        return { error: "Audiobook not found." };
      }

      const hasAudio = fullAudiobook.chapters.some((chapter) => Boolean(chapter.audioPath));
      if (!hasAudio) {
        return { error: "Upload at least one chapter audio file before generating an audiobook." };
      }

      const generated = await generateAudiobookAssets(fullAudiobook);
      const sortedChapters = [...fullAudiobook.chapters].sort((left, right) => left.position - right.position);

      await prisma.$transaction([
        prisma.audiobook.update({
          where: { id: editable.id },
          data: {
            status: ProjectStatus.GENERATED,
            generatedOutputPath: generated.outputPath,
            generatedTimestampPath: generated.timestampPath,
          },
        }),
        ...sortedChapters.map((chapter, index) =>
          prisma.audiobookChapter.update({
            where: { id: chapter.id },
            data: { durationSeconds: generated.durations[index] ?? null },
          }),
        ),
      ]);

      revalidatePath("/dashboard");
      revalidatePath(`/dashboard/audiobooks/${editable.id}`);
      redirect(`/dashboard/audiobooks/${editable.id}`);
    }

    const chapterCount = Math.min(getNumber(formData, "chapterCount", 1), 30);
    const coverFile = getFile(formData, "coverImage");
    const audioFormat = parseAudioFormat(getString(formData, "audioConversionFormat"));
    const batchMapping = parseBatchAudioMapping(getString(formData, "batchAudioMapping"));
    const batchFiles = formData
      .getAll("batchAudioFiles")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);
    const batchFilesByName = new Map(batchFiles.map((file) => [file.name, file]));
    const existing = audiobookId
      ? await findEditableAudiobook(audiobookId, session.user.id, session.user.role)
      : null;
    const includePrologue = getString(formData, "includePrologue") === "on";
    const includeEpilogue = getString(formData, "includeEpilogue") === "on";
    const existingByPosition = new Map((existing?.chapters ?? []).map((chapter) => [chapter.position, chapter]));

    const chapterEntries = await Promise.all(
      Array.from({ length: chapterCount }, async (_, index) => {
        const position = (includePrologue ? 2 : 1) + index;
        const baseline = existingByPosition.get(position);
        const title = getString(formData, `chapterTitle-${index}`) || `Chapter ${index + 1}`;
        const existingAudioPath = normalizeOptional(getString(formData, `chapterAudioExisting-${index}`)) || baseline?.audioPath || null;
        const existingAudioOriginalName = normalizeOptional(getString(formData, `chapterAudioOriginalNameExisting-${index}`)) || baseline?.audioOriginalName || null;
        const stagedAudioPath = normalizeOptional(getString(formData, `chapterAudioStaged-${index}`));
        const stagedAudioOriginalName = normalizeOptional(getString(formData, `chapterAudioOriginalNameStaged-${index}`));
        const uploadedAudio = getFile(formData, `chapterAudio-${index}`);
        const batchFileName = batchMapping.chapters?.[String(index + 1)] ?? "";
        const mappedBatchAudio = batchFileName ? batchFilesByName.get(batchFileName) ?? null : null;
        const selectedAudio = uploadedAudio ?? mappedBatchAudio;
        const audioPath = stagedAudioPath ?? (selectedAudio ? await saveAudioUpload(selectedAudio, "uploads/audio", audioFormat) : existingAudioPath);
        const audioOriginalName = stagedAudioOriginalName ?? (selectedAudio ? selectedAudio.name : existingAudioOriginalName);

        return {
          title,
          position,
          audioPath,
          audioOriginalName,
        };
      }),
    );

    const prologueEntries = includePrologue
      ? [
          {
            baseline: existingByPosition.get(1),
            title: getString(formData, "prologueTitle") || "Prologue",
            existingAudioPath: normalizeOptional(getString(formData, "prologueAudioExisting")),
            existingAudioOriginalName: normalizeOptional(getString(formData, "prologueAudioOriginalNameExisting")),
            stagedAudioPath: normalizeOptional(getString(formData, "prologueAudioStaged")),
            stagedAudioOriginalName: normalizeOptional(getString(formData, "prologueAudioOriginalNameStaged")),
            uploadedAudio: getFile(formData, "prologueAudio"),
            batchAudio: batchMapping.prologue ? batchFilesByName.get(batchMapping.prologue) ?? null : null,
          },
        ]
      : [];
    const epiloguePosition = chapterCount + (includePrologue ? 2 : 1);
    const epilogueEntries = includeEpilogue
      ? [
          {
            baseline: existingByPosition.get(epiloguePosition),
            title: getString(formData, "epilogueTitle") || "Epilogue",
            existingAudioPath: normalizeOptional(getString(formData, "epilogueAudioExisting")),
            existingAudioOriginalName: normalizeOptional(getString(formData, "epilogueAudioOriginalNameExisting")),
            stagedAudioPath: normalizeOptional(getString(formData, "epilogueAudioStaged")),
            stagedAudioOriginalName: normalizeOptional(getString(formData, "epilogueAudioOriginalNameStaged")),
            uploadedAudio: getFile(formData, "epilogueAudio"),
            batchAudio: batchMapping.epilogue ? batchFilesByName.get(batchMapping.epilogue) ?? null : null,
          },
        ]
      : [];

    const prologueInput = await Promise.all(
      prologueEntries.map(async (entry) => {
        const selectedAudio = entry.uploadedAudio ?? entry.batchAudio;
        const audioPath = entry.stagedAudioPath ?? (selectedAudio ? await saveAudioUpload(selectedAudio, "uploads/audio", audioFormat) : entry.existingAudioPath || entry.baseline?.audioPath || null);
        const audioOriginalName = entry.stagedAudioOriginalName ?? (selectedAudio ? selectedAudio.name : entry.existingAudioOriginalName || entry.baseline?.audioOriginalName || null);

        return { title: entry.title, position: 1, audioPath, audioOriginalName };
      }),
    );

    const epilogueInput = await Promise.all(
      epilogueEntries.map(async (entry) => {
        const selectedAudio = entry.uploadedAudio ?? entry.batchAudio;
        const audioPath = entry.stagedAudioPath ?? (selectedAudio ? await saveAudioUpload(selectedAudio, "uploads/audio", audioFormat) : entry.existingAudioPath || entry.baseline?.audioPath || null);
        const audioOriginalName = entry.stagedAudioOriginalName ?? (selectedAudio ? selectedAudio.name : entry.existingAudioOriginalName || entry.baseline?.audioOriginalName || null);

        return { title: entry.title, position: epiloguePosition, audioPath, audioOriginalName };
      }),
    );

    let chapterInputs = [...prologueInput, ...chapterEntries, ...epilogueInput]
      .sort((left, right) => left.position - right.position)
      .map((chapter, index) => ({
        ...chapter,
        position: index + 1,
      }));

    const existingOrdered = [...(existing?.chapters ?? [])].sort((left, right) => left.position - right.position);
    const incomingHasAudio = chapterInputs.some((chapter) => Boolean(chapter.audioPath));
    const existingHasAudio = existingOrdered.some((chapter) => Boolean(chapter.audioPath));

    // Defensive fallback: if the submit lost hidden fields, preserve already-saved audio by position.
    if (!incomingHasAudio && existingHasAudio) {
      chapterInputs = chapterInputs.map((chapter, index) => ({
        ...chapter,
        audioPath: chapter.audioPath ?? existingOrdered[index]?.audioPath ?? null,
        audioOriginalName: chapter.audioOriginalName ?? existingOrdered[index]?.audioOriginalName ?? null,
      }));
    }

    const coverImagePath = coverFile ? await saveUpload(coverFile, "uploads/covers") : existing?.coverImagePath ?? null;

    const status = deriveAudiobookStatus(chapterInputs);
    const data = {
      title: getString(formData, "title"),
      description: getString(formData, "description"),
      author: getString(formData, "author"),
      releaseDate: parseOptionalDate(getString(formData, "releaseDate")),
      metadata: parseMetadata(getString(formData, "metadata")),
      chapterCount: chapterInputs.length,
      coverImagePath,
      outputPreference: parseAudiobookOutputPreference(getString(formData, "outputPreference")),
      status,
    };

    const audiobook = existing
      ? await prisma.audiobook.update({
          where: { id: existing.id },
          data: {
            ...data,
            chapters: {
              deleteMany: {},
              create: chapterInputs,
            },
          },
        })
      : await prisma.audiobook.create({
          data: {
            ...data,
            ownerId: session.user.id,
            chapters: {
              create: chapterInputs,
            },
          },
        });

    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/audiobooks/${audiobook.id}`);
    redirect(`/dashboard/audiobooks/${audiobook.id}`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { error: error instanceof Error ? error.message : "Something went wrong saving this audiobook." };
  }
}

export async function saveEbookAction(_prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireAuth();
  const ebookId = getString(formData, "ebookId");
  const intent = getString(formData, "intent") || "save";
  const chapterCount = Math.min(getNumber(formData, "chapterCount", 1), 40);
  const coverFile = getFile(formData, "coverImage");
  const existing = ebookId ? await findEditableEbook(ebookId, session.user.id, session.user.role) : null;

  const chapterInputs = Array.from({ length: chapterCount }, (_, index) => ({
    title: getString(formData, `chapterTitle-${index}`) || `Chapter ${index + 1}`,
    content: getString(formData, `chapterContent-${index}`),
    position: index + 1,
  }));

  const coverImagePath = coverFile
    ? await saveUpload(coverFile, "uploads/covers")
    : existing?.coverImagePath ?? null;

  const status = deriveEbookStatus(chapterInputs);
  const data = {
    title: getString(formData, "title"),
    description: getString(formData, "description"),
    author: getString(formData, "author"),
    releaseDate: parseOptionalDate(getString(formData, "releaseDate")),
    metadata: parseMetadata(getString(formData, "metadata")),
    chapterCount,
    theme: getString(formData, "theme") || "classic",
    coverImagePath,
    status,
  };

  const ebook = existing
    ? await prisma.ebook.update({
        where: { id: existing.id },
        data: {
          ...data,
          chapters: {
            deleteMany: {},
            create: chapterInputs,
          },
        },
      })
    : await prisma.ebook.create({
        data: {
          ...data,
          ownerId: session.user.id,
          chapters: {
            create: chapterInputs,
          },
        },
      });

  if (intent === "generate") {
    const fullEbook = await prisma.ebook.findUnique({
      where: { id: ebook.id },
      include: { chapters: true, owner: { select: { name: true } } },
    });

    if (!fullEbook) {
      throw new Error("Ebook not found after saving.");
    }

    const outputPath = await generateEpubForEbook(fullEbook);

    await prisma.ebook.update({
      where: { id: ebook.id },
      data: {
        status: ProjectStatus.GENERATED,
        generatedOutputPath: outputPath,
      },
    });
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/ebooks/${ebook.id}`);
  redirect(`/dashboard/ebooks/${ebook.id}`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { error: error instanceof Error ? error.message : "Something went wrong saving this ebook." };
  }
}

export async function deleteAudiobookAction(id: string) {
  const session = await requireAuth();
  await findEditableAudiobook(id, session.user.id, session.user.role);
  await prisma.audiobook.delete({ where: { id } });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/audiobooks");
}

export async function deleteEbookAction(id: string) {
  const session = await requireAuth();
  await findEditableEbook(id, session.user.id, session.user.role);
  await prisma.ebook.delete({ where: { id } });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/ebooks");
}

export async function deleteUserAction(id: string) {
  await requireAdmin();
  await prisma.user.delete({ where: { id } });
  revalidatePath("/admin/users");
}

// ── TTS Projects ─────────────────────────────────────────────────────────────

async function findEditableTtsProject(id: string, actorId: string, actorRole: "ADMIN" | "USER") {
  const project = await prisma.ttsProject.findUnique({ include: { chapters: true }, where: { id } });

  if (!project) {
    throw new Error("TTS project not found.");
  }

  if (actorRole !== "ADMIN" && project.ownerId !== actorId) {
    throw new Error("You do not have access to this TTS project.");
  }

  return project;
}

export async function saveTtsProjectAction(_prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireAuth();
    const projectId = getString(formData, "projectId");
    const chapterCount = Math.min(getNumber(formData, "chapterCount", 1), 40);

    const existing = projectId ? await findEditableTtsProject(projectId, session.user.id, session.user.role) : null;
    const existingByPosition = new Map((existing?.chapters ?? []).map((c) => [c.position, c]));

    const chapterInputs = Array.from({ length: chapterCount }, (_, index) => {
      const position = index + 1;
      const baseline = existingByPosition.get(position);
      const title = getString(formData, `chapterTitle-${index}`) || `Chapter ${index + 1}`;
      const existingText = normalizeOptional(getString(formData, `chapterTextExisting-${index}`));
      const existingFileName = normalizeOptional(getString(formData, `chapterTextFileNameExisting-${index}`));
      // Text content is uploaded as a text file; content is read client-side and sent as a hidden field
      const textContent = normalizeOptional(getString(formData, `chapterTextContent-${index}`)) ?? existingText ?? baseline?.textContent ?? null;
      const textFileName = normalizeOptional(getString(formData, `chapterTextFileName-${index}`)) ?? existingFileName ?? baseline?.textFileName ?? null;

      return { title, position, textContent, textFileName };
    });

    const remoteSettings = (() => {
      const raw = normalizeOptional(getString(formData, "ttsRemoteSettings"));

      if (!raw) {
        return undefined;
      }

      try {
        return JSON.parse(raw) as Prisma.InputJsonValue;
      } catch {
        return undefined;
      }
    })();

    const data = {
      title: getString(formData, "title"),
      description: getString(formData, "description"),
      author: getString(formData, "author"),
      ttsProvider: getString(formData, "ttsProvider") || "kokoro_local",
      ttsVoice: getString(formData, "ttsVoice") || "🇺🇸 🚺 Nicole 🎧",
      ttsSpeed: Math.min(4, Math.max(0.5, Number.parseFloat(getString(formData, "ttsSpeed")) || 1)),
      ttsRemoteSettings: remoteSettings ?? Prisma.JsonNull,
      chapterCount: chapterInputs.length,
    };

    const project = existing
      ? await prisma.ttsProject.update({
          where: { id: existing.id },
          data: {
            ...data,
            chapters: { deleteMany: {}, create: chapterInputs },
          },
        })
      : await prisma.ttsProject.create({
          data: {
            ...data,
            ownerId: session.user.id,
            chapters: { create: chapterInputs },
          },
        });

    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/tts/${project.id}`);
    redirect(`/dashboard/tts/${project.id}`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { error: error instanceof Error ? error.message : "Something went wrong saving this TTS project." };
  }
}

export async function deleteTtsProjectAction(id: string) {
  const session = await requireAuth();
  await findEditableTtsProject(id, session.user.id, session.user.role);
  await prisma.ttsProject.delete({ where: { id } });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tts");
}

