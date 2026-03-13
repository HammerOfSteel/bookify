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

    const chapterEntries = await Promise.all(
      Array.from({ length: chapterCount }, async (_, index) => {
        const title = getString(formData, `chapterTitle-${index}`) || `Chapter ${index + 1}`;
        const existingAudioPath = getString(formData, `chapterAudioExisting-${index}`) || null;
        const existingAudioOriginalName = getString(formData, `chapterAudioOriginalNameExisting-${index}`) || null;
        const stagedAudioPath = getString(formData, `chapterAudioStaged-${index}`) || null;
        const stagedAudioOriginalName = getString(formData, `chapterAudioOriginalNameStaged-${index}`) || null;
        const uploadedAudio = getFile(formData, `chapterAudio-${index}`);
        const batchFileName = batchMapping.chapters?.[String(index + 1)] ?? "";
        const mappedBatchAudio = batchFileName ? batchFilesByName.get(batchFileName) ?? null : null;
        const selectedAudio = uploadedAudio ?? mappedBatchAudio;
        const audioPath = stagedAudioPath ?? (selectedAudio ? await saveAudioUpload(selectedAudio, "uploads/audio", audioFormat) : existingAudioPath);
        const audioOriginalName = stagedAudioOriginalName ?? (selectedAudio ? selectedAudio.name : existingAudioOriginalName);

        return {
          title,
          audioPath,
          audioOriginalName,
        };
      }),
    );

    const includePrologue = getString(formData, "includePrologue") === "on";
    const includeEpilogue = getString(formData, "includeEpilogue") === "on";
    const prologueEntries = includePrologue
      ? [
          {
            title: getString(formData, "prologueTitle") || "Prologue",
            existingAudioPath: getString(formData, "prologueAudioExisting") || null,
            existingAudioOriginalName: getString(formData, "prologueAudioOriginalNameExisting") || null,
            stagedAudioPath: getString(formData, "prologueAudioStaged") || null,
            stagedAudioOriginalName: getString(formData, "prologueAudioOriginalNameStaged") || null,
            uploadedAudio: getFile(formData, "prologueAudio"),
            batchAudio: batchMapping.prologue ? batchFilesByName.get(batchMapping.prologue) ?? null : null,
          },
        ]
      : [];
    const epilogueEntries = includeEpilogue
      ? [
          {
            title: getString(formData, "epilogueTitle") || "Epilogue",
            existingAudioPath: getString(formData, "epilogueAudioExisting") || null,
            existingAudioOriginalName: getString(formData, "epilogueAudioOriginalNameExisting") || null,
            stagedAudioPath: getString(formData, "epilogueAudioStaged") || null,
            stagedAudioOriginalName: getString(formData, "epilogueAudioOriginalNameStaged") || null,
            uploadedAudio: getFile(formData, "epilogueAudio"),
            batchAudio: batchMapping.epilogue ? batchFilesByName.get(batchMapping.epilogue) ?? null : null,
          },
        ]
      : [];

    const prologueInput = await Promise.all(
      prologueEntries.map(async (entry) => {
        const selectedAudio = entry.uploadedAudio ?? entry.batchAudio;
        const audioPath = entry.stagedAudioPath ?? (selectedAudio ? await saveAudioUpload(selectedAudio, "uploads/audio", audioFormat) : entry.existingAudioPath);
        const audioOriginalName = entry.stagedAudioOriginalName ?? (selectedAudio ? selectedAudio.name : entry.existingAudioOriginalName);

        return { title: entry.title, audioPath, audioOriginalName };
      }),
    );

    const epilogueInput = await Promise.all(
      epilogueEntries.map(async (entry) => {
        const selectedAudio = entry.uploadedAudio ?? entry.batchAudio;
        const audioPath = entry.stagedAudioPath ?? (selectedAudio ? await saveAudioUpload(selectedAudio, "uploads/audio", audioFormat) : entry.existingAudioPath);
        const audioOriginalName = entry.stagedAudioOriginalName ?? (selectedAudio ? selectedAudio.name : entry.existingAudioOriginalName);

        return { title: entry.title, audioPath, audioOriginalName };
      }),
    );

    const chapterInputs = [...prologueInput, ...chapterEntries, ...epilogueInput].map((chapter, index) => ({
      ...chapter,
      position: index + 1,
    }));

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
      outputPreference: getString(formData, "outputPreference") || "AUDIO",
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

  if (intent === "generate") {
    const fullAudiobook = await prisma.audiobook.findUnique({
      where: { id: audiobook.id },
      include: { chapters: true, owner: { select: { name: true } } },
    });

    if (!fullAudiobook) {
      throw new Error("Audiobook not found after saving.");
    }

    const generated = await generateAudiobookAssets(fullAudiobook);
    const sortedChapters = [...fullAudiobook.chapters].sort((left, right) => left.position - right.position);

    await prisma.$transaction([
      prisma.audiobook.update({
        where: { id: audiobook.id },
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
  }

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
