"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

export function SignOutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      className="btn-secondary w-full justify-center text-sm"
      onClick={() => {
        startTransition(async () => {
          await signOut({ callbackUrl: "/login" });
        });
      }}
      type="button"
    >
      <LogOut className="size-4" />
      {pending ? "Signing out..." : "Sign out"}
    </button>
  );
}
