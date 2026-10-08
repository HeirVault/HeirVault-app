import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface Column<Row> {
  key: string;
  header: ReactNode;
  render: (row: Row, index: number) => ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}

export interface TableProps<Row> {
  columns: Column<Row>[];
  rows: Row[];
  /** Stable key for each row. */
  rowKey: (row: Row, index: number) => string;
  caption?: string;
  emptyMessage?: ReactNode;
  className?: string;
  /** Rendered inside the scroll container for small screens. */
  dense?: boolean;
}

export function Table<Row>({
  columns,
  rows,
  rowKey,
  caption,
  emptyMessage = "No records to display.",
  className,
  dense = false,
}: TableProps<Row>) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-border", className)}>
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-surface-raised">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted",
                  column.align === "right" && "text-right",
                  column.align === "center" && "text-center",
                  column.className,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-muted">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={rowKey(row, index)} className="border-t border-border odd:bg-surface even:bg-surface-raised/40">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      dense ? "px-4 py-2" : "px-4 py-3",
                      "align-middle text-content",
                      column.align === "right" && "text-right",
                      column.align === "center" && "text-center",
                      column.className,
                    )}
                  >
                    {column.render(row, index)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
