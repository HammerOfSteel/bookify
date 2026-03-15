import { notFound } from "next/navigation";
import { TtsForm } from "@/components/tts-form";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { TtsProvider } from "@/lib/tts";

type TtsProjectPageProps = {
  params: Promise<{ id: string }>;
};

export default async function TtsProjectPage({ params }: TtsProjectPageProps) {
  const session = await requireAuth();
  const { id } = await params;

  const project = await prisma.ttsProject.findUnique({
    where: { id },
    include: { chapters: { orderBy: { position: "asc" } } },
  });

  if (!project) {
    notFound();
  }

  if (session.user.role !== "ADMIN" && project.ownerId !== session.user.id) {
    notFound();
  }

  const remoteSettings =
    project.ttsRemoteSettings && typeof project.ttsRemoteSettings === "object"
      ? (project.ttsRemoteSettings as {
          apiKey?: string;
          voiceId?: string;
          modelId?: string;
          model?: string;
          baseUrl?: string;
        })
      : null;

  const generatedOutputPaths = Array.isArray(project.generatedOutputPaths)
    ? (project.generatedOutputPaths as string[])
    : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">Edit TTS project</p>
        <h1 className="mt-3 font-serif text-5xl">{project.title}</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-white/60">
          Adjust chapters, voice settings, and regenerate audio whenever the text is ready.
        </p>
      </div>
      <TtsForm
        project={{
          id: project.id,
          title: project.title,
          description: project.description,
          author: project.author,
          ttsProvider: project.ttsProvider as TtsProvider,
          ttsVoice: project.ttsVoice,
          ttsSpeed: project.ttsSpeed,
          ttsRemoteSettings: remoteSettings,
          chapterCount: project.chapterCount,
          status: project.status,
          generatedOutputPaths,
          chapters: project.chapters.map((ch) => ({
            title: ch.title,
            textContent: ch.textContent,
            textFileName: ch.textFileName,
            audioPath: ch.audioPath,
          })),
        }}
      />
    </div>
  );
}
