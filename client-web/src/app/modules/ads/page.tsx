'use client';

import { useState, useEffect } from 'react';
import config from '@/config/app-config.json';
import { getCampaigns } from '@/services/api';
import type { CampaignDto } from '@/services/api';

export default function AdsPage() {
  const [campaigns, setCampaigns] = useState<CampaignDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadCampaigns = async () => {
      try {
        setLoading(true);
        const result = await getCampaigns();
        setCampaigns(result?.data || []);
        setError(null);
      } catch (err: any) {
        if (err?.status === 401) {
          setError('توکن شما منقضی شده است');
        } else {
          console.error('Error loading campaigns:', err);
          setError(
            err?.message || 'خطا در بارگذاری کمپین‌ها'
          );
        }
        setCampaigns([]);
      } finally {
        setLoading(false);
      }
    };

    loadCampaigns();
  }, []);

  return (
    <div className="min-h-screen bg-[#f8fafc] py-8 px-4" dir="rtl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-[#1e293b] mb-2">
          {config.texts?.ads?.title || 'تبلیغات'}
        </h1>
        <p className="text-[#64748b]">
          {config.texts?.ads?.subtitle || 'مدیریت کمپین‌های تبلیغی'}
        </p>
      </div>

      {/* Create Campaign Button */}
      <div className="mb-6">
        <button className="py-2 px-6 bg-[#1e40af] text-white rounded-lg hover:bg-[#1e3a8a] transition-colors">
          {config.texts?.ads?.createCampaign || '+ ایجاد کمپین جدید'}
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6 p-4 bg-red-100 border border-red-400 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <div className="text-[#64748b]">
            در حال بارگذاری کمپین‌ها...
          </div>
        </div>
      )}

      {/* Campaigns Table */}
      {!loading && campaigns.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-[#f1f5f9] border-b">
              <tr>
                <th className="px-6 py-4 text-right font-semibold text-[#1e293b]">
                  {config.texts?.ads?.campaignName || 'نام کمپین'}
                </th>
                <th className="px-6 py-4 text-right font-semibold text-[#1e293b]">
                  {config.texts?.ads?.budget || 'بودجه'}
                </th>
                <th className="px-6 py-4 text-right font-semibold text-[#1e293b]">
                  هزینه شده
                </th>
                <th className="px-6 py-4 text-right font-semibold text-[#1e293b]">
                  {config.texts?.ads?.impressions || 'نمایش‌ها'}
                </th>
                <th className="px-6 py-4 text-right font-semibold text-[#1e293b]">
                  {config.texts?.ads?.clicks || 'کلیک‌ها'}
                </th>
                <th className="px-6 py-4 text-right font-semibold text-[#1e293b]">
                  {config.texts?.ads?.status || 'وضعیت'}
                </th>
                <th className="px-6 py-4 text-right font-semibold text-[#1e293b]">
                  اقدام
                </th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr key={campaign.id} className="border-b hover:bg-[#f8fafc]">
                  <td className="px-6 py-4 text-[#1e293b] font-medium">
                    {campaign.name}
                  </td>
                  <td className="px-6 py-4 text-[#64748b]">
                    {campaign.budget.toLocaleString()} افغانی
                  </td>
                  <td className="px-6 py-4 text-[#64748b]">
                    {campaign.spent.toLocaleString()} افغانی
                  </td>
                  <td className="px-6 py-4 text-[#64748b]">
                    {campaign.impressions?.toLocaleString() || '۰'}
                  </td>
                  <td className="px-6 py-4 text-[#64748b]">
                    {campaign.clicks?.toLocaleString() || '۰'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                      campaign.status === 'active'
                        ? 'bg-green-100 text-green-700'
                        : campaign.status === 'draft'
                        ? 'bg-gray-100 text-gray-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {campaign.status === 'active' ? 'فعال' : 
                       campaign.status === 'draft' ? 'پیش‌نویس' : 'متوقف'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button className="text-[#1e40af] hover:text-[#1e3a8a] font-medium">
                      مشاهده
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty State */}
      {!loading && campaigns.length === 0 && !error && (
        <div className="text-center py-12">
          <p className="text-[#64748b] mb-4">
            {config.texts?.ads?.noCampaigns || 'کمپینی یافت نشد'}
          </p>
          <button className="inline-block py-2 px-6 bg-[#1e40af] text-white rounded-lg hover:bg-[#1e3a8a]">
            {config.texts?.ads?.createCampaign || '+ ایجاد کمپین جدید'}
          </button>
        </div>
      )}
    </div>
  );
}
