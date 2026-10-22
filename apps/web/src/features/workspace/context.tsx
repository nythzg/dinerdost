"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { Field } from "@/components/ui";
import type { Row } from "@/lib/client";
export interface Desk {
  data: Row;
  busy: boolean;
  run: (action: string, input?: unknown, extra?: Row) => Promise<any>;
  form: (
    title: string,
    fields: Field[],
    submit: (values: Row) => Promise<any>,
    label?: string,
  ) => void;
  modal: (title: string, content: ReactNode) => void;
  close: () => void;
  notify: (text: string) => void;
  go: (path: string) => void;
  refresh: () => Promise<void>;
}
export const DeskContext = createContext<Desk | null>(null);
export function useDesk() {
  const desk = useContext(DeskContext);
  if (!desk) throw new Error("Workspace context is missing.");
  return desk;
}
