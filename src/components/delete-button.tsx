"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";

type DeleteButtonProps = {
  id: string;
  label: string;
  action: (id: string) => Promise<void>;
};

export function DeleteButton({ id, label, action }: DeleteButtonProps) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`Delete "${label}"? This cannot be undone.`)) return;
    startTransition(() => action(id));
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className="rounded-xl border border-white/10 p-2 text-white/40 transition hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
      aria-label={`Delete ${label}`}
    >
      <Trash2 className="size-4" />
    </button>
  );
}
