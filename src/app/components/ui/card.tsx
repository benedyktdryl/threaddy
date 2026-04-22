import type { HTMLAttributes, PropsWithChildren } from "react";

import { cn } from "../../lib/utils";

export function Card({ className, children, ...props }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return (
    <div className={cn("rounded-3xl border bg-card/95 text-card-foreground shadow-shell", className)} {...props}>
      {children}
    </div>
  );
}

export function CardSection({ className, children, ...props }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return (
    <div className={cn("border-b border-border px-5 py-4 last:border-b-0", className)} {...props}>
      {children}
    </div>
  );
}
