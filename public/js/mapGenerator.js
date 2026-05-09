// 地图生成模块
const MapGenerator = {
  async generate() {
    const btn = document.getElementById('generateBtn');
    const logOutput = document.getElementById('logOutput');
    const messageBox = document.getElementById('messageBox');

    const config = this.buildConfig();

    // 保存配置
    const saveResult = await Config.save(config);
    if (saveResult.error) {
      this.showError('保存配置失败: ' + saveResult.error);
      return;
    }

    this.setLoadingState(btn, logOutput, messageBox);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      const result = await res.json();

      if (result.success) {
        this.handleSuccess(result, logOutput, messageBox, btn);
      } else {
        this.handleError(result, logOutput, messageBox, btn);
      }
    } catch (e) {
      this.handleNetworkError(e, logOutput, messageBox, btn);
    }
  },

  buildConfig() {
    const borderType = document.getElementById('borderType').value;

    return {
      location: {
        name: document.getElementById('locationName').value || 'unnamed',
        center: [
          parseFloat(document.getElementById('lon').value) || 116.407378,
          parseFloat(document.getElementById('lat').value) || 40.047033
        ],
        zoom: parseFloat(document.getElementById('zoom').value) || 17,
        width: parseInt(document.getElementById('width').value) || 1600,
        height: parseInt(document.getElementById('height').value) || 1600
      },
      style: {
        themeColor: document.getElementById('themeColor').value,
        roadWidth: 2,
        background: 'transparent',
        showLabels: false,
        showBuildings: false,
        showPois: false
      },
      border: {
        type: borderType,
        width: parseInt(document.getElementById('borderWidth').value) || 4,
        outerWidth: parseInt(document.getElementById('outerWidth').value) || 4,
        gap: parseInt(document.getElementById('borderGap').value) || 20,
        innerWidth: parseInt(document.getElementById('innerWidth').value) || 1
      },
      water: {
        show: document.getElementById('showWater').checked,
        opacity: parseInt(document.getElementById('waterOpacity').value) || 40
      },
      green: {
        show: document.getElementById('showGreen').checked,
        opacity: parseInt(document.getElementById('greenOpacity').value) || 80
      },
      building: {
        show: document.getElementById('showBuilding').checked,
        opacity: parseInt(document.getElementById('buildingOpacity').value) || 60,
        range: parseInt(document.getElementById('buildingRange').value) || 80
      },
      output: {
        filename: document.getElementById('filename').value || 'street-map.png',
        format: 'png'
      },
      fade: {
        type: document.getElementById('fadeType').value || 'gradient',
        ratio: parseInt(document.getElementById('fadeRatio').value) || 15
      },
      provider: 'osm'
    };
  },

  setLoadingState(btn, logOutput, messageBox) {
    btn.disabled = true;
    btn.innerHTML = '<div class="loading"><div class="spinner"></div>生成中...</div>';
    logOutput.style.display = 'block';
    logOutput.textContent = '正在生成地图...\n';
    messageBox.className = 'message';
    messageBox.style.display = 'none';
  },

  handleSuccess(result, logOutput, messageBox, btn) {
    logOutput.textContent = result.output;
    messageBox.textContent = '地图生成成功！';
    messageBox.className = 'message success';

    if (result.filename) {
      Preview.showGenerated(result.filename);
    }

    Gallery.load();
    this.resetButton(btn);
  },

  handleError(result, logOutput, messageBox, btn) {
    logOutput.textContent = result.output + '\n错误: ' + result.error;
    messageBox.textContent = result.error || '生成失败';
    messageBox.className = 'message error';
    this.resetButton(btn);
  },

  handleNetworkError(e, logOutput, messageBox, btn) {
    logOutput.textContent += '\n错误: ' + e.message;
    messageBox.textContent = '网络请求失败: ' + e.message;
    messageBox.className = 'message error';
    this.resetButton(btn);
  },

  resetButton(btn) {
    btn.disabled = false;
    btn.textContent = '生成地图';
  },

  showError(msg) {
    const messageBox = document.getElementById('messageBox');
    messageBox.textContent = msg;
    messageBox.className = 'message error';
    messageBox.style.display = 'block';
    setTimeout(() => messageBox.style.display = 'none', 5000);
  }
};

// 全局生成函数供HTML调用
function generateMap() {
  MapGenerator.generate();
}
