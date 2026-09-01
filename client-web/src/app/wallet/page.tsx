import Link from "next/link";
import { ArrowRight, Wallet, CreditCard } from "lucide-react";

export default function WalletPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-6" dir="rtl">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/" className="p-2 bg-white rounded-full shadow-sm hover:bg-gray-100 transition-colors">
            <ArrowRight className="w-6 h-6 text-gray-700" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-800">کیف پول دیجیتال</h1>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
          <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-sm text-emerald-600 font-medium">موجودی فعلی</p>
              <h3 className="text-2xl font-bold text-emerald-700 mt-1">۰ ریال</h3>
            </div>
            <Wallet className="w-10 h-10 text-emerald-500" />
          </div>

          <div className="relative">
            <span className="absolute right-3 top-3.5 text-emerald-600">
              <CreditCard className="w-5 h-5" />
            </span>
            <input 
              type="number" 
              placeholder="مبلغ شارژ به ریال..." 
              className="w-full pr-10 pl-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-3 rounded-xl transition-colors shadow-md">
            افزایش موجودی آنی
          </button>
        </div>
      </div>
    </div>
  );
}