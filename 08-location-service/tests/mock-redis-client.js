/**
 * mock-redis-client.js - کلاینت Redis ماک شده برای تست (P3-1)
 *
 * پیاده‌سازی مینیمال geoadd/geosearch/georadius/zrem/geopos با حافظه داخلی.
 * از Haversine برای محاسبه فاصله و مرتب‌سازی ASC استفاده می‌کند.
 */

function createMockRedisClient() {
  const geo = new Map();

  function ensure(key) {
    if (!geo.has(key)) geo.set(key, new Map());
    return geo.get(key);
  }

  function haversine(lng1, lat1, lng2, lat2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  return {
    _geo: geo,
    async geoadd(key, lng, lat, member) {
      const m = String(member);
      const store = ensure(key);
      const isNew = !store.has(m);
      store.set(m, { lng: Number(lng), lat: Number(lat) });
      return isNew ? 1 : 0;
    },
    async geosearch(key, ...args) {
      const store = ensure(key);
      let centerLng, centerLat, radiusKm;
      for (let i = 0; i < args.length; i++) {
        if (args[i] === 'FROMLONLAT') { centerLng = Number(args[i + 1]); centerLat = Number(args[i + 2]); }
        if (args[i] === 'BYRADIUS') { radiusKm = Number(args[i + 1]); }
      }
      const results = [];
      for (const [member, pos] of store.entries()) {
        const dist = haversine(centerLng, centerLat, pos.lng, pos.lat);
        if (dist <= radiusKm) {
          results.push([member, String(dist), [String(pos.lng), String(pos.lat)]]);
        }
      }
      results.sort((a, b) => parseFloat(a[1]) - parseFloat(b[1]));
      return results;
    },
    async georadius(key, lng, lat, radius, unit) {
      const store = ensure(key);
      const results = [];
      for (const [member, pos] of store.entries()) {
        const dist = haversine(lng, lat, pos.lng, pos.lat);
        if (dist <= radius) {
          results.push([member, String(dist), [String(pos.lng), String(pos.lat)]]);
        }
      }
      results.sort((a, b) => parseFloat(a[1]) - parseFloat(b[1]));
      return results;
    },
    async zrem(key, member) {
      const store = ensure(key);
      return store.delete(String(member)) ? 1 : 0;
    },
    async geopos(key, member) {
      const store = ensure(key);
      const pos = store.get(String(member));
      return pos ? [[String(pos.lng), String(pos.lat)]] : [null];
    },
  };
}

module.exports = { createMockRedisClient };
