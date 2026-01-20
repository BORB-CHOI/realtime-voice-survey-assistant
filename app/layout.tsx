import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Elderly Mobility Survey",
  description: "Realtime voice survey prototype",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
