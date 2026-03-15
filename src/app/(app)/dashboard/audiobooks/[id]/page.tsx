import { notFound } from "next/navigation";
import { AudiobookForm } from "@/components/audiobook-form";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toDateInputValue } from "@/lib/utils";

type AudiobookPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AudiobookPage({ params }: AudiobookPageProps) {
  const session = await requireAuth();
  const { id } = await params;
  const audiobook = await prisma.audiobook.findUnique({
    where: { id },
    include: { chapters: { orderBy: { position: "asc" } } },
  });

  if (!audiobook) {
    notFound();
  }

  if (session.user.role !== "ADMIN" && audiobook.ownerId !== session.user.id) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">Edit audiobook</p>
        <h1 className="mt-3 font-serif text-5xl">{audiobook.title}</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-white/60">Adjust metadata, replace audio files, then regenerate whenever the cut is ready.</p>
      </div>
      <AudiobookForm
        audiobook={{
          id: audiobook.id,
          title: audiobook.title,
          description: audiobook.description,
          author: audiobook.author,
          releaseDate: toDateInputValue(audiobook.releaseDate),
          metadata: audiobook.metadata ? JSON.stringify(audiobook.metadata, null, 2) : "",
          chapterCount: audiobook.chapterCount,
          coverImagePath: audiobook.coverImagePath,
          outputPreference:
            audiobook.outputPreference === "M4B_FAST" || audiobook.outputPreference === "AUDIO"
              ? "M4B_FAST"
              : "MP4_YOUTUBE_FAST",
          status: audiobook.status,
          generatedOutputPath: audiobook.generatedOutputPath,
          generatedTimestampPath: audiobook.generatedTimestampPath,
          chapters: audiobook.chapters.map((chapter) => ({
            title: chapter.title,
            audioPath: chapter.audioPath,
            audioOriginalName: chapter.audioOriginalName,
          })),
        }}
      />
    </div>
  );
}
