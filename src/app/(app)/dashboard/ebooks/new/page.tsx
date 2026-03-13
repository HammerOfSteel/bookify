import { EbookForm } from "@/components/ebook-form";

export default function NewEbookPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">New ebook</p>
        <h1 className="mt-3 font-serif text-5xl">Start a new reading edition</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-white/60">Choose a typographic direction, write chapter content, and generate an EPUB when the manuscript is ready.</p>
      </div>
      <EbookForm />
    </div>
  );
}
