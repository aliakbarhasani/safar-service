import config from '@/config/app-config.json';
import { getModules, getModuleTitle } from '@/modules/registry';

export default function ModulePlaceholder(props: any) {
  const modId = props?.params?.module;
  const modules = getModules();
  const found = modules.find((m) => m.id === modId) || null;

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-2xl w-full bg-white rounded-2xl p-8 shadow">
        <h1 className="text-2xl font-bold mb-4">
          {found ? getModuleTitle(found) : modId}
        </h1>
        <p className="text-sm text-[#64748b] mb-6">
          این صفحه یک پلاسبولدر ماژول است. منطق تجاری هنوز پیاده‌سازی نشده است.
        </p>
        <pre className="bg-[#f8fafc] rounded p-4 text-sm overflow-x-auto">{JSON.stringify(found, null, 2)}</pre>
      </div>
    </div>
  );
}
