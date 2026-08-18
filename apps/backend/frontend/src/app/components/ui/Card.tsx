import React from "react";
import { clsx } from "clsx";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
}

export function Card({ children, className, glow = false }: CardProps) {
  return (
    <div
      className={clsx(
        "relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl",
        "shadow-2xl shadow-black/50",
        glow && "shadow-primary-500/20",
        className,
      )}
    >
      {children}
    </div>
  );
}
