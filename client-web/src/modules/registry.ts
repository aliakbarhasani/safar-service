import config from '@/config/app-config.json';

export interface ModuleEntry {
  id: string;
  path: string;
  enabled: boolean;
  titleKey?: string;
}

export function getModules(): ModuleEntry[] {
  return (config.modules || []) as ModuleEntry[];
}

export function getEnabledModules(): ModuleEntry[] {
  return getModules().filter((m) => m.enabled);
}

export function getModuleTitle(module: ModuleEntry): string {
  const key = module.titleKey || module.id;
  return (config.moduleTexts && (config.moduleTexts as any)[key]) || module.id;
}

export default {
  getModules,
  getEnabledModules,
  getModuleTitle,
};
