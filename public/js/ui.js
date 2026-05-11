// UI模块 - 处理界面交互
const UI = {
  init() {
    this.bindEvents();
    this.initBorderTypeChange();
    this.initFadeTypeChange();
    return this;
  },

  initFadeTypeChange() {
    this.handleFadeTypeChange();
  },

  handleFadeTypeChange() {
    const type = document.getElementById('fadeType').value;
    const fadeRatioRow = document.getElementById('fadeRatioRow');

    if (type === 'none') {
      fadeRatioRow.style.display = 'none';
    } else {
      fadeRatioRow.style.display = 'block';
    }
  },

  bindEvents() {
    // 主题色选择器实时预览
    const themeColor = document.getElementById('themeColor');
    if (themeColor) {
      themeColor.addEventListener('input', () => this.updateColorPreview());
    }

    // 边框类型切换
    const borderType = document.getElementById('borderType');
    if (borderType) {
      borderType.addEventListener('change', () => this.handleBorderTypeChange());
    }

    // 过渡类型切换
    const fadeType = document.getElementById('fadeType');
    if (fadeType) {
      fadeType.addEventListener('change', () => this.handleFadeTypeChange());
    }
  },

  initBorderTypeChange() {
    this.handleBorderTypeChange();
  },

  handleBorderTypeChange() {
    const type = document.getElementById('borderType').value;
    const doubleRow = document.getElementById('doubleBorderRow');
    const borderWidthRow = document.getElementById('borderWidthRow');

    if (type === 'double') {
      doubleRow.style.display = 'grid';
      borderWidthRow.style.display = 'none';
    } else if (type === 'single') {
      doubleRow.style.display = 'none';
      borderWidthRow.style.display = 'grid';
    } else {
      doubleRow.style.display = 'none';
      borderWidthRow.style.display = 'none';
    }
  },

  updateColorPreview() {
    const color = document.getElementById('themeColor').value;
    const preview = document.getElementById('colorPreview');
    if (preview) {
      preview.style.backgroundColor = color;
    }
  },

  setPreset(city) {
    const preset = Config.presets[city];
    if (preset) {
      document.getElementById('locationName').value = preset.name;
      document.getElementById('lon').value = preset.center[0];
      document.getElementById('lat').value = preset.center[1];
    }
  },

  async loadConfigObject(config) {
    if (!config) return;
    this._applyConfig(config);
  },

  async loadConfig() {
    const config = await Config.load();
    if (!config) return;
    this._applyConfig(config);
  },

  _applyConfig(config) {

    // 位置信息
    document.getElementById('locationName').value = config.location.name || '';
    document.getElementById('lon').value = config.location.center[0];
    document.getElementById('lat').value = config.location.center[1];
    document.getElementById('zoom').value = config.location.zoom;
    document.getElementById('width').value = config.location.width;
    document.getElementById('height').value = config.location.height;

    // 边界形状
    const boundaryShapeSelect = document.getElementById('boundaryShape');
    if (boundaryShapeSelect && config.location.boundaryShape) {
      boundaryShapeSelect.value = config.location.boundaryShape;
    }

    // 主题色（兼容旧配置的roadColor）
    const themeColor = config.style.themeColor || config.style.roadColor || '#ffffff';
    document.getElementById('themeColor').value = ColorUtils.normalize(themeColor);

    // 输出
    document.getElementById('filename').value = config.output.filename;

    // 边框设置
    if (config.border) {
      document.getElementById('borderType').value = config.border.type || 'single';
      document.getElementById('borderWidth').value = config.border.width || 4;
      document.getElementById('outerWidth').value = config.border.outerWidth || 4;
      document.getElementById('borderGap').value = config.border.gap || 20;
      document.getElementById('innerWidth').value = config.border.innerWidth || 1;
    }

    // 河流设置
    if (config.water) {
      document.getElementById('showWater').checked = config.water.show !== false;
      document.getElementById('waterOpacity').value = config.water.opacity || 40;
    }

    // 绿地设置
    if (config.green) {
      document.getElementById('showGreen').checked = config.green.show !== false;
      document.getElementById('greenOpacity').value = config.green.opacity || 80;
    }

    // 建筑物设置
    if (config.building) {
      document.getElementById('showBuilding').checked = config.building.show !== false;
      document.getElementById('buildingOpacity').value = config.building.opacity || 60;
      document.getElementById('buildingRange').value = config.building.range || 80;
    }

    if (config.railway) {
      document.getElementById('showRailway').checked = config.railway.show !== false;
      document.getElementById('railwayLineWidth').value = config.railway.lineWidth ?? 2;
      document.getElementById('railwayTieSpacing').value = config.railway.tieSpacing ?? 6;
      document.getElementById('railwayTieLength').value = config.railway.tieLength ?? 0.6;
    }

    // 边缘过渡
    if (config.fade) {
      document.getElementById('fadeType').value = config.fade.type || 'gradient';
      document.getElementById('fadeRatio').value = config.fade.ratio || 15;
    }

    this.updateColorPreview();
    this.handleBorderTypeChange();
    this.handleFadeTypeChange();
  },

  resetConfig() {
    const defaults = Config.getDefault();

    document.getElementById('locationName').value = defaults.location.name;
    document.getElementById('lon').value = defaults.location.center[0];
    document.getElementById('lat').value = defaults.location.center[1];
    document.getElementById('zoom').value = defaults.location.zoom;
    document.getElementById('width').value = defaults.location.width;
    document.getElementById('height').value = defaults.location.height;

    const boundaryShapeSelect = document.getElementById('boundaryShape');
    if (boundaryShapeSelect) {
      boundaryShapeSelect.value = defaults.location.boundaryShape || 'bbox';
    }

    document.getElementById('themeColor').value = defaults.style.themeColor;
    document.getElementById('filename').value = defaults.output.filename;
    document.getElementById('borderType').value = defaults.border.type;
    document.getElementById('borderWidth').value = defaults.border.width;
    document.getElementById('outerWidth').value = defaults.border.outerWidth;
    document.getElementById('borderGap').value = defaults.border.gap;
    document.getElementById('innerWidth').value = defaults.border.innerWidth;
    document.getElementById('showWater').checked = defaults.water.show;
    document.getElementById('waterOpacity').value = defaults.water.opacity;
    document.getElementById('showGreen').checked = defaults.green.show;
    document.getElementById('greenOpacity').value = defaults.green.opacity;
    document.getElementById('showBuilding').checked = defaults.building.show;
    document.getElementById('buildingOpacity').value = defaults.building.opacity;
    document.getElementById('buildingRange').value = defaults.building.range;
    document.getElementById('showRailway').checked = defaults.railway.show;
    document.getElementById('railwayLineWidth').value = defaults.railway.lineWidth;
    document.getElementById('railwayTieSpacing').value = defaults.railway.tieSpacing;
    document.getElementById('railwayTieLength').value = defaults.railway.tieLength;
    document.getElementById('fadeType').value = defaults.fade.type;
    document.getElementById('fadeRatio').value = defaults.fade.ratio;

    this.updateColorPreview();
    this.handleBorderTypeChange();
    this.handleFadeTypeChange();
  }
};

