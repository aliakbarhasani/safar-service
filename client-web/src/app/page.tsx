"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Bus, CarFront, Check, ChevronLeft, CircleHelp, CloudSun,
  Compass, Globe2, MapPinned, Package, Plane, Search, ShieldCheck,
  ShoppingBasket, Smartphone, Store, Truck, Wallet, X, Zap,
} from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const services = [
  { id: "taxi", title: "تاکسی و رزرو سفر", description: "انتخاب مبدأ و مقصد و ثبت درخواست سفر", category: "حمل‌ونقل", icon: CarFront, href: "/taxi", color: "teal", active: true },
  { id: "cargo", title: "باربری و ارسال مرسوله", description: "ثبت درخواست ارسال بار و بسته", category: "حمل‌ونقل", icon: Package, href: "/cargo", color: "gold", active: true },
  { id: "courier", title: "پیک موتوری", description: "ارسال سریع بسته درون‌شهری", category: "حمل‌ونقل", icon: Zap, color: "orange", active: false },
  { id: "bus", title: "سفر با اتوبوس", description: "مسیرها و خدمات سفر زمینی", category: "سفر", icon: Bus, color: "blue", active: false },
  { id: "air", title: "سفر هوایی", description: "خدمات و برنامه‌ریزی سفر با هواپیما", category: "سفر", icon: Plane, color: "purple", active: false },
  { id: "tour-local", title: "تورهای گردشگری داخلی", description: "گشت‌وگذار و مقصدهای داخل کشور", category: "گردشگری", icon: Compass, color: "green", active: false },
  { id: "tour-world", title: "تورهای خارجی و زیارتی", description: "برنامه‌ریزی سفرهای بین‌المللی و زیارتی", category: "گردشگری", icon: Globe2, color: "indigo", active: false },
  { id: "market", title: "بازارچه و فروشگاه", description: "فضای خریدوفروش کالا و خدمات", category: "خرید", icon: ShoppingBasket, color: "pink", active: false },
  { id: "wallet", title: "کیف پول", description: "مشاهده بخش کیف پول پروژه", category: "حساب کاربری", icon: Wallet, href: "/wallet", color: "emerald", active: true },
  { id: "admin", title: "پنل مدیریت", description: "مدیریت خدمات، درخواست‌ها و کاربران", category: "مدیریت", icon: ShieldCheck, color: "slate", active: false },
  { id: "ads", title: "تبلیغات کسب‌وکارها", description: "معرفی خدمات و مدیریت آگهی‌ها", category: "کسب‌وکار", icon: Store, color: "amber", active: false },
  { id: "weather", title: "آب‌وهوا و اطلاعات سفر", description: "ابزارهای کمکی برای برنامه‌ریزی سفر", category: "ابزارها", icon: CloudSun, color: "sky", active: false },
] as const;

const filters = ["همه خدمات", "حمل‌ونقل", "سفر", "گردشگری", "خرید", "حساب کاربری", "مدیریت", "کسب‌وکار", "ابزارها"];

