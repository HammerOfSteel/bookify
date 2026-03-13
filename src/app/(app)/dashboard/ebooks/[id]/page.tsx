import { notFound } from "next/navigation";
import { EbookForm } from "@/components/ebook-form";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toDateInputValue } from "@/lib/utils";

type EbookPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EbookPage({ params }: EbookPageProps) {
  const session = await requireAuth();
  const { id } = await params;
  const ebook = await prisma.ebook.findUnique({
    where: { id },
    include: { chapters: { orderBy: { position: "asc" } } },
  });

  if (!ebook) {
    notFound();
  }

  if (session.user.role !== "ADMIN" && ebook.ownerId !== session.user.id) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">Edit ebook</p>
        <h1 className="mt-3 font-serif text-5xl">{ebook.title}</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-white/60">Refine the manuscript, adjust chapter structure, and generate updated EPUB exports when ready.</p>
      </div>
      <EbookForm
        ebook={{
          id: ebook.id,
          title: ebook.title,
          description: ebook.description,
          author: ebook.author,
          releaseDate: toDateInputValue(ebook.releaseDate),
          metadata: ebook.metadata ? JSON.stringify(ebook.metadata, null, 2) : "",
          chapterCount: ebook.chapterCount,
          theme: ebook.theme,
          coverImagePath: ebook.coverImagePath,
          status: ebook.status,
          generatedOutputPath: ebook.generatedOutputPath,
          chapters: ebook.chapters.map((chapter) => ({
            title: chapter.title,
            content: chapter.content,
          })),
        }}
      />
    </div>
  );
}
