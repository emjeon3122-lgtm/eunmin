import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "경조사 화환 신청",
  description: "사내 경조사 화환 자동 발송 앱",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="font-sans">{children}</body>
    </html>
  );
}
