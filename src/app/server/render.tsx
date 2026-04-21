import { renderToString } from "react-dom/server";
import type { ReactElement } from "react";

export function renderDocument(element: ReactElement): string {
  return `<!doctype html>${renderToString(element)}`;
}
