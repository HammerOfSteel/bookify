"use client";

import { useState, useTransition } from "react";
import { ArrowRight } from "lucide-react";
import { signIn } from "next-auth/react";

type LoginFormProps = {
  callbackUrl?: string;
};

export function LoginForm({ callbackUrl = "/dashboard" }: LoginFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);

        const formData = new FormData(event.currentTarget);

        startTransition(async () => {
          const result = await signIn("credentials", {
            email: String(formData.get("email") ?? ""),
            password: String(formData.get("password") ?? ""),
            callbackUrl,
            redirect: false,
          });

          if (!result || result.error) {
            setError("Incorrect email or password.");
            return;
          }

          window.location.href = result.url ?? callbackUrl;
        });
      }}
    >
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input className="field" id="email" name="email" placeholder="admin@bookify.local" required type="email" />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input className="field" id="password" name="password" placeholder="Your password" required type="password" />
      </div>
      {error ? <p className="rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</p> : null}
      <button className="btn-primary w-full" disabled={pending} type="submit">
        {pending ? "Signing in..." : "Enter Bookify"}
        <ArrowRight className="size-4" />
      </button>
    </form>
  );
}
