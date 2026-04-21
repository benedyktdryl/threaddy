import type { HTMLAttributes, PropsWithChildren, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";

import { cn } from "../../lib/utils";

export function TableWrap({ className, children }: PropsWithChildren<{ className?: string }>) {
  return <div className={cn("ui-table-wrap", className)}>{children}</div>;
}

export function Table({ className, children, ...props }: PropsWithChildren<TableHTMLAttributes<HTMLTableElement>>) {
  return (
    <table className={cn("ui-table", className)} {...props}>
      {children}
    </table>
  );
}

export function Th({ className, children, ...props }: PropsWithChildren<ThHTMLAttributes<HTMLTableCellElement>>) {
  return (
    <th className={cn("ui-th", className)} {...props}>
      {children}
    </th>
  );
}

export function Td({ className, children, ...props }: PropsWithChildren<TdHTMLAttributes<HTMLTableCellElement>>) {
  return (
    <td className={cn("ui-td", className)} {...props}>
      {children}
    </td>
  );
}

export function Tr({ className, children, ...props }: PropsWithChildren<HTMLAttributes<HTMLTableRowElement>>) {
  return (
    <tr className={cn("ui-tr", className)} {...props}>
      {children}
    </tr>
  );
}
