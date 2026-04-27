"use client";

import type { ReactNode } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Wrapping next-themes here so the rest of the tree can stay server-component-
 * shaped. Default 'system' so we honour the OS preference until the user
 * picks explicitly. `attribute="class"` toggles the `.dark` class on <html>,
 * which our globals.css palette listens to.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
