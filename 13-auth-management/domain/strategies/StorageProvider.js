/**
 * StorageProvider - Strategy interface for file uploads
 * Supports multiple storage backends (local, S3, etc.)
 */
class StorageProvider {
  constructor(name) {
    this.name = name;
  }

  async upload(file, options = {}) {
    throw new Error('upload() must be implemented by subclass');
  }

  async delete(path) {
    throw new Error('delete() must be implemented by subclass');
  }

  async getSignedUrl(path, expiresIn = 3600) {
    throw new Error('getSignedUrl() must be implemented by subclass');
  }
}

module.exports = StorageProvider;