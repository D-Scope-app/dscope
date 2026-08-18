import React from "react";
import { clsx } from "clsx";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, ...props }, ref) => {
    return (
      <div className="space-y-2">
        {label && (
          <label className="block text-sm font-semibold text-slate-300">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={clsx(
            "w-full px-4 py-3 rounded-xl border bg-white/5 text-white",
            "placeholder:text-slate-500",
            "focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500",
            "transition-all duration-200",
            error &&
              "border-red-500 focus:ring-red-500/50 focus:border-red-500",
            className,
          )}
          {...props}
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    );
  },
);

Input.displayName = "Input";