// 全局函数供HTML调用
function setPreset(city) {
  UI.setPreset(city);
}

function resetConfig() {
  UI.resetConfig();
}

function zoomIn() {
  Preview.zoomIn();
}

function zoomOut() {
  Preview.zoomOut();
}

function resetZoom() {
  Preview.reset();
}

function togglePreviewTheme() {
  Preview.toggleTheme();
}

// 当前激活的 tab
let currentTab = 'edit';

// 地图 Modal 相关
let mapInstance = null;
let mapMarker = null;
let selectedLat = null;
let selectedLon = null;

function openMapModal() {
  const modal = document.getElementById('mapModal');
  modal.style.display = 'flex';

  // 延迟初始化地图，确保容器可见
  setTimeout(() => {
    initMap();
  }, 100);
}

function closeMapModal() {
  const modal = document.getElementById('mapModal');
  modal.style.display = 'none';
}

function initMap() {
  const container = document.getElementById('mapContainer');
  if (!container) return;

  // 获取当前输入的坐标，或使用默认值
  const currentLon = parseFloat(document.getElementById('lon').value) || 116.407378;
  const currentLat = parseFloat(document.getElementById('lat').value) || 40.047033;

  selectedLat = currentLat;
  selectedLon = currentLon;

  // 如果地图已存在，只需更新视图
  if (mapInstance) {
    mapInstance.setView([currentLat, currentLon], 15);
    mapMarker.setLatLng([currentLat, currentLon]);
    updateCoordsDisplay();
    return;
  }

  // 创建地图实例
  mapInstance = L.map('mapContainer').setView([currentLat, currentLon], 15);

  // 添加 OpenStreetMap 图层
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(mapInstance);

  // 添加标记
  mapMarker = L.marker([currentLat, currentLon], { draggable: true }).addTo(mapInstance);

  // 标记拖动事件
  mapMarker.on('dragend', function(e) {
    const latLng = e.target.getLatLng();
    selectedLat = latLng.lat;
    selectedLon = latLng.lng;
    updateCoordsDisplay();
  });

  // 地图点击事件
  mapInstance.on('click', function(e) {
    selectedLat = e.latlng.lat;
    selectedLon = e.latlng.lng;
    mapMarker.setLatLng([selectedLat, selectedLon]);
    updateCoordsDisplay();
  });

  updateCoordsDisplay();
}

