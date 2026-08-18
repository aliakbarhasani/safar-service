class Ad {
  constructor({
    id,
    campaignId,
    advertiserId,
    title,
    description,
    imageUrl,
    videoUrl,
    landingUrl,
    status = 'draft',
    adType = 'image',
    impressions = 0,
    clicks = 0,
    conversions = 0,
    createdAt,
    updatedAt,
  } = {}) {
    this.id = id;
    this.campaignId = campaignId;
    this.advertiserId = advertiserId;
    this.title = title;
    this.description = description;
    this.imageUrl = imageUrl;
    this.videoUrl = videoUrl;
    this.landingUrl = landingUrl;
    this.status = status;
    this.adType = adType;
    this.impressions = impressions;
    this.clicks = clicks;
    this.conversions = conversions;
    this.createdAt = createdAt || new Date();
    this.updatedAt = updatedAt || new Date();
  }

  isActive() {
    return this.status === 'active';
  }

  getClickThroughRate() {
    if (this.impressions === 0) return 0;
    return (this.clicks / this.impressions) * 100;
  }

  getConversionRate() {
    if (this.clicks === 0) return 0;
    return (this.conversions / this.clicks) * 100;
  }

  incrementImpression() {
    this.impressions += 1;
  }

  recordClick() {
    this.clicks += 1;
  }

  recordConversion() {
    this.conversions += 1;
  }
}

module.exports = Ad;
