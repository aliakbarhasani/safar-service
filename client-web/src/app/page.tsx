import { appModules } from "@/config/modules.config";
import { Car, Truck, ShoppingBag, Map, Wallet, LayoutGrid } from "lucide-react";
import Link from "next/link";

const IconMap: Record<string, any> | any = {
  Car,
  Truck,
  ShoppingBag,
  Map,
  Wallet,
};

export default function SuperAppMain() {
  return (
    <main className="min-h-screen bg-gray-50 p-4 pb-24" dir="rtl">
      
      <header className="flex justify-between items-center bg-white p-5 rounded-2xl shadow-sm mb-6 border border-gray-100">
        <div className="flex flex-col">
          <h1 className="text-2xl font-black text-gray-800 tracking-tight">سفر سرویس</h1>
          <p className="text-xs font-medium text-gray-500 mt-1">همه‌چیز برای یک سفر هوشمند</p>
        </div>
        <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center border border-blue-100">
          <span className="text-blue-600 font-bold text-lg">U</span>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-4">
        {appModules.map((mod) => {
          const IconComponent = IconMap[mod.icon] || LayoutGrid;
          
          return (
            <Link
              key={mod.id}
              href={mod.active ? mod.path : "#"}
              className={`relative overflow-hidden p-6 rounded-3xl flex flex-col items-center justify-center gap-4 transition-all duration-300 ${
                mod.active
                  ? "bg-white shadow-sm hover:shadow-md border border-gray-100"
                  : "bg-gray-100/80 cursor-not-allowed border border-dashed border-gray-200"
              }`}
            >
              {!mod.active && (
                <span className="absolute top-3 right-3 bg-gray-200/80 text-gray-600 text-[10px] font-bold px-2.5 py-1 rounded-full backdrop-blur-sm">
                  به‌زودی
                </span>
              )}
              
              <div className={`p-4 rounded-2xl text-white shadow-inner ${mod.active ? mod.color : "bg-gray-300"} transition-transform hover:scale-105`}>
                <IconComponent size={32} strokeWidth={2} />
              </div>
              
              <h2 className={`text-sm font-bold ${mod.active ? "text-gray-800" : "text-gray-400"}`}>
                {mod.name}
              </h2>
            </Link>
          );
        })}
      </section>
    </main>
  );
}