# MapToPoster

生成街道地图 PNG 图片，道路为白色线，背景透明。

## 特性

- 🗺️ 使用 OpenStreetMap 数据（免费）或 Mapbox（需要 token）
- ⚪ 白色道路线条
- 🔲 透明背景
- ⚙️ 可配置的坐标、缩放级别和尺寸

## 安装

```bash
npm install
```

## 配置

编辑 `config.json`:

```json
{
  "location": {
    "name": "你的街道名称",
    "center": [经度, 纬度],
    "zoom": 16,
    "width": 1200,
    "height": 800
  },
  "style": {
    "roadColor": "#FFFFFF",
    "roadWidth": 2
  },
  "output": {
    "filename": "street-map.png"
  }
}
```

### 获取坐标

1. 打开 [OpenStreetMap](https://www.openstreetmap.org)
2. 搜索你的街道
3. 右键点击位置，选择 "显示地址"
4. 复制经纬度坐标

## 使用方法

### 方法 1: OpenStreetMap (免费，推荐)

```bash
npm run generate:osm
```

这将：
- 从 OpenStreetMap 获取道路数据
- 生成白色道路、透明背景的 PNG

### 方法 2: Mapbox (需要 token)

1. 复制 `.env.example` 为 `.env`:
   ```bash
   cp .env.example .env
   ```

2. 在 [Mapbox](https://account.mapbox.com/access-tokens/) 获取 Access Token

3. 编辑 `.env` 添加你的 token:
   ```
   MAPBOX_ACCESS_TOKEN=pk.your_token_here
   ```

4. 运行:
   ```bash
   npm run generate:mapbox
   ```

## 自定义样式

编辑 `config.json` 中的 `style` 部分:

- `roadColor`: 道路颜色 (默认: `#FFFFFF` 白色)
- `roadWidth`: 道路粗细 (默认: `2`)

## 输出

生成的图片将保存为 `street-map.png`，可直接用于设计软件（Photoshop、Illustrator 等）。

## 示例

生成北京天安门附近地图:

```json
{
  "location": {
    "name": "天安门",
    "center": [116.3974, 39.9042],
    "zoom": 16,
    "width": 1200,
    "height": 800
  }
}
```

运行:
```bash
npm run generate:osm
```
