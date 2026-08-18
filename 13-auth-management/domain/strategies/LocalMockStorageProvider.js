const StorageProvider = require('./StorageProvider');
const fs = require('fs');
const path = require('path');

class LocalMockStorageProvider extends StorageProvider {
  constructor(options = {}) {
    super('local-mock');
    this.uploadDir = options.uploadDir || path.resolve(process.cwd(), 'uploads');
    this.baseUrl = options.baseUrl || 'http://localhost:3000/uploads';
    this._ensureDirExists();
  }

  _ensureDirExists() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async upload(file, options = {}) {
    this._ensureDirExists();
    const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${file.originalName || 'file'}`;
    const filePath = path.join(this.uploadDir, fileName);
    const fileContent = file.buffer || Buffer.from(file.content || '');
    
    fs.writeFileSync(filePath, fileContent);
    
    return {
      path: filePath,
      url: `${this.baseUrl}/${fileName}`,
      fileName,
      size: fileContent.length,
      provider: this.name,
    };
  }

  async delete(filePath) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  }

  async getSignedUrl(filePath, expiresIn = 3600) {
    return {
      url: `${this.baseUrl}/${path.basename(filePath)}`,
      expiresIn,
    };
  }
}

module.exports = LocalMockStorageProvider;