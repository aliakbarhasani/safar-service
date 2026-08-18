class Campaign {
  constructor({
    id,
    advertiserId,
    name,
    description,
    budget,
    spent = 0,
    startDate,
    endDate,
    targetingCriteria,
    status = 'draft',
    impressions = 0,
    clicks = 0,
    conversions = 0,
    createdAt,
    updatedAt,
  } = {}) {
    this.id = id;
    this.advertiserId = advertiserId;
    this.name = name;
    this.description = description;
    this.budget = budget;
    this.spent = spent;
    this.startDate = startDate;
    this.endDate = endDate;
    this.targetingCriteria = targetingCriteria || {};
    this.status = status;
    this.impressions = impressions;
    this.clicks = clicks;
    this.conversions = conversions;
    this.createdAt = createdAt || new Date();
    this.updatedAt = updatedAt || new Date();
  }

  isActive() {
    return this.status === 'active';
  }

  isBudgetExhausted() {
    return this.spent >= this.budget;
  }

  getRemainingBudget() {
    return this.budget - this.spent;
  }

  getROI() {
    if (this.spent === 0) return 0;
    return ((this.conversions * 100) / this.spent).toFixed(2);
  }

  getCPC() {
    if (this.clicks === 0) return 0;
    return (this.spent / this.clicks).toFixed(2);
  }

  getCPM() {
    if (this.impressions === 0) return 0;
    return ((this.spent / this.impressions) * 1000).toFixed(2);
  }
}

module.exports = Campaign;
