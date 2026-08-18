class Product {
  constructor({
    id,
    sellerId,
    name,
    description,
    categoryId,
    price,
    currency = 'AFN',
    quantity,
    imageUrl,
    rating = 0,
    reviewCount = 0,
    status = 'active',
    createdAt,
    updatedAt,
  } = {}) {
    this.id = id;
    this.sellerId = sellerId;
    this.name = name;
    this.description = description;
    this.categoryId = categoryId;
    this.price = price;
    this.currency = currency;
    this.quantity = quantity;
    this.imageUrl = imageUrl;
    this.rating = rating;
    this.reviewCount = reviewCount;
    this.status = status;
    this.createdAt = createdAt || new Date();
    this.updatedAt = updatedAt || new Date();
  }

  isInStock() {
    return this.quantity > 0 && this.status === 'active';
  }

  canBePurchased() {
    return this.isInStock();
  }

  decreaseQuantity(amount = 1) {
    if (this.quantity >= amount) {
      this.quantity -= amount;
      return true;
    }
    return false;
  }
}

module.exports = Product;
