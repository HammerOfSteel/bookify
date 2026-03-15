import { TtsForm } from "@/components/tts-form";

export default function NewTtsProjectPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">New TTS project</p>
        <h1 className="mt-3 font-serif text-5xl">Start a new voice project</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-white/60">
          Choose a TTS provider, upload your chapter text, and generate narrated audio files ready to
          publish.
        </p>
      </div>
      <TtsForm />
    </div>
  );
}
