import type { PropsWithChildren } from "react";

import { cn } from "../../lib/utils";

export function Badge({ className, children }: PropsWithChildren<{ className?: string }>) {
  return <span className={cn("ui-badge", className)}>{children}</span>;
}
