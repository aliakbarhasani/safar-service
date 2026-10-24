import type { Metadata } from "next";
import "./globals.css";
import config from "@/config/app-config.json";
import ModuleNav from "@/components/ModuleNav";
import { AuthProvider } from "@/context/AuthContext";
import { LocaleProvider } from "@/context/LocaleContext";

export const metadata: Metadata = {
  title: config.app.name,
  description: config.app.description,
  manifest: "/manifest.json",
  other: {
    "theme-color": config.theme.colors.primary,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa-AF" dir="rtl" className="h-full">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css"
        />
      </head>
      <body className="min-h-full flex flex-col bg-[#f8fafc] text-[#1e293b]">
        <LocaleProvider>
          <AuthProvider>
            <ModuleNav />
            <div className="flex-1 flex flex-col">{children}</div>
          </AuthProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
