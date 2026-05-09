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

  async loadConfig() {
    const config = await Config.load();
    if (!config) return;

    // 位置信息
    document.getElementById('locationName').value = config.location.name || '';
    document.getElementById('lon').value = config.location.center[0];
    document.getElementById('lat').value = config.location.center[1];
    document.getElementById('zoom').value = config.location.zoom;
    document.getElementById('width').value = config.location.width;
    document.getElementById('height').value = config.location.height;

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
