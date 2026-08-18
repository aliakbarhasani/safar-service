class Seller {
  constructor({
    id,
    userId,
    storeName,
    description,
    category,
    rating = 0,
    reviewCount = 0,
    totalSales = 0,
    logoUrl,
    coverUrl,
    phone,
    email,
    address,
    status = 'pending',
    verificationStatus = 'unverified',
    createdAt,
    updatedAt,
  } = {}) {
    this.id = id;
    this.userId = userId;
    this.storeName = storeName;
    this.description = description;
    this.category = category;
    this.rating = rating;
    this.reviewCount = reviewCount;
    this.totalSales = totalSales;
    this.logoUrl = logoUrl;
    this.coverUrl = coverUrl;
    this.phone = phone;
    this.email = email;
    this.address = address;
    this.status = status;
    this.verificationStatus = verificationStatus;
    this.createdAt = createdAt || new Date();
    this.updatedAt = updatedAt || new Date();
  }

  isActive() {
    return this.status === 'active' && this.verificationStatus === 'verified';
  }

  isVerified() {
    return this.verificationStatus === 'verified';
  }

  getAverageRating() {
    return this.rating;
  }
}

module.exports = Seller;
