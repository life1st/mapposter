// 禁止 number input 响应滚轮
document.addEventListener('wheel', function(e) {
  if (document.activeElement && document.activeElement.type === 'number') {
    document.activeElement.blur();
  }
}, { passive: false });

// 主应用入口
document.addEventListener('DOMContentLoaded', function() {
  // 初始化各模块
  UI.init();
  Preview.init();

  // 加载配置
  UI.loadConfig();

  // 加载历史记录（会自动设置默认预览）
  Gallery.load();

  // 渲染坐标历史记录
  renderLocationHistory();

  // 检查是否有运行中的生成任务
  MapGenerator.checkStatus();
});
