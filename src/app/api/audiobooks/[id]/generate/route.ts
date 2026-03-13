import { getServerSession } from "next-auth";
import { ProjectStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { generateAudiobookAssets } from "@/lib/audiobook-generator";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;

  const audiobook = await prisma.audiobook.findUnique({
    where: { id },
    include: { chapters: true, owner: { select: { name: true } } },
  });

  if (!audiobook) {
    return Response.json({ error: "Audiobook not found." }, { status: 404 });
  }

  if (session.user.role !== "ADMIN" && audiobook.ownerId !== session.user.id) {
    return Response.json({ error: "Access denied." }, { status: 403 });
  }

  const hasAudio = audiobook.chapters.some((chapter) => Boolean(chapter.audioPath));

  if (!hasAudio) {
    return Response.json(
      { error: "Upload at least one chapter audio file before generating an audiobook." },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function emit(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        const generated = await generateAudiobookAssets(audiobook, (percent, message) => {
          emit({ type: "progress", percent, message });
        });

        emit({ type: "progress", percent: 99, message: "Saving results to database..." });

        const sortedChapters = [...audiobook.chapters].sort((left, right) => left.position - right.position);

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

        emit({ type: "progress", percent: 100, message: "Generation complete!" });
        emit({ type: "done", redirectUrl: `/dashboard/audiobooks/${audiobook.id}` });
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
