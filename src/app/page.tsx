import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, AudioLines, BookOpenText, ShieldCheck } from "lucide-react";
import { getCurrentSession } from "@/lib/auth";

export default async function Home() {
  const session = await getCurrentSession();

  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return (
    <main className="bookify-shell min-h-screen overflow-hidden px-6 py-8 md:px-12">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl flex-col justify-between rounded-[2rem] border border-white/10 bg-black/15 p-6 shadow-2xl shadow-black/20 md:p-10">
        <header className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <span className="text-sm uppercase tracking-[0.35em] text-[var(--sand)]">Bookify</span>
            <p className="mt-3 max-w-lg text-sm text-white/65">
              One studio for audio books, ebooks, and role-aware publishing workflows.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link className="btn-secondary" href="/login">
              Sign in
            </Link>
            <Link className="btn-primary" href="/login">
              Launch workspace
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </header>

        <section className="grid gap-10 py-16 md:grid-cols-[1.15fr_0.85fr] md:items-end md:py-20">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70">
              <span className="size-2 rounded-full bg-[var(--sand)]" />
              Save drafts, upload media, and generate polished outputs.
            </div>
            <div className="space-y-6">
              <h1 className="section-title max-w-4xl">
                A publishing cockpit for <span className="text-[var(--sand)]">beautiful books</span> in text and sound.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-white/70 md:text-xl">
                Build audiobooks with chapter audio, covers, and video exports. Shape ebooks with elegant themes, structured chapters, and one-click EPUB generation.
              </p>
            </div>
            <div className="flex flex-wrap gap-4">
              <Link className="btn-primary" href="/login">
                Start creating
              </Link>
              <a className="btn-secondary" href="#features">
                See workflow
              </a>
            </div>
          </div>

          <div className="glass-card relative overflow-hidden rounded-[2rem] p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(231,209,176,0.22),_transparent_45%)]" />
            <div className="relative space-y-6">
              <div className="rounded-[1.5rem] border border-white/10 bg-black/30 p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Output pipeline</p>
                <div className="mt-4 grid gap-3">
                  {["Draft manuscript", "Attach audio chapters", "Generate EPUB / MP3 / MP4"].map((step, index) => (
                    <div key={step} className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/5 px-4 py-3 text-sm">
                      <span>{step}</span>
                      <span className="text-[var(--sand)]">0{index + 1}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3" id="features">
                <div className="rounded-[1.35rem] border border-white/10 bg-white/5 p-4">
                  <AudioLines className="mb-4 size-5 text-[var(--sand)]" />
                  <p className="font-semibold">Audiobook builder</p>
                  <p className="mt-2 text-sm text-white/60">Upload chapter files, save progress, export audio or cover-video.</p>
                </div>
                <div className="rounded-[1.35rem] border border-white/10 bg-white/5 p-4">
                  <BookOpenText className="mb-4 size-5 text-[var(--sand)]" />
                  <p className="font-semibold">Ebook studio</p>
                  <p className="mt-2 text-sm text-white/60">Write chapter content in-place and generate EPUB-ready releases.</p>
                </div>
                <div className="rounded-[1.35rem] border border-white/10 bg-white/5 p-4">
                  <ShieldCheck className="mb-4 size-5 text-[var(--sand)]" />
                  <p className="font-semibold">Admin controls</p>
                  <p className="mt-2 text-sm text-white/60">Manage creators and access with dedicated admin views.</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
