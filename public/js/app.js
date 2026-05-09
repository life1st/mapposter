// 主应用入口
document.addEventListener('DOMContentLoaded', function() {
  // 初始化各模块
  UI.init();
  Preview.init();

  // 加载配置和图库
  UI.loadConfig();
  Gallery.load();
});
