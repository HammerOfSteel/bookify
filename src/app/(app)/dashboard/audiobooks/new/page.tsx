import { AudiobookForm } from "@/components/audiobook-form";

export default function NewAudiobookPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">New audiobook</p>
        <h1 className="mt-3 font-serif text-5xl">Start a new listening release</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-white/60">Add metadata, upload chapter narration, and save your draft until it is ready to generate.</p>
      </div>
      <AudiobookForm />
    </div>
  );
}
