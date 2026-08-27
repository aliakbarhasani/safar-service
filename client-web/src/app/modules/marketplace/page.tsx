'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import config from '@/config/app-config.json';
import { getMarketplaceProducts } from '@/services/api';
import type { CustomerProductDto } from '@/services/api';

export default function MarketplacePage() {
  const [products, setProducts] = useState<CustomerProductDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProducts = async () => {
      try {
        setLoading(true);
        const result = await getMarketplaceProducts();
        setProducts(result?.data?.products || []);
        setError(null);
      } catch (err: any) {
        console.error('Error loading products:', err);
        setError(err?.message || 'خطا در بارگذاری محصولات');
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };

    loadProducts();
  }, []);

  return (
    <div className="min-h-screen bg-[#f8fafc] py-8 px-4" dir="rtl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-[#1e293b] mb-2">
          {config.texts?.marketplace?.title || 'بازارچه'}
        </h1>
        <p className="text-[#64748b]">
          {config.texts?.marketplace?.subtitle || 'کالا و خدمات'}
        </p>
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
            در حال بارگذاری محصولات...
          </div>
        </div>
      )}

      {/* Products Grid */}
      {!loading && products.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((product) => (
            <div
              key={product.id}
              className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-4"
            >
              {/* Product Image */}
              <div className="w-full h-40 bg-[#e2e8f0] rounded-lg mb-4 flex items-center justify-center">
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : (
                  <span className="text-[#64748b]">بدون تصویر</span>
                )}
              </div>

              {/* Product Info */}
              <h3 className="text-lg font-semibold text-[#1e293b] mb-2 line-clamp-2">
                {product.name}
              </h3>
              <p className="text-[#64748b] text-sm mb-3 line-clamp-2">
                {product.description}
              </p>

              {/* Rating */}
              {product.rating && (
                <div className="flex items-center mb-3">
                  <span className="text-yellow-500">★</span>
                  <span className="text-sm text-[#64748b] ml-1">{product.rating}</span>
                </div>
              )}

              {/* Price and Stock */}
              <div className="flex justify-between items-center mb-4">
                <div>
                  <span className="text-2xl font-bold text-[#1e40af]">
                    {product.price.toLocaleString()}
                  </span>
                  <span className="text-[#64748b] text-sm mr-1">
                    {product.currency}
                  </span>
                </div>
                <span className={`text-sm px-2 py-1 rounded ${
                  product.quantity > 0
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {product.quantity > 0 ? `${product.quantity} در انبار` : 'تمام شد'}
                </span>
              </div>

              {/* Action Button */}
              <button className="w-full py-2 bg-[#1e40af] text-white rounded-lg hover:bg-[#1e3a8a] transition-colors">
                مشاهده جزئیات
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && products.length === 0 && !error && (
        <div className="text-center py-12">
          <p className="text-[#64748b] mb-4">
            {config.texts?.marketplace?.noProducts || 'محصولی یافت نشد'}
          </p>
          <Link
            href="/"
            className="inline-block py-2 px-6 bg-[#1e40af] text-white rounded-lg hover:bg-[#1e3a8a]"
          >
            بازگشت به صفحه اصلی
          </Link>
        </div>
      )}
    </div>
  );
}