function updateCoordsDisplay() {
  const coordsEl = document.getElementById('selectedCoords');
  if (coordsEl && selectedLat && selectedLon) {
    coordsEl.textContent = `${selectedLat.toFixed(6)}, ${selectedLon.toFixed(6)}`;
  }
}

function confirmMapSelection() {
  if (selectedLat && selectedLon) {
    document.getElementById('lat').value = selectedLat.toFixed(6);
    document.getElementById('lon').value = selectedLon.toFixed(6);
    saveCurrentLocation();
  }
  closeMapModal();
}

// 坐标历史记录管理
function saveCurrentLocation() {
  const lon = document.getElementById('lon').value;
  const lat = document.getElementById('lat').value;
  const name = document.getElementById('locationName').value;

  if (!lon || !lat) {
    return;
  }

  LocationHistory.add(lon, lat, name);
  renderLocationHistory();
}

function renderLocationHistory(expanded = false) {
  const container = document.getElementById('historyList');
  if (!container) return;

  const history = LocationHistory.load();

  if (history.length === 0) {
    container.innerHTML = '<div class="history-empty">暂无历史记录</div>';
    return;
  }

  const limit = expanded ? history.length : LocationHistory.DEFAULT_DISPLAY;
  const displayed = history.slice(0, limit);
  const remaining = history.length - limit;

  let html = displayed.map((item, index) => `
    <div class="history-item" onclick="applyLocationHistory(${index})">
      <span class="history-item-coords">${item.lon.toFixed(4)}, ${item.lat.toFixed(4)}</span>
      <input type="text"
             class="history-item-name"
             placeholder="添加备注..."
             value="${item.name || ''}"
             onclick="event.stopPropagation()"
             onchange="updateLocationName(${index}, this.value)">
      <button class="history-item-delete"
              onclick="event.stopPropagation(); deleteLocationHistory(${index})"
              title="删除">&times;</button>
    </div>
  `).join('');

  if (remaining > 0) {
    html += `<div class="history-show-more" onclick="renderLocationHistory(true)">查看剩下 ${remaining} 条</div>`;
  }

  container.innerHTML = html;
}

function applyLocationHistory(index) {
  const history = LocationHistory.load();
  const item = history[index];
  if (item) {
    document.getElementById('lon').value = item.lon.toFixed(6);
    document.getElementById('lat').value = item.lat.toFixed(6);
    if (item.name) {
      document.getElementById('locationName').value = item.name;
    }
  }
}

function updateLocationName(index, name) {
  LocationHistory.updateName(index, name);
}

function deleteLocationHistory(index) {
  LocationHistory.remove(index);
  renderLocationHistory();
}

// 切换 tab
function switchTab(tab) {
  currentTab = tab;

  // 更新 tab 按钮状态
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  // 更新面板显示
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === tab + 'Tab');
  });

  // 根据 tab 更新预览区域
  if (tab === 'history') {
    // 切换到历史记录时，显示第一张图或提示
    Gallery.showFirstImage();
  } else {
    // 切换到编辑时，显示最后生成的图或提示
    Gallery.showLatestOrPlaceholder();
  }
}
