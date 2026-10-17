import type { HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLDivElement>;

function Card({ className = "", ...props }: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-border bg-card text-card-foreground shadow-sm ${className}`}
      {...props}
    />
  );
}

function CardHeader({ className = "", ...props }: CardProps) {
  return <div className={`flex flex-col gap-1.5 p-5 ${className}`} {...props} />;
}

function CardTitle({ className = "", ...props }: CardProps) {
  return (
    <h2
      className={`text-base font-semibold leading-none tracking-tight ${className}`}
      {...props}
    />
  );
}

function CardDescription({ className = "", ...props }: CardProps) {
  return (
    <p
      className={`text-sm leading-relaxed text-muted-foreground ${className}`}
      {...props}
    />
  );
}

function CardContent({ className = "", ...props }: CardProps) {
  return <div className={`px-5 pb-5 ${className}`} {...props} />;
}

function CardFooter({ className = "", ...props }: CardProps) {
  return (
    <div
      className={`flex items-center px-5 pb-5 ${className}`}
      {...props}
    />
  );
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
