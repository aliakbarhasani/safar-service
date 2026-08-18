"use client";

import Link from 'next/link';
import { getEnabledModules, getModuleTitle } from '@/modules/registry';

export default function ModuleNav() {
  const modules = getEnabledModules();

  if (!modules.length) return null;

  return (
    <nav className="bg-white border-b border-[#e2e8f0] px-4 py-2">
      <div className="max-w-6xl mx-auto flex gap-3 overflow-auto">
        {modules.map((m) => (
          <Link
            key={m.id}
            href={m.path}
            className="px-3 py-2 rounded-lg text-sm bg-[#f8fafc] hover:bg-[#eef2ff]"
          >
            {getModuleTitle(m)}
          </Link>
        ))}
      </div>
    </nav>
  );
}
