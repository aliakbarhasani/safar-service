import Link from "next/link";
import { ArrowRight } from "lucide-react";

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
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-gray-600">موجودی، تاریخچه تراکنش‌ها و سیستم شارژ آنی به زودی در این بخش فعال خواهد شد.</p>
        </div>
      </div>
    </div>
  );
}