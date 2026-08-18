import React from "react";
import { clsx } from "clsx";

type BadgeTone = "neutral" | "blue" | "green" | "amber" | "red" | "violet";

interface BadgeProps {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}

export function Badge({ children, tone = "neutral", className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border",
        {
          "text-slate-300 bg-slate-800/50 border-slate-700": tone === "neutral",
          "text-blue-300 bg-blue-900/30 border-blue-700/50": tone === "blue",
          "text-green-300 bg-green-900/30 border-green-700/50":
            tone === "green",
          "text-amber-300 bg-amber-900/30 border-amber-700/50":
            tone === "amber",
          "text-red-300 bg-red-900/30 border-red-700/50": tone === "red",
          "text-violet-300 bg-violet-900/30 border-violet-700/50":
            tone === "violet",
        },
        className,
      )}
    >
      {children}
    </span>
  );
}
