# MapToPoster - 地图海报生成器

从 OpenStreetMap 数据生成可自定义的街道地图海报 PNG 图片。

## 特性

- 🗺️ 使用 OpenStreetMap 数据（免费）
- ⚪ 统一主题色，所有元素使用相同基础色调
- 🔲 透明背景
- 🎨 Web 界面可视化配置
- 🖼️ 多种边框样式（无边框/单层/双层）
- 💧 河流/水域显示，支持透明度调节
- 🌳 绿地/公园显示，支持透明度调节
- ✨ 边缘渐隐过渡效果
- 📜 历史记录自动保存

## 安装

```bash
npm install
```

依赖：Node.js 16+，Sharp 图像处理库

## 使用方法

### 启动 Web 服务（推荐）

```bash
npm start
```

访问 http://localhost:3000 打开配置界面。

### 命令行生成

编辑 `config.json` 配置参数，然后运行：

```bash
npm run generate:osm
```

## Web 界面配置

### 位置信息
- 预设城市快速选择（北京、上海、广州等）
- 自定义位置名称
- 经纬度坐标

### 地图参数
- 缩放级别 (1-20)
- 输出图片尺寸（宽 x 高）
- 输出文件名

### 主题设置
- 主题色（颜色选择器）：统一设置道路、水域、绿地、建筑物等元素的基础颜色
- 各元素通过透明度区分层次

### 边框设置
- 无边框
- 单层边框（可调整宽度）
- 双层边框（外层宽度、间距、内层宽度）

### 河流/水域
- 显示/隐藏开关
- 透明度调节 (0-100%)
- 基于真实比例的多边形填充

### 绿地/公园
- 显示/隐藏开关
- 透明度调节 (0-100%)

### 边缘过渡
- 无：保持清晰边缘
- 渐隐：从边缘向中心渐变透明
- 过渡比例：调节渐隐宽度（1-50% 图片尺寸）

## 配置示例

```json
{
  "location": {
    "name": "我的家",
    "center": [116.407378, 40.047033],
    "zoom": 17,
    "width": 1600,
    "height": 1600
  },
  "style": {
    "themeColor": "#ffffff",
    "roadWidth": 2
  },
  "border": {
    "type": "double",
    "outerWidth": 4,
    "gap": 20,
    "innerWidth": 1
  },
  "water": {
    "show": true,
    "opacity": 40
  },
  "green": {
    "show": true,
    "opacity": 80
  },
  "fade": {
    "type": "gradient",
    "ratio": 15
  },
  "output": {
    "filename": "street-map.png"
  }
}
```

## 输出

生成的图片保存到 `static/` 目录，文件名包含时间戳，例如：`street-map_20260509_143052.png`。

## 技术特性

- **OSM 数据缓存**：相同坐标和缩放级别的数据会缓存到 `.cache/` 目录，避免重复请求
- **Web Mercator 投影**：正确处理地图长宽比，避免街道变形
- **Sharp 图像处理**：高效的 PNG 生成

## 获取坐标

1. 打开 [OpenStreetMap](https://www.openstreetmap.org)
2. 搜索目标位置
3. 右键点击地图，选择 "显示地址"
4. 复制经纬度坐标

或直接在使用 Web 界面时选择预设城市，再微调位置。

## 目录结构

```
mapposter/
├── public/           # Web 界面文件
│   ├── index.html    # 主页面
│   └── js/           # 前端脚本
├── static/           # 生成的图片目录
├── .cache/           # OSM 数据缓存
├── config.json       # 当前配置
└── server.js         # Web 服务
```
