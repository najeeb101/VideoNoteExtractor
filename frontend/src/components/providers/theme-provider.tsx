"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// next-themes renders an inline <script> that sets the theme class before paint.
// It has already run from the server HTML; on the client, mark it as a
// non-executable data block so React 19 doesn't warn about a <script> tag.
const scriptProps = typeof window === "undefined" ? undefined : ({ type: "application/json" } as const);

export function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider scriptProps={scriptProps} {...props}>{children}</NextThemesProvider>;
}
