import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getModules, getModuleTitle } from '@/modules/registry';

type ModulePageProps = {
  params: Promise<{ module: string }>;
};

export default async function ModulePlaceholder({ params }: ModulePageProps) {
  const { module: modId } = await params;
  const found = getModules().find((module) => module.id === modId);

  if (!found) {
    notFound();
  }

  return (
    <main
      className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6"
      aria-labelledby="module-title"
    >
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-2xl text-amber-800" aria-hidden="true">
          …
        </div>
        <p className="mb-2 text-sm font-bold text-teal-800">سفر سرویس</p>
        <h1 id="module-title" className="mb-4 text-2xl font-black text-slate-900">
          {getModuleTitle(found)}
        </h1>
        <p className="mb-3 leading-8 text-slate-600">
          این بخش در حال آماده‌سازی است و هنوز خدمات عملیاتی خود را ارائه نمی‌کند.
        </p>
        <p className="mb-7 text-sm leading-7 text-slate-500">
          برای جلوگیری از سردرگمی، تا زمان تکمیل این بخش امکان ثبت سفارش واقعی از این صفحه وجود ندارد.
        </p>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-teal-800 px-5 py-3 text-sm font-bold text-white transition hover:bg-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
        >
          بازگشت به صفحه اصلی
        </Link>
      </div>
    </main>
  );
}