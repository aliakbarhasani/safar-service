import Link from "next/link";
import { ArrowRight, Package, Truck } from "lucide-react";

export default function CargoPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-6" dir="rtl">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/" className="p-2 bg-white rounded-full shadow-sm hover:bg-gray-100 transition-colors">
            <ArrowRight className="w-6 h-6 text-gray-700" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-800">سامانه پیک و باربری</h1>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
          <h2 className="text-lg font-semibold text-gray-700 mb-2">ثبت سفارش ارسال بار</h2>
          
          <div className="relative">
            <span className="absolute right-3 top-3.5 text-amber-500">
              <Package className="w-5 h-5" />
            </span>
            <input 
              type="text" 
              placeholder="نوع مرسوله یا توضیحات بار..." 
              className="w-full pr-10 pl-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="relative">
            <span className="absolute right-3 top-3.5 text-amber-600">
              <Truck className="w-5 h-5" />
            </span>
            <input 
              type="text" 
              placeholder="آدرس مقصد تحویل..." 
              className="w-full pr-10 pl-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <button className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium py-3 rounded-xl transition-colors shadow-md">
            محاسبه هزینه و اعزام پیک
          </button>
        </div>
      </div>
    </div>
  );
}