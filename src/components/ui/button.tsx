import * as React from "react";
import { cn } from "../../lib/utils";

type ButtonVariant = "default" | "secondary" | "ghost" | "icon";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variants: Record<ButtonVariant, string> = {
  default: "inline-flex items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800",
  ghost: "inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-slate-700",
  icon: "inline-grid h-9 w-9 place-items-center rounded-md border border-slate-300 bg-white text-slate-700",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", type = "button", ...props }, ref) => (
    <button ref={ref} type={type} className={cn(variants[variant], className)} {...props} />
  ),
);

Button.displayName = "Button";
