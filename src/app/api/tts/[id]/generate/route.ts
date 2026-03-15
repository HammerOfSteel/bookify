import { getServerSession } from "next-auth";
import { ProjectStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { generateChapterAudio, type RemoteTtsSettings } from "@/lib/tts";
import type { TtsProvider } from "@/lib/tts-voices";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;

  const project = await prisma.ttsProject.findUnique({
    where: { id },
    include: { chapters: { orderBy: { position: "asc" } } },
  });

  if (!project) {
    return Response.json({ error: "TTS project not found." }, { status: 404 });
  }

  if (session.user.role !== "ADMIN" && project.ownerId !== session.user.id) {
    return Response.json({ error: "Access denied." }, { status: 403 });
  }

  const chaptersWithText = project.chapters.filter((c) => c.textContent && c.textContent.trim().length > 0);

  if (chaptersWithText.length === 0) {
    return Response.json({ error: "Save at least one chapter with text content before generating." }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function emit(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        const outputPaths: string[] = [];
        const total = chaptersWithText.length;

        for (let index = 0; index < total; index++) {
          const chapter = chaptersWithText[index];
          const chapterNum = index + 1;

          emit({
            type: "progress",
            percent: Math.round((index / total) * 90) + 2,
            message: `Generating chapter ${chapterNum}/${total}: "${chapter.title}"…`,
          });

          const audioPath = await generateChapterAudio({
            text: chapter.textContent!,
            bookTitle: project.title,
            position: chapter.position,
            chapterTitle: chapter.title,
            provider: project.ttsProvider as TtsProvider,
            voice: project.ttsVoice,
            speed: project.ttsSpeed,
            remoteSettings: project.ttsRemoteSettings as RemoteTtsSettings | null,
          });

          // Persist audio path immediately so partial results survive failures
          await prisma.ttsChapter.update({
            where: { id: chapter.id },
            data: { audioPath },
          });

          outputPaths.push(audioPath);

          emit({
            type: "progress",
            percent: Math.round(((index + 1) / total) * 90) + 2,
            message: `Done: "${chapter.title}" → ${audioPath.split("/").pop()}`,
          });
        }

        emit({ type: "progress", percent: 96, message: "Saving results to database…" });

        await prisma.ttsProject.update({
          where: { id: project.id },
          data: {
            status: ProjectStatus.GENERATED,
            generatedOutputPaths: outputPaths,
          },
        });

        emit({ type: "progress", percent: 100, message: `Generation complete! ${outputPaths.length} chapter(s) generated.` });
        emit({ type: "done", redirectUrl: `/dashboard/tts/${project.id}` });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Generation failed.";
        emit({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