export default function SuperAppMain() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("همه خدمات");
  const [selected, setSelected] = useState<(typeof services)[number] | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installMessage, setInstallMessage] = useState("");

  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", capture);
    return () => window.removeEventListener("beforeinstallprompt", capture);
  }, []);

  const visibleServices = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("fa");
    return services.filter((service) =>
      (filter === "همه خدمات" || service.category === filter) &&
      (!term || `${service.title} ${service.description} ${service.category}`.toLocaleLowerCase("fa").includes(term))
    );
  }, [filter, query]);

  const installApp = async () => {
    if (!installPrompt) {
      setInstallMessage("اگر گزینه نصب نمایش داده نمی‌شود، از منوی مرورگر «افزودن به صفحه اصلی» یا «Install app» را انتخاب کن. نصب به پشتیبانی مرورگر و انتشار امن HTTPS نیاز دارد.");
      return;
    }
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    setInstallMessage(result.outcome === "accepted" ? "درخواست نصب تأیید شد؛ مراحل نمایش‌داده‌شده در مرورگر را کامل کن." : "نصب فعلاً لغو شد؛ هر زمان خواستی دوباره امتحان کن.");
    setInstallPrompt(null);
  };

  return (
    <div className="safar-home min-h-screen" dir="rtl">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="صفحه اصلی سفر سرویس">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-800 text-white shadow-lg"><Compass size={25} /></span>
            <span><span className="block text-lg font-black text-slate-900 sm:text-xl">سفر سرویس</span><span className="block text-[11px] text-slate-500 sm:text-xs">همراه هوشمند سفرهای شما</span></span>
          </Link>
          <nav className="hidden items-center gap-5 text-sm font-semibold text-slate-600 lg:flex">
            <a href="#services" className="hover:text-teal-800">خدمات</a><a href="#how-it-works" className="hover:text-teal-800">راهنمای استفاده</a><a href="#about" className="hover:text-teal-800">درباره ما</a>
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={installApp} className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-3 py-2.5 text-xs font-extrabold text-slate-950 transition hover:bg-amber-300 sm:px-4 sm:text-sm"><Smartphone size={17} /><span className="hidden sm:inline">نصب اپلیکیشن</span><span className="sm:hidden">نصب</span></button>
            <Link href="/auth/login" className="hidden rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-teal-700 hover:text-teal-800 sm:inline-flex">ورود / ثبت‌نام</Link>
          </div>
        </div>
      </header>

      {installMessage && <div role="status" className="mx-auto mt-3 flex max-w-7xl items-start gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm leading-7 text-teal-950 sm:mx-6 lg:mx-auto"><Smartphone className="mt-1 shrink-0" size={18} /><p className="flex-1">{installMessage}</p><button onClick={() => setInstallMessage("")} aria-label="بستن پیام"><X size={18} /></button></div>}

      <main>
        <section className="relative isolate overflow-hidden bg-slate-950 text-white">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(13,148,136,0.42),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(245,158,11,0.15),transparent_45%)]" />
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-20">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-teal-300/25 bg-teal-300/10 px-3 py-1.5 text-xs font-bold text-teal-100"><span className="h-2 w-2 rounded-full bg-amber-400" /> نسخه در حال توسعه، قدم‌به‌قدم واقعی‌تر</div>
              <h1 className="max-w-3xl text-3xl font-black leading-[1.55] sm:text-4xl lg:text-5xl">از اینجا، <span className="text-amber-300">سفر هوشمند</span> خودت را شروع کن</h1>
              <p className="mt-4 max-w-2xl text-sm leading-8 text-slate-300 sm:text-base">تاکسی، باربری، گردشگری و خدمات سفر در یک مسیر یکپارچه؛ با چشم‌انداز ساخت یک وب‌اپلیکیشن فارسی‌محور برای سفرهای داخلی و بین‌المللی.</p>
              <div className="mt-7 flex flex-wrap gap-3"><a href="#services" className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-extrabold text-slate-950 hover:bg-amber-300">مشاهده خدمات <ArrowLeft size={18} /></a><button onClick={installApp} className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-bold text-white hover:bg-white/10"><Smartphone size={18} /> نصب روی دستگاه</button></div>
              <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-slate-400"><span className="inline-flex items-center gap-2"><Check size={15} className="text-teal-300" /> طراحی فارسی و راست‌چین</span><span className="inline-flex items-center gap-2"><Check size={15} className="text-teal-300" /> سازگار با موبایل</span><span className="inline-flex items-center gap-2"><Check size={15} className="text-teal-300" /> توسعه مرحله‌ای</span></div>
            </div>
            <div className="mx-auto w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.07] p-4 shadow-2xl backdrop-blur">
              <div className="rounded-[1.5rem] bg-white p-5 text-slate-900">
                <div className="flex items-center justify-between"><div><p className="text-xs font-semibold text-slate-500">شروع سریع</p><h2 className="mt-1 text-lg font-black">چه خدمتی نیاز داری؟</h2></div><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-50 text-teal-800"><MapPinned size={23} /></span></div>
                <div className="mt-5 grid grid-cols-2 gap-3">{services.slice(0, 4).map((service) => { const Icon = service.icon; const content = <><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-800"><Icon size={21} /></span><span className="mt-3 block text-sm font-extrabold">{service.title}</span><span className="mt-1 block text-[11px] text-slate-500">{service.active ? "مشاهده بخش" : "در نقشه راه"}</span></>; return service.href ? <Link key={service.id} href={service.href} className="rounded-2xl border border-slate-100 p-3 hover:border-teal-300 hover:bg-teal-50/50">{content}</Link> : <button key={service.id} onClick={() => setSelected(service)} className="rounded-2xl border border-slate-100 p-3 text-right hover:border-teal-300 hover:bg-teal-50/50">{content}</button>; })}</div>
                <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] leading-6 text-slate-500">بخش‌های فعال و در حال ساخت جداگانه مشخص شده‌اند؛ خدمات آماده‌نشده هنوز سفارش واقعی ثبت نمی‌کنند.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="services" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div><p className="text-xs font-extrabold text-teal-800">خدمات سفر سرویس</p><h2 className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">همه خدمات، یکجا</h2><p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">از بخش‌های موجود شروع کن؛ خدمات دیگر نیز در نقشه راه مشخص هستند و به‌تدریج فعال می‌شوند.</p></div><div className="relative w-full md:max-w-xs"><Search className="absolute right-3 top-3.5 text-slate-400" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جستجوی خدمات..." className="w-full rounded-xl border border-slate-200 bg-white py-3 pr-10 pl-4 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10" aria-label="جستجوی خدمات" /></div></div>
          <div className="mt-6 flex gap-2 overflow-x-auto pb-2">{filters.map((item) => <button key={item} onClick={() => setFilter(item)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition ${filter === item ? "bg-teal-800 text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:text-teal-800"}`}>{item}</button>)}</div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{visibleServices.map((service) => { const Icon = service.icon; const card = <><div className="flex items-start justify-between gap-3"><span className={`service-icon service-icon-${service.color} flex h-12 w-12 items-center justify-center rounded-2xl`}><Icon size={24} /></span><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${service.active ? "bg-teal-50 text-teal-800" : "bg-slate-100 text-slate-500"}`}>{service.active ? "قابل مشاهده" : "در حال آماده‌سازی"}</span></div><h3 className="mt-4 text-base font-extrabold text-slate-900">{service.title}</h3><p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">{service.description}</p><span className={`mt-4 inline-flex items-center gap-1 text-xs font-extrabold ${service.active ? "text-teal-800" : "text-slate-500"}`}>{service.active ? "ورود به بخش" : "مشاهده وضعیت"} <ChevronLeft size={16} /></span></>; return service.href ? <Link key={service.id} href={service.href} className="service-card group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-teal-200 hover:shadow-lg">{card}</Link> : <button key={service.id} onClick={() => setSelected(service)} className="service-card w-full rounded-2xl border border-slate-200 bg-white p-5 text-right shadow-sm transition duration-200 hover:-translate-y-1 hover:border-teal-200 hover:shadow-lg">{card}</button>; })}{visibleServices.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 sm:col-span-2 lg:col-span-3">خدمتی پیدا نشد؛ عبارت دیگری جستجو کن.</div>}</div>
        </section>

        <section id="how-it-works" className="border-y border-slate-200 bg-white"><div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-3 lg:px-8"><div className="flex gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-800"><Search size={22} /></span><div><h3 className="font-extrabold">۱. خدمت را انتخاب کن</h3><p className="mt-2 text-sm leading-7 text-slate-500">از میان بخش‌های موجود، سرویس موردنیازت را باز کن.</p></div></div><div className="flex gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><Check size={22} /></span><div><h3 className="font-extrabold">۲. وضعیت را شفاف ببین</h3><p className="mt-2 text-sm leading-7 text-slate-500">بخش‌های آماده از بخش‌های در حال ساخت مشخص شده‌اند.</p></div></div><div className="flex gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><Smartphone size={22} /></span><div><h3 className="font-extrabold">۳. روی دستگاهت نصب کن</h3><p className="mt-2 text-sm leading-7 text-slate-500">پس از انتشار امن، در مرورگر سازگار گزینه نصب یا افزودن به صفحه اصلی را انتخاب کن.</p></div></div></div></section>
        <section id="about" className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8"><div><p className="text-lg font-black text-slate-900">سفر سرویس</p><p className="mt-1 text-sm leading-7 text-slate-500">سامانه یکپارچه خدمات سفر؛ فارسی‌محور، ماژولار و در حال توسعه.</p></div><div className="flex items-center gap-2 text-xs text-slate-500"><CircleHelp size={16} /> این نسخه هنوز نسخه نهایی عملیاتی نیست.</div></section>
      </main>

      {selected && (() => { const Icon = selected.icon; return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-3 backdrop-blur-sm sm:items-center" onClick={() => setSelected(null)}><section role="dialog" aria-modal="true" aria-labelledby="service-dialog-title" className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><Icon size={25} /></span><button onClick={() => setSelected(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="بستن"><X size={20} /></button></div><h2 id="service-dialog-title" className="mt-4 text-xl font-black text-slate-900">{selected.title}</h2><p className="mt-2 text-sm leading-7 text-slate-600">{selected.description}</p><div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-7 text-amber-950">این بخش در نقشه راه سفر سرویس قرار دارد، اما هنوز برای انجام سفارش واقعی فعال نشده است.</div><button onClick={() => setSelected(null)} className="mt-5 w-full rounded-xl bg-teal-800 px-4 py-3 text-sm font-extrabold text-white hover:bg-teal-900">متوجه شدم</button></section></div>; })()}

      <footer className="border-t border-slate-200 bg-white px-4 py-5 text-center text-xs text-slate-500">© سفر سرویس — نسخه در حال توسعه</footer>
    </div>
  );
}
