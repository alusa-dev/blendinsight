import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Blend Insight MCP",
  description: "Servidor pessoal de integração do Instagram com ChatGPT.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
