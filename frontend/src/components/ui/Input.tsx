import React, { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightAction?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftIcon, rightAction, className = "", id, ...props }, ref) => {
    const inputId = id || props.name;

    return (
      <div className="w-full flex flex-col gap-1.5 text-left">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-semibold font-headline text-on-surface tracking-wide"
          >
            {label}
            {props.required && <span className="text-tertiary ml-1">*</span>}
          </label>
        )}

        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3 text-on-surface-variant/70 flex items-center pointer-events-none">
              {leftIcon}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            className={`w-full font-body text-sm text-on-surface bg-surface-container-lowest border rounded-lg transition-all duration-200 placeholder:text-outline/70 focus:outline-none focus:ring-2 disabled:bg-surface-container-low disabled:cursor-not-allowed ${
              leftIcon ? "pl-9" : "pl-3.5"
            } ${rightAction ? "pr-10" : "pr-3.5"} py-2.5 ${
              error
                ? "border-error focus:border-error focus:ring-error/20"
                : "border-outline-variant hover:border-outline focus:border-primary focus:ring-primary/20"
            } ${className}`}
            {...props}
          />

          {rightAction && (
            <div className="absolute right-2.5 flex items-center">{rightAction}</div>
          )}
        </div>

        {error ? (
          <p className="text-xs text-error font-body mt-0.5 animate-fadeIn">{error}</p>
        ) : helperText ? (
          <p className="text-xs text-on-surface-variant font-body mt-0.5">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = "Input";
