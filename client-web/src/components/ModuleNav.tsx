"use client";

import Link from "next/link";
import { getEnabledModules, getModuleTitle } from "@/modules/registry";
import { useLocale } from "@/context/LocaleContext";
import { SUPPORTED_LOCALES, getLocaleSettings, type SupportedLocale } from "@/lib/i18n/locale";

export default function ModuleNav() {
  const modules = getEnabledModules();
  const { locale, setLocale } = useLocale();

  return (
    <nav className="bg-white border-b border-[#e2e8f0] px-4 py-2">
      <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 gap-3 overflow-auto">
          {modules.map((m) => (
            <Link
              key={m.id}
              href={m.path}
              className="px-3 py-2 rounded-lg text-sm bg-[#f8fafc] hover:bg-[#eef2ff] whitespace-nowrap"
            >
              {getModuleTitle(m)}
            </Link>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm whitespace-nowrap">
          <span className="sr-only">زبان برنامه</span>
          <select
            aria-label="زبان برنامه"
            value={locale}
            onChange={(event) => setLocale(event.target.value as SupportedLocale)}
            className="max-w-36 rounded-lg border border-[#cbd5e1] bg-white px-2 py-2 text-sm"
          >
            {SUPPORTED_LOCALES.map((supportedLocale) => (
              <option key={supportedLocale} value={supportedLocale}>
                {getLocaleSettings(supportedLocale).nativeName}
              </option>
            ))}
          </select>
        </label>
      </div>
    </nav>
  );
}
