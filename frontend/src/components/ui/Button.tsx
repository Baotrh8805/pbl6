import React from "react";
import type { ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "accent" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  size = "md",
  isLoading = false,
  disabled,
  className = "",
  ...props
}) => {
  const baseStyles =
    "inline-flex items-center justify-center font-headline font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none";

  const variants = {
    primary:
      "bg-primary hover:bg-primary-deep text-white shadow-sm hover:shadow active:scale-[0.99] focus:ring-primary/40",
    accent:
      "bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold shadow-xs active:scale-[0.99] focus:ring-amber-400/40",
    secondary:
      "bg-secondary hover:bg-[#00553a] text-white shadow-sm hover:shadow active:scale-[0.99] focus:ring-secondary/40",
    outline:
      "border border-outline-variant hover:border-primary text-on-surface bg-surface-container-lowest hover:bg-surface-container-low focus:ring-primary/20",
    ghost:
      "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high focus:ring-surface-tint/20",
    danger:
      "bg-error hover:bg-on-error-container text-white shadow-sm hover:shadow active:scale-[0.99] focus:ring-error/40",
  };

  const sizes = {
    sm: "text-xs px-3 py-1.5 gap-1.5",
    md: "text-sm px-4 py-2.5 gap-2",
    lg: "text-base px-6 py-3 gap-2.5",
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {isLoading && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
      {children}
    </button>
  );
};
