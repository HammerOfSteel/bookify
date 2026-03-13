"use client";

import { useActionState, useState } from "react";
import { saveEbookAction } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";

type EbookFormProps = {
  ebook?: {
    id?: string;
    title: string;
    description: string;
    author: string;
    releaseDate: string;
    metadata: string;
    chapterCount: number;
    theme: string;
    coverImagePath?: string | null;
    status?: string;
    generatedOutputPath?: string | null;
    chapters: Array<{
      title: string;
      content: string;
    }>;
  };
};

const emptyEbook = {
  title: "",
  description: "",
  author: "",
  releaseDate: "",
  metadata: "",
  chapterCount: 3,
  theme: "classic",
  chapters: [
    { title: "Prelude", content: "" },
    { title: "Chapter 1", content: "" },
    { title: "Chapter 2", content: "" },
  ],
};

export function EbookForm({ ebook = emptyEbook }: EbookFormProps) {
  const [state, formAction] = useActionState(saveEbookAction, null);
  const [chapterCount, setChapterCount] = useState(ebook.chapterCount || 1);

  return (
    <form action={formAction} className="space-y-10">
      <input name="ebookId" type="hidden" value={ebook.id ?? ""} />
      <input name="chapterCount" type="hidden" value={chapterCount} />
      {state?.error && (
        <div className="rounded-[1.25rem] border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">
          {state.error}
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6 rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Ebook details</p>
            <h2 className="mt-3 font-serif text-4xl">Build a refined reading layout</h2>
          </div>

          <div>
            <label className="label" htmlFor="title">
              Title
            </label>
            <input className="field" defaultValue={ebook.title} id="title" name="title" placeholder="Salt and Lanterns" required />
          </div>

          <div>
            <label className="label" htmlFor="description">
              Description
            </label>
            <textarea className="field min-h-36" defaultValue={ebook.description} id="description" name="description" placeholder="Set the tone for readers and storefronts." required />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="author">
                Author
              </label>
              <input className="field" defaultValue={ebook.author} id="author" name="author" placeholder="Author name" required />
            </div>
            <div>
              <label className="label" htmlFor="releaseDate">
                Release date
              </label>
              <input className="field" defaultValue={ebook.releaseDate} id="releaseDate" name="releaseDate" type="date" />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="metadata">
              Metadata JSON
            </label>
            <textarea className="field min-h-32 font-mono text-sm" defaultValue={ebook.metadata} id="metadata" name="metadata" placeholder='{"genre":"Literary","series":"Volume 1"}' />
          </div>
        </div>

        <div className="space-y-6 rounded-[1.75rem] border border-white/10 bg-black/15 p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Presentation</p>
            <h3 className="mt-3 text-xl font-semibold">Theme and export</h3>
          </div>

          <div>
            <label className="label" htmlFor="chapterCountControl">
              Number of chapters
            </label>
            <input
              className="field"
              id="chapterCountControl"
              max={40}
              min={1}
              onChange={(event) => setChapterCount(Number.parseInt(event.target.value, 10) || 1)}
              type="number"
              value={chapterCount}
            />
          </div>

          <div>
            <label className="label" htmlFor="theme">
              Type design
            </label>
            <select className="field" defaultValue={ebook.theme} id="theme" name="theme">
              <option className="bg-slate-900 text-white" value="classic">
                Classic serif
              </option>
              <option className="bg-slate-900 text-white" value="editorial">
                Editorial magazine
              </option>
              <option className="bg-slate-900 text-white" value="modern">
                Modern minimal
              </option>
            </select>
          </div>

          <div>
            <label className="label" htmlFor="coverImage">
              Cover art
            </label>
            <input accept="image/*" className="field" id="coverImage" name="coverImage" type="file" />
            {ebook.coverImagePath ? (
              <a className="mt-3 inline-block text-sm text-[var(--sand)] underline" href={ebook.coverImagePath} target="_blank">
                Current cover image
              </a>
            ) : null}
          </div>

          {ebook.generatedOutputPath ? (
            <div className="rounded-[1.5rem] border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-50">
              <p className="font-semibold">Generated EPUB ready</p>
              <a className="mt-2 inline-block text-[var(--sand)] underline" href={ebook.generatedOutputPath} target="_blank">
                Download latest EPUB
              </a>
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Chapter editor</p>
            <h3 className="mt-3 font-serif text-3xl">Write as if you are drafting a longform article</h3>
          </div>
          <p className="max-w-md text-sm leading-7 text-white/60">Each section accepts pasted manuscript text or original writing. Save drafts as often as you like before generating the EPUB.</p>
        </div>

        <div className="mt-8 grid gap-5">
          {Array.from({ length: chapterCount }).map((_, index) => {
            const chapter = ebook.chapters[index];

            return (
              <div key={index} className="rounded-[1.5rem] border border-white/10 bg-black/15 p-5">
                <div>
                  <label className="label" htmlFor={`chapterTitle-${index}`}>
                    Chapter {index + 1} title
                  </label>
                  <input
                    className="field"
                    defaultValue={chapter?.title ?? `Chapter ${index + 1}`}
                    id={`chapterTitle-${index}`}
                    name={`chapterTitle-${index}`}
                    placeholder={`Chapter ${index + 1}`}
                  />
                </div>
                <div className="mt-5">
                  <label className="label" htmlFor={`chapterContent-${index}`}>
                    Chapter {index + 1} content
                  </label>
                  <textarea
                    className="field min-h-72 font-serif text-lg leading-8"
                    defaultValue={chapter?.content ?? ""}
                    id={`chapterContent-${index}`}
                    name={`chapterContent-${index}`}
                    placeholder="Write or paste your manuscript here..."
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <SubmitButton idleLabel="Save draft" name="intent" pendingLabel="Saving draft..." value="save" />
        <SubmitButton className="btn-secondary" idleLabel="Save and generate EPUB" name="intent" pendingLabel="Generating EPUB..." value="generate" />
        <span className="rounded-full border border-white/10 px-4 py-3 text-sm text-white/60">Status: {ebook.status ?? "DRAFT"}</span>
      </div>
    </form>
  );
}
