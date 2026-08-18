class PricingController {
    constructor(generateQuoteUseCase) {
        this.generateQuoteUseCase = generateQuoteUseCase;
    }

    async calculateQuote(req, res) {
        try {
            const { serviceType, distanceKm, durationMin, trafficMultiplier, referenceId } = req.body;

            // اعتبارسنجی اولیه ورودی‌ها
            if (!serviceType || distanceKm === undefined || durationMin === undefined) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'پارامترهای serviceType, distanceKm و durationMin الزامی هستند.' 
                });
            }

            const inputData = {
                serviceType,
                distanceKm: Number(distanceKm),
                durationMin: Number(durationMin),
                trafficMultiplier: trafficMultiplier ? Number(trafficMultiplier) : 1.0,
                referenceId: referenceId || null
            };

            // فراخوانی Use Case
            const result = await this.generateQuoteUseCase.execute(inputData);

            return res.status(201).json({
                success: true,
                message: 'پیش‌فاکتور با موفقیت ایجاد شد.',
                data: result
            });

        } catch (error) {
            console.error('[PricingController] Error calculating quote:', error);
            
            // مدیریت خطاهای شناخته شده (مانند پیدا نشدن کانفیگ)
            if (error.message && error.message.includes('هیچ کانفیگ فعالی')) {
                return res.status(404).json({ success: false, error: error.message });
            }

            return res.status(500).json({ 
                success: false, 
                error: 'خطای داخلی سرور در محاسبه قیمت.' 
            });
        }
    }
}

module.exports = PricingController;