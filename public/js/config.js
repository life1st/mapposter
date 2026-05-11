// 配置模块
const Config = {
  presets: {
    beijing: { name: '北京天安门', center: [116.397428, 39.90923] },
    shanghai: { name: '上海外滩', center: [121.490317, 31.239703] },
    guangzhou: { name: '广州塔', center: [113.3245, 23.1065] },
    shenzhen: { name: '深圳市民中心', center: [114.057868, 22.543099] },
    hangzhou: { name: '杭州西湖', center: [120.15507, 30.274085] },
    chengdu: { name: '成都天府广场', center: [104.066541, 30.659462] }
  },

  async load() {
    try {
      const res = await fetch('/api/config');
      return await res.json();
    } catch (e) {
      console.error('加载配置失败:', e);
      return null;
    }
  },

  async save(config) {
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      return await res.json();
    } catch (e) {
      console.error('保存配置失败:', e);
      return { error: e.message };
    }
  },

  getDefault() {
    return {
      location: {
        name: 'my-location',
        center: [116.407378, 40.047033],
        zoom: 17,
        width: 1600,
        height: 1600,
        boundaryShape: 'bbox'
      },
      style: {
        themeColor: '#ffffff',
        roadWidth: 2,
        background: 'transparent',
        showLabels: false,
        showBuildings: false,
        showPois: false
      },
      border: {
        type: 'single',
        width: 4,
        outerWidth: 4,
        gap: 20,
        innerWidth: 1
      },
      water: { show: true, opacity: 40 },
      green: { show: true, opacity: 80 },
      building: { show: true, opacity: 60, range: 80 },
      railway: { show: true, widthMultiplier: 0.75, tieSpacing: 15, tieLength: 1.6 },
      fade: { type: 'gradient', ratio: 15 },
      output: { filename: 'street-map.png', format: 'png' },
      provider: 'osm'
    };
  }
};

// 颜色工具
const ColorUtils = {
  normalize(color) {
    if (!color) return '#ffffff';
    return color.toLowerCase();
  }
};

// 坐标历史记录管理（使用 localStorage）
const LocationHistory = {
  STORAGE_KEY: 'mapposter_location_history',
  MAX_ITEMS: 20,
  DEFAULT_DISPLAY: 5,

  load() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('加载坐标历史失败:', e);
      return [];
    }
  },

  save(history) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(history.slice(0, this.MAX_ITEMS)));
    } catch (e) {
      console.error('保存坐标历史失败:', e);
    }
  },

  add(lon, lat, name) {
    const history = this.load();
    const newItem = {
      lon: parseFloat(lon),
      lat: parseFloat(lat),
      name: name || '',
      time: Date.now()
    };

    // 去重：如果已有相同坐标，先删除旧的
    const filtered = history.filter(item =>
      !(Math.abs(item.lon - newItem.lon) < 0.0001 && Math.abs(item.lat - newItem.lat) < 0.0001)
    );

    // 添加到开头
    filtered.unshift(newItem);

    // 保存（只保留前5条）
    this.save(filtered);
    return filtered.slice(0, this.MAX_ITEMS);
  },

  remove(index) {
    const history = this.load();
    history.splice(index, 1);
    this.save(history);
    return history;
  },

  updateName(index, name) {
    const history = this.load();
    if (history[index]) {
      history[index].name = name;
      this.save(history);
    }
    return history;
  }
};
