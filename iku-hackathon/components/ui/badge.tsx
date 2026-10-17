import type { HTMLAttributes } from "react";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "secondary" | "outline";
};

const variants = {
  default: "border-transparent bg-accent text-accent-foreground",
  secondary: "border-transparent bg-availability-soft text-deep",
  outline: "border-border bg-transparent text-muted-foreground",
};

function Badge({ className = "", variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-medium leading-none ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export { Badge };
