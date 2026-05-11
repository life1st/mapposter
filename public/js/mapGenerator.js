// 地图生成模块
const MapGenerator = {
  isGenerating: false,
  abortController: null,

  // 检查是否有运行中的任务
  async checkStatus() {
    try {
      const response = await fetch('/api/generate/status');
      const status = await response.json();

      if (status.running) {
        const btn = document.getElementById('generateBtn');
        const logOutput = document.getElementById('logOutput');
        const messageBox = document.getElementById('messageBox');

        this.setLoadingState(btn, logOutput, messageBox, true);

        // 恢复历史日志
        const output = [];
        status.recentLogs.forEach(log => {
          const lineClass = this.getLineClass(log.line);
          output.push(`<div class="log-line ${lineClass}">${this.escapeHtml(log.line)}</div>`);
        });
        logOutput.innerHTML = output.join('');
        logOutput.scrollTop = logOutput.scrollHeight;

        // 连接到运行中的任务
        this.streamGenerate(null, btn, logOutput, messageBox, true);
      }
    } catch (e) {
      console.error('检查状态失败:', e);
    }
  },

  stop() {
    fetch('/api/generate/stop', { method: 'POST' })
      .then(r => r.json())
      .then(result => {
        console.log('停止结果:', result);
      });
  },

  generate() {
    const btn = document.getElementById('generateBtn');
    const logOutput = document.getElementById('logOutput');
    const messageBox = document.getElementById('messageBox');

    const config = this.buildConfig();

    // 保存配置
    Config.save(config).then(saveResult => {
      if (saveResult.error) {
        this.showError('保存配置失败: ' + saveResult.error);
        return;
      }

      this.setLoadingState(btn, logOutput, messageBox);
      this.streamGenerate(config, btn, logOutput, messageBox);
    });
  },

  async streamGenerate(config, btn, logOutput, messageBox, joinExisting = false) {
    this.isGenerating = true;
    const output = [];

    if (!joinExisting) {
      output.push(`<div class="log-line">正在连接服务器...</div>`);
      logOutput.innerHTML = output.join('');
    }

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config || this.buildConfig())
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`服务器错误: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('浏览器不支持流式响应');
      }

      if (!joinExisting) {
        output.push(`<div class="log-line success">连接成功，开始生成...</div>`);
        logOutput.innerHTML = output.join('');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let hasReceivedData = false;

      while (this.isGenerating) {
        const { done, value } = await reader.read();

        if (value) {
          hasReceivedData = true;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'progress') {
                  const lineClass = this.getLineClass(data.line);
                  output.push(`<div class="log-line ${lineClass}">${this.escapeHtml(data.line)}</div>`);
                  logOutput.innerHTML = output.join('');
                  logOutput.scrollTop = logOutput.scrollHeight;
                } else if (data.type === 'error') {
                  output.push(`<div class="log-line error">${this.escapeHtml(data.message || data.line || '未知错误')}</div>`);
                  logOutput.innerHTML = output.join('');
                  logOutput.scrollTop = logOutput.scrollHeight;
                } else if (data.type === 'complete') {
                  this.isGenerating = false;
                  if (data.success) {
                    this.handleSuccess(data, logOutput, messageBox, btn);
                  } else {
                    this.handleError(data, logOutput, messageBox, btn);
                  }
                  return;
                }
              } catch (e) {
                console.error('解析SSE数据失败:', e, line);
                const rawData = line.slice(6);
                if (rawData.trim()) {
                  output.push(`<div class="log-line">${this.escapeHtml(rawData.substring(0, 200))}</div>`);
                  logOutput.innerHTML = output.join('');
                  logOutput.scrollTop = logOutput.scrollHeight;
                }
              }
            }
          }
        }

        if (done) break;
      }

      if (!hasReceivedData) {
        throw new Error('服务器未返回数据');
      }

      // 处理剩余缓冲区
      if (buffer.trim()) {
        const line = buffer.trim();
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'complete') {
              this.isGenerating = false;
              if (data.success) {
                this.handleSuccess(data, logOutput, messageBox, btn);
              } else {
                this.handleError(data, logOutput, messageBox, btn);
              }
            }
          } catch (e) {
            console.error('解析最终SSE数据失败:', e);
          }
        }
      }

    } catch (e) {
      console.error('生成失败:', e);
      this.isGenerating = false;
      if (!e.message?.includes('aborted')) {
        output.push(`<div class="log-line error">错误: ${this.escapeHtml(e.message)}</div>`);
        logOutput.innerHTML = output.join('');
        this.handleNetworkError(e, logOutput, messageBox, btn);
      }
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
        height: parseInt(document.getElementById('height').value) || 1600,
        boundaryShape: document.getElementById('boundaryShape')?.value || 'bbox'
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
      railway: {
        show: document.getElementById('showRailway').checked,
        lineWidth: parseFloat(document.getElementById('railwayLineWidth').value) || 2,
        tieSpacing: parseFloat(document.getElementById('railwayTieSpacing').value) || 15,
        tieLength: parseFloat(document.getElementById('railwayTieLength').value) || 1.6
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

  setLoadingState(btn, logOutput, messageBox, showStop = false) {
    btn.disabled = true;
    btn.className = 'btn btn-primary btn-generate-wrapper';
    btn.innerHTML = '<span class="btn-text"><div class="spinner"></div>生成中...</span><span class="stop-btn" onclick="MapGenerator.stop(); event.stopPropagation();" title="停止生成"></span>';
    logOutput.style.display = 'block';
    if (!showStop) {
      logOutput.innerHTML = '<div class="log-line">正在生成地图...</div>';
    }
    messageBox.className = 'message';
    messageBox.style.display = 'none';
  },

  handleSuccess(result, logOutput, messageBox, btn) {
    messageBox.textContent = '地图生成成功！';
    messageBox.className = 'message success';
    messageBox.style.display = 'block';

    // 切换到编辑 tab 并显示生成的图片
    switchTab('edit');

    if (result.filename) {
      Preview.showGenerated(result.filename);
    }

    Gallery.load();
    this.resetButton(btn);
  },

  handleError(result, logOutput, messageBox, btn) {
    if (result.error) {
      const errorDiv = `<div class="log-line error">错误: ${this.escapeHtml(result.error)}</div>`;
      logOutput.innerHTML += errorDiv;
    }
    messageBox.textContent = result.error || '生成失败';
    messageBox.className = 'message error';
    messageBox.style.display = 'block';
    this.resetButton(btn);
  },

  handleNetworkError(e, logOutput, messageBox, btn) {
    const errorDiv = `<div class="log-line error">网络错误: ${this.escapeHtml(e.message)}</div>`;
    logOutput.innerHTML += errorDiv;
    messageBox.textContent = '网络请求失败: ' + e.message;
    messageBox.className = 'message error';
    messageBox.style.display = 'block';
    this.resetButton(btn);
  },

  resetButton(btn) {
    btn.disabled = false;
    btn.className = 'btn btn-primary';
    btn.innerHTML = '生成地图';
  },

  showError(msg) {
    const messageBox = document.getElementById('messageBox');
    messageBox.textContent = msg;
    messageBox.className = 'message error';
    messageBox.style.display = 'block';
    setTimeout(() => messageBox.style.display = 'none', 5000);
  },

  getLineClass(line) {
    if (line.includes('✅') || line.includes('✓')) return 'success';
    if (line.includes('❌') || line.includes('✗') || line.includes('错误')) return 'error';
    return '';
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// 全局生成函数供HTML调用
function generateMap() {
  MapGenerator.generate();
}
