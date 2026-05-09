// 主应用入口
document.addEventListener('DOMContentLoaded', function() {
  // 初始化各模块
  UI.init();
  Preview.init();

  // 加载配置
  UI.loadConfig();

  // 加载历史记录（会自动设置默认预览）
  Gallery.load();
});
