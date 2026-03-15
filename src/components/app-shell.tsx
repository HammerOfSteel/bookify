import Link from "next/link";
import { AudioLines, BookOpenText, Home, Mic2, ShieldCheck } from "lucide-react";
import { SignOutButton } from "@/components/sign-out-button";

type AppShellProps = {
  user: {
    name?: string | null;
    email?: string | null;
    role: "ADMIN" | "USER";
  };
  children: React.ReactNode;
};

const baseLinks = [
  { href: "/dashboard", label: "Overview", icon: Home },
  { href: "/dashboard/audiobooks", label: "Audiobooks", icon: AudioLines },
  { href: "/dashboard/ebooks", label: "Ebooks", icon: BookOpenText },
  { href: "/dashboard/tts", label: "TTS Projects", icon: Mic2 },
];

export function AppShell({ user, children }: AppShellProps) {
  const links = user.role === "ADMIN" ? [...baseLinks, { href: "/admin/users", label: "Users", icon: ShieldCheck }] : baseLinks;

  return (
    <div className="bookify-shell min-h-screen px-4 py-4 md:px-6 md:py-6">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-7xl gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="glass-card flex flex-col justify-between rounded-[2rem] p-6">
          <div>
            <div className="mb-10">
              <p className="text-xs uppercase tracking-[0.35em] text-[var(--sand)]">Bookify</p>
              <h1 className="mt-4 font-serif text-4xl leading-none">Publishing cockpit</h1>
              <p className="mt-3 text-sm text-white/60">Draft, manage, and generate beautiful releases.</p>
            </div>

            <nav className="space-y-2">
              {links.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/5 px-4 py-3 text-sm text-white/80 transition hover:border-white/15 hover:bg-white/8"
                  href={href}
                >
                  <Icon className="size-4 text-[var(--sand)]" />
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="space-y-4 rounded-[1.5rem] border border-white/8 bg-black/20 p-4">
            <div>
              <p className="text-sm font-semibold">{user.name}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">{user.role}</p>
              <p className="mt-2 text-sm text-white/60">{user.email}</p>
            </div>
            <SignOutButton />
          </div>
        </aside>

        <div className="glass-card min-h-full rounded-[2rem] p-6 md:p-8">{children}</div>
      </div>
    </div>
  );
}
