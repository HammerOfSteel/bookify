import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Ebook, EbookChapter, User } from "@prisma/client";
import Epub from "epub-gen";
import { publicPathToAbsolute } from "@/lib/storage";
import { slugify } from "@/lib/utils";

type EbookWithRelations = Ebook & {
  chapters: EbookChapter[];
  owner: Pick<User, "name">;
};

export async function generateEpubForEbook(ebook: EbookWithRelations) {
  const slug = slugify(ebook.title || "ebook");
  const relativePath = `/storage/generated/ebooks/${slug}-${Date.now()}.epub`;
  const absolutePath = publicPathToAbsolute(relativePath);

  await mkdir(path.dirname(absolutePath), { recursive: true });

  const options = {
    title: ebook.title,
    author: ebook.author,
    publisher: "Bookify",
    description: ebook.description,
    cover: ebook.coverImagePath ? publicPathToAbsolute(ebook.coverImagePath) : undefined,
    content: ebook.chapters
      .sort((left, right) => left.position - right.position)
      .map((chapter) => ({
        title: chapter.title,
        data: `<article><h1>${chapter.title}</h1><div>${chapter.content
          .split("\n")
          .map((paragraph) => `<p>${paragraph || "&nbsp;"}</p>`)
          .join("")}</div></article>`,
      })),
  };

  const epub = new Epub(options, absolutePath);
  await epub.promise;

  return relativePath;
}
