import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";

export default async function DashboardPage() {
  const session = await requireAuth();
  const isAdmin = session.user.role === "ADMIN";
  const ownershipFilter = isAdmin ? {} : { ownerId: session.user.id };

  const [audiobookCount, ebookCount, recentAudiobooks, recentEbooks, userCount] = await Promise.all([
    prisma.audiobook.count({ where: ownershipFilter }),
    prisma.ebook.count({ where: ownershipFilter }),
    prisma.audiobook.findMany({
      where: ownershipFilter,
      include: { owner: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 4,
    }),
    prisma.ebook.findMany({
      where: ownershipFilter,
      include: { owner: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 4,
    }),
    isAdmin ? prisma.user.count() : Promise.resolve(0),
  ]);

  return (
    <div className="space-y-10">
      <section className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">Workspace overview</p>
          <h1 className="mt-3 font-serif text-5xl">Welcome back, {session.user.name?.split(" ")[0] ?? "creator"}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/60">
            Keep projects moving, refine metadata, and generate polished releases once each draft is ready.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="btn-primary" href="/dashboard/audiobooks/new">
            New audiobook
          </Link>
          <Link className="btn-secondary" href="/dashboard/ebooks/new">
            New ebook
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
          <p className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">Audiobooks</p>
          <p className="mt-6 font-serif text-5xl">{audiobookCount}</p>
          <p className="mt-3 text-sm text-white/60">Drafts and generated listening projects.</p>
        </div>
        <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
          <p className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">Ebooks</p>
          <p className="mt-6 font-serif text-5xl">{ebookCount}</p>
          <p className="mt-3 text-sm text-white/60">Structured manuscripts ready for EPUB export.</p>
        </div>
        <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
          <p className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">Role</p>
          <p className="mt-6 font-serif text-5xl">{session.user.role}</p>
          <p className="mt-3 text-sm text-white/60">{isAdmin ? `${userCount} users currently managed.` : "Personal creator workspace."}</p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[1.75rem] border border-white/10 bg-black/15 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Recent audiobooks</p>
              <h2 className="mt-3 text-2xl font-semibold">Continue listening projects</h2>
            </div>
            <Link className="text-sm text-[var(--sand)] underline" href="/dashboard/audiobooks">
              View all
            </Link>
          </div>
          <div className="mt-6 grid gap-4">
            {recentAudiobooks.length === 0 ? (
              <p className="rounded-[1.5rem] border border-dashed border-white/10 px-4 py-6 text-sm text-white/60">No audiobooks yet.</p>
            ) : (
              recentAudiobooks.map((audiobook) => (
                <Link key={audiobook.id} className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 transition hover:bg-white/8" href={`/dashboard/audiobooks/${audiobook.id}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold">{audiobook.title}</p>
                      <p className="mt-2 text-sm text-white/60">{audiobook.author} · {audiobook.owner.name}</p>
                    </div>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">{audiobook.status}</span>
                  </div>
                  <p className="mt-4 text-sm text-white/50">Updated {formatDate(audiobook.updatedAt)}</p>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-white/10 bg-black/15 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Recent ebooks</p>
              <h2 className="mt-3 text-2xl font-semibold">Continue manuscript work</h2>
            </div>
            <Link className="text-sm text-[var(--sand)] underline" href="/dashboard/ebooks">
              View all
            </Link>
          </div>
          <div className="mt-6 grid gap-4">
            {recentEbooks.length === 0 ? (
              <p className="rounded-[1.5rem] border border-dashed border-white/10 px-4 py-6 text-sm text-white/60">No ebooks yet.</p>
            ) : (
              recentEbooks.map((ebook) => (
                <Link key={ebook.id} className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 transition hover:bg-white/8" href={`/dashboard/ebooks/${ebook.id}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold">{ebook.title}</p>
                      <p className="mt-2 text-sm text-white/60">{ebook.author} · {ebook.owner.name}</p>
                    </div>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">{ebook.status}</span>
                  </div>
                  <p className="mt-4 text-sm text-white/50">Updated {formatDate(ebook.updatedAt)}</p>
                </Link>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
