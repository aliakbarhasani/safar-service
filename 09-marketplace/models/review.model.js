class Review {
  constructor({
    id,
    productId,
    userId,
    rating = 5,
    comment,
    verifiedPurchase = false,
    helpful = 0,
    status = 'approved',
    createdAt,
    updatedAt,
  } = {}) {
    this.id = id;
    this.productId = productId;
    this.userId = userId;
    this.rating = Math.min(5, Math.max(1, rating));
    this.comment = comment;
    this.verifiedPurchase = verifiedPurchase;
    this.helpful = helpful;
    this.status = status;
    this.createdAt = createdAt || new Date();
    this.updatedAt = updatedAt || new Date();
  }

  isVerifiedPurchase() {
    return this.verifiedPurchase;
  }

  isApproved() {
    return this.status === 'approved';
  }
}

module.exports = Review;
