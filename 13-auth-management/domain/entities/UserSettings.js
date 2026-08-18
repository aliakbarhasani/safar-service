class UserSettings {
  constructor(data = {}) {
    this.userId = data.userId || null;
    this.language = data.language || 'fa';
    this.currency = data.currency || 'IRR';
    this.country = data.country || 'IR';
    this.timezone = data.timezone || 'Asia/Tehran';
    this.notificationsEnabled = data.notificationsEnabled !== undefined ? data.notificationsEnabled : true;
  }

  validate() {
    const allowedLanguages = ['fa', 'en', 'ar'];
    const allowedCurrencies = ['IRR', 'USD', 'EUR'];
    const allowedCountries = ['IR', 'US', 'AE', 'TR'];

    if (this.language && !allowedLanguages.includes(this.language)) {
      throw new Error(`Invalid language. Allowed: ${allowedLanguages.join(', ')}`);
    }
    if (this.currency && !allowedCurrencies.includes(this.currency)) {
      throw new Error(`Invalid currency. Allowed: ${allowedCurrencies.join(', ')}`);
    }
    if (this.country && !allowedCountries.includes(this.country)) {
      throw new Error(`Invalid country. Allowed: ${allowedCountries.join(', ')}`);
    }
    return true;
  }
}

module.exports = UserSettings;