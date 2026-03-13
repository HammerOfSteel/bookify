import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getCurrentSession } from "@/lib/auth";

type LoginPageProps = {
  searchParams: Promise<{ callbackUrl?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getCurrentSession();

  if (session?.user?.id) {
    redirect("/dashboard");
  }

  const { callbackUrl } = await searchParams;

  return (
    <main className="bookify-shell min-h-screen px-6 py-8 md:px-12">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-black/20 shadow-2xl shadow-black/20 md:grid-cols-[1.05fr_0.95fr]">
        <section className="relative flex flex-col justify-between overflow-hidden p-8 md:p-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(231,209,176,0.22),_transparent_36%),radial-gradient(circle_at_bottom_right,_rgba(47,109,115,0.24),_transparent_36%)]" />
          <div className="relative">
            <p className="text-xs uppercase tracking-[0.35em] text-[var(--sand)]">Bookify</p>
            <h1 className="mt-6 max-w-xl font-serif text-6xl leading-none tracking-[-0.04em]">
              Sign in to shape your next release.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-white/70">
              Manage ebook layouts, audiobook chapters, creator accounts, and generated assets from one calm workspace.
            </p>
          </div>

          <div className="relative grid gap-4 md:grid-cols-2">
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-semibold">Admin demo</p>
              <p className="mt-2 text-sm text-white/60">admin@bookify.local</p>
              <p className="text-sm text-white/60">Admin!234</p>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-semibold">User demo</p>
              <p className="mt-2 text-sm text-white/60">user@bookify.local</p>
              <p className="text-sm text-white/60">User!234</p>
            </div>
          </div>
        </section>

        <section className="glass-card flex items-center px-6 py-10 md:px-10">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8">
              <p className="text-sm uppercase tracking-[0.3em] text-[var(--muted)]">Secure access</p>
              <h2 className="mt-3 font-serif text-4xl">Welcome back</h2>
              <p className="mt-3 text-sm leading-7 text-white/60">Use one of the seeded accounts or create more users from the admin area once you are inside.</p>
            </div>
            <LoginForm callbackUrl={callbackUrl} />
          </div>
        </section>
      </div>
    </main>
  );
}
