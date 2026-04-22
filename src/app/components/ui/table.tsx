import type { HTMLAttributes, PropsWithChildren, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";

import { cn } from "../../lib/utils";

export function TableWrap({ className, children }: PropsWithChildren<{ className?: string }>) {
  return <div className={cn("overflow-x-auto", className)}>{children}</div>;
}

export function Table({ className, children, ...props }: PropsWithChildren<TableHTMLAttributes<HTMLTableElement>>) {
  return (
    <table className={cn("w-full border-collapse", className)} {...props}>
      {children}
    </table>
  );
}

export function Th({ className, children, ...props }: PropsWithChildren<ThHTMLAttributes<HTMLTableCellElement>>) {
  return (
    <th className={cn("bg-secondary/70 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground", className)} {...props}>
      {children}
    </th>
  );
}

export function Td({ className, children, ...props }: PropsWithChildren<TdHTMLAttributes<HTMLTableCellElement>>) {
  return (
    <td className={cn("border-b border-border px-4 py-3 align-top text-sm", className)} {...props}>
      {children}
    </td>
  );
}

export function Tr({ className, children, ...props }: PropsWithChildren<HTMLAttributes<HTMLTableRowElement>>) {
  return (
    <tr className={cn("transition-colors hover:bg-secondary/30", className)} {...props}>
      {children}
    </tr>
  );
}
