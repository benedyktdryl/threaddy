import type { HTMLAttributes, PropsWithChildren } from "react";

import { cn } from "../../lib/utils";

export function Card({ className, children, ...props }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return (
    <div className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)} {...props}>
      {children}
    </div>
  );
}

export function CardSection({ className, children, ...props }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return (
    <div className={cn("border-b border-border px-4 py-3 last:border-b-0", className)} {...props}>
      {children}
    </div>
  );
}
