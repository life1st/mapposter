const fs = require('fs');
const https = require('https');
const sharp = require('sharp');

// 启动日志 - 确认进程已启动
console.log('🚀 生成器进程已启动，正在加载配置...');

let config;
try {
  config = require('./config.json');
  console.log('✓ 配置加载成功:', config.location?.name || 'unnamed');
} catch (e) {
  console.error('❌ 加载配置失败:', e.message);
  console.error('   工作目录:', process.cwd());
  console.error('   尝试路径:', require('path').join(process.cwd(), 'config.json'));
  process.exit(1);
}
const path = require('path');

// 缓存目录
const CACHE_DIR = path.join(__dirname, '.cache');

// 输出目录
const OUTPUT_DIR = path.join(__dirname, 'static');

// 确保缓存目录存在
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// 生成缓存键（基于中心坐标和缩放级别）
function generateCacheKey(center, zoom, boundaryShape = 'bbox') {
  const lon = center[0].toFixed(6);
  const lat = center[1].toFixed(6);
  const zoomStr = zoom.toFixed(1);
  return `${lon}_${lat}_${zoomStr}_${boundaryShape}`;
}

// 获取缓存文件路径
function getCachePath(cacheKey) {
  return path.join(CACHE_DIR, `${cacheKey}.json`);
}

// 读取缓存数据
function readCache(cacheKey) {
  const cachePath = getCachePath(cacheKey);
  if (fs.existsSync(cachePath)) {
    try {
      const data = fs.readFileSync(cachePath, 'utf-8');
      const cache = JSON.parse(data);
      console.log(`  ✓ 使用缓存数据 (${cacheKey})`);
      return cache;
    } catch (e) {
      console.log(`  ⚠ 缓存读取失败，重新获取数据`);
      return null;
    }
  }
  return null;
}

// 验证缓存数据是否可用
function validateCacheData(data) {
  if (!data || !Array.isArray(data.elements)) return '缺少 elements 字段';
  const hasNodes = data.elements.some(el => el.type === 'node');
  if (!hasNodes) return '缺少节点数据';
  const hasWays = data.elements.some(el => el.type === 'way' && el.nodes?.length > 1);
  if (!hasWays) return '缺少 way 数据';
  return null; // null 表示合法
}

const WAY_TAGS = new Set(['highway', 'railway', 'waterway', 'natural', 'water', 'leisure', 'landuse', 'building', 'width']);

function stripElement(el) {
  if (el.type === 'node') {
    return { type: 'node', id: el.id, lat: el.lat, lon: el.lon };
  }
  if (el.type === 'way') {
    const tags = {};
    for (const k of WAY_TAGS) {
      if (el.tags?.[k] !== undefined) tags[k] = el.tags[k];
    }
    return { type: 'way', id: el.id, nodes: el.nodes, tags };
  }
  if (el.type === 'relation') {
    const tags = {};
    for (const k of WAY_TAGS) {
      if (el.tags?.[k] !== undefined) tags[k] = el.tags[k];
    }
    const members = (el.members || [])
      .filter(m => m.type === 'way')
      .map(m => ({ type: m.type, role: m.role, ref: m.ref }));
    return { type: 'relation', tags, members };
  }
  return null;
}

// 写入缓存数据（只保存用到的字段）
function writeCache(cacheKey, data) {
  const cachePath = getCachePath(cacheKey);
  try {
    const elements = data.elements.map(stripElement).filter(Boolean);
    fs.writeFileSync(cachePath, JSON.stringify({ elements }));
  } catch (e) {
    console.log(`  ⚠ 缓存写入失败: ${e.message}`);
  }
}

// Overpass API 服务器列表（按优先级排序）
const OVERPASS_SERVERS = [
  'overpass-api.de',
  'z.overpass-api.de',
  'lz4.overpass-api.de',
  'overpass.kumi.systems',
  'overpass.openstreetmap.fr',
  'overpass.nchc.org.tw',
];

// 服务器评分系统（响应时间越短，权重越高）
const serverStats = {};
OVERPASS_SERVERS.forEach(s => {
  serverStats[s] = { avgResponseTime: 5000, successCount: 0, failCount: 0, weight: 1 };
});

// 更新服务器评分
function updateServerStats(server, responseTime, success) {
  const stats = serverStats[server];
  if (!stats) return;

  if (success) {
    // 指数移动平均更新响应时间
    const alpha = 0.3;
    stats.avgResponseTime = alpha * responseTime + (1 - alpha) * stats.avgResponseTime;
    stats.successCount++;
  } else {
    stats.failCount++;
    // 失败增加响应时间惩罚
    stats.avgResponseTime *= 1.2;
  }

  // 计算权重（响应时间越短权重越高）
  stats.weight = 10000 / (stats.avgResponseTime + 100);
}

// 获取排序后的服务器列表（权重高的在前）
function getSortedServers() {
  return [...OVERPASS_SERVERS].sort((a, b) => {
    const weightA = serverStats[a]?.weight || 0;
    const weightB = serverStats[b]?.weight || 0;
    return weightB - weightA;
  });
}

// 道路等级对应的线宽倍数
const ROAD_WIDTH_MULTIPLIERS = {
  motorway: 4.0,
  trunk: 3.5,
  primary: 3.0,
  secondary: 2.5,
  tertiary: 2.0,
  unclassified: 1.5,
  residential: 1.5,
  living_street: 1.0,
  service: 1.0,
  pedestrian: 1.5,
  footway: 1.0,
  cycleway: 1.0,
  path: 0.8,
  track: 1.0,
  default: 1.5
};

const RAILWAY_WIDTH_MULTIPLIERS = {
  rail: 2.5,
  subway: 2.0,
  light_rail: 2.0,
  tram: 1.5,
  monorail: 1.5,
  narrow_gauge: 1.5,
  default: 2.0
};

// 获取道路宽度
function getRoadWidth(highwayType, baseWidth) {
  const multiplier = ROAD_WIDTH_MULTIPLIERS[highwayType] || ROAD_WIDTH_MULTIPLIERS.default;
  return Math.round(baseWidth * multiplier);
}

function getRailwayWidth(railwayType, baseWidth) {
  const multiplier = RAILWAY_WIDTH_MULTIPLIERS[railwayType] || RAILWAY_WIDTH_MULTIPLIERS.default;
  return Math.round(baseWidth * multiplier);
}

// 解析OSM宽度值（支持 "10", "10m", "10 m" 等格式）
function parseWidth(widthTag) {
  if (!widthTag) return null;
  const match = String(widthTag).match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

// 获取河流宽度（基于实际width标签或类型默认值，单位：米）
function getWaterwayWidth(waterwayType, tags, baseWidth, zoom) {
  // 优先使用OSM的width标签（单位：米）
  const taggedWidth = parseWidth(tags.width);
  if (taggedWidth && taggedWidth > 0) {
    return taggedWidth;
  }

  // 根据类型使用典型宽度（米）
  const typicalWidths = {
    river: 30,      // 典型河流宽度 30米
    canal: 20,      // 运河宽度 20米
    stream: 5,      // 小溪宽度 5米
    drain: 3,       // 排水沟 3米
    ditch: 2        // 沟渠 2米
  };

  return typicalWidths[waterwayType] || 10;
}

// 将实际米数转换为像素宽度
function metersToPixels(meters, zoom, latitude = 40) {
  // 在指定纬度和缩放级别下，计算米数对应的像素数
  const metersPerPixel = (2 * Math.PI * EARTH_RADIUS * Math.cos(latitude * Math.PI / 180)) / (256 * Math.pow(2, zoom));
  return meters / metersPerPixel;
}

// OpenStreetMap Overpass API 查询（包含道路、河流、绿地和建筑物）
// 支持两种边界形状：bbox(矩形) 和 around(圆形)
function buildOverpassQuery(lat, lon, radius = 500, boundaryShape = 'bbox') {
  let areaFilter;

  if (boundaryShape === 'around') {
    // 圆形查询：使用 around 过滤器
    areaFilter = `around:${radius},${lat},${lon}`;
  } else {
    // 矩形查询：使用 bbox (边界框)
    // 将半径转换为经纬度偏移（近似计算）
    // 1度纬度 ≈ 111km，1度经度 ≈ 111km * cos(纬度)
    const latDelta = radius / 111000;
    const lonDelta = radius / (111000 * Math.cos(lat * Math.PI / 180));

    const south = lat - latDelta;
    const north = lat + latDelta;
    const west = lon - lonDelta;
    const east = lon + lonDelta;

    areaFilter = `${south},${west},${north},${east}`;
  }

  return `[out:json][timeout:30];
(
  way["highway"](${areaFilter});
  way["railway"~"^(rail|subway|light_rail|tram|monorail|narrow_gauge)$"](${areaFilter});
  way["waterway"="riverbank"](${areaFilter});
  way["natural"="water"](${areaFilter});
  relation["waterway"="riverbank"](${areaFilter});
  relation["natural"="water"](${areaFilter});
  way["leisure"="park"](${areaFilter});
  way["landuse"="grass"](${areaFilter});
  way["landuse"="recreation_ground"](${areaFilter});
  way["natural"="grassland"](${areaFilter});
  way["natural"="meadow"](${areaFilter});
  way["landuse"="forest"](${areaFilter});
  way["natural"="wood"](${areaFilter});
  relation["leisure"="park"](${areaFilter});
  way["building"](${areaFilter});
  relation["building"](${areaFilter});
);out body;>;out skel qt;`;
}

// 请求单个服务器
function fetchFromServer(server, query, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const postData = `data=${encodeURIComponent(query)}`;
    let isCompleted = false;
    let timeoutId = null;

    const options = {
      hostname: server,
      path: '/api/interpreter',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'MapToPoster/1.0'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      // 设置接收数据超时（响应体传输超时）
      res.setTimeout(timeoutMs, () => {
        if (!isCompleted) {
          isCompleted = true;
          clearTimeout(timeoutId);
          req.destroy();
          updateServerStats(server, timeoutMs, false);
          reject(new Error('响应接收超时'));
        }
      });

      res.on('data', chunk => {
        data += chunk;
      });

      res.on('end', () => {
        if (isCompleted) return;
        isCompleted = true;
        clearTimeout(timeoutId);

        const responseTime = Date.now() - startTime;

        // 检查是否是 HTML 错误页面
        if (data.trim().startsWith('<')) {
          updateServerStats(server, responseTime, false);
          reject(new Error('返回 HTML 错误页面'));
          return;
        }

        try {
          const json = JSON.parse(data);
          if (!json.elements) {
            updateServerStats(server, responseTime, false);
            reject(new Error('响应中没有地图元素'));
            return;
          }
          // 检查是否有超时标记
          if (json.remark && json.remark.includes('timeout')) {
            updateServerStats(server, responseTime, false);
            reject(new Error('查询超时'));
            return;
          }
          // 检查是否有节点数据
          const hasNodes = json.elements.some(el => el.type === 'node');
          if (!hasNodes) {
            updateServerStats(server, responseTime, false);
            reject(new Error('无节点数据'));
            return;
          }
          updateServerStats(server, responseTime, true);
          console.log(`    ✓ ${server} 响应成功 (${responseTime}ms, 权重: ${serverStats[server].weight.toFixed(1)})`);
          resolve({ server, data: json });
        } catch (e) {
          updateServerStats(server, responseTime, false);
          reject(new Error('解析失败'));
        }
      });

      res.on('error', (err) => {
        if (isCompleted) return;
        isCompleted = true;
        clearTimeout(timeoutId);
        updateServerStats(server, Date.now() - startTime, false);
        reject(new Error(`响应错误: ${err.message}`));
      });
    });

    // 连接超时（建立连接超时）
    timeoutId = setTimeout(() => {
      if (!isCompleted) {
        isCompleted = true;
        console.log(`    ✗ ${server} 连接超时 (${timeoutMs}ms)`);
        req.destroy();
        updateServerStats(server, timeoutMs, false);
        reject(new Error('连接超时'));
      }
    }, timeoutMs);

    req.on('error', (err) => {
      if (isCompleted) return;
      isCompleted = true;
      clearTimeout(timeoutId);
      updateServerStats(server, Date.now() - startTime, false);
      reject(new Error(`请求错误: ${err.message}`));
    });

    req.write(postData);
    req.end();
  });
}

// Race 模式：同时请求多个服务器，取最快成功的
function fetchOverpassData(query, serverIndex = 0, globalTimeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    // 获取按权重排序的服务器列表
    const sortedServers = getSortedServers();
    const remainingServers = sortedServers.slice(serverIndex);

    if (remainingServers.length === 0) {
      reject(new Error('所有 Overpass 服务器都不可用'));
      return;
    }

    // 设置全局超时（整体超时）
    const startTime = Date.now();
    let isResolved = false;
    const globalTimeoutId = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        console.log(`  ✗ 全局超时 (${globalTimeoutMs}ms)，终止请求`);
        reject(new Error('所有服务器请求超时'));
      }
    }, globalTimeoutMs);

    const safeResolve = (data) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(globalTimeoutId);
        resolve(data);
      }
    };

    const safeReject = (err) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(globalTimeoutId);
        reject(err);
      }
    };

    // 每次最多同时请求 2 个服务器
    const batchSize = Math.min(2, remainingServers.length);
    const batch = remainingServers.slice(0, batchSize);
    const nextIndex = serverIndex + batchSize;

    console.log(`  同时请求 ${batch.length} 个服务器 (30秒超时, 按权重排序): ${batch.join(', ')}...`);

    const promises = batch.map(server =>
      fetchFromServer(server, query, 30000)
        .then(result => ({ success: true, result }))
        .catch(error => ({ success: false, server, error: error.message }))
    );

    Promise.race(promises).then(firstResult => {
      if (firstResult.success) {
        console.log(`  ✓ ${firstResult.result.server} 最先返回成功结果 (${Date.now() - startTime}ms)`);
        safeResolve(firstResult.result.data);
      } else {
        // 第一个完成的失败了，等待看有没有其他成功的
        return Promise.allSettled(promises);
      }
    }).then(results => {
      if (!results || isResolved) return; // 已经 resolve 过了

      const successful = results.find(r => r.status === 'fulfilled' && r.value.success);
      if (successful) {
        console.log(`  ✓ ${successful.value.result.server} 返回成功结果 (${Date.now() - startTime}ms)`);
        safeResolve(successful.value.result.data);
      } else {
        // 这一批都失败了，尝试下一批
        console.log(`  ✗ 本批次服务器均失败 (${Date.now() - startTime}ms)，尝试下一批...`);
        const remainingTime = globalTimeoutMs - (Date.now() - startTime);
        if (remainingTime <= 1000) {
          safeReject(new Error('剩余时间不足'));
          return;
        }
        fetchOverpassData(query, nextIndex, remainingTime)
          .then(safeResolve)
          .catch(safeReject);
      }
    }).catch(err => {
      if (isResolved) return;
      // 意外错误，尝试下一批
      const remainingTime = globalTimeoutMs - (Date.now() - startTime);
      if (remainingTime <= 1000) {
        safeReject(new Error('请求超时'));
        return;
      }
      fetchOverpassData(query, nextIndex, remainingTime)
        .then(safeResolve)
        .catch(safeReject);
    });
  });
}

// 地球半径 (米)
const EARTH_RADIUS = 6378137;

// 经纬度转 Web Mercator 投影坐标
function latLonToMercator(lon, lat) {
  const x = EARTH_RADIUS * lon * Math.PI / 180;
  const y = EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  return { x, y };
}

// 计算边界框 (使用 Web Mercator 投影)
function calculateBounds(center, zoom, width, height) {
  const lat = center[1];
  const lon = center[0];

  // 计算每像素的米数
  const metersPerPixel = (2 * Math.PI * EARTH_RADIUS) / (256 * Math.pow(2, zoom));

  // 中心点的墨卡托坐标
  const centerMercator = latLonToMercator(lon, lat);

  // 计算半宽和半高 (米)
  const halfWidthMeters = (width / 2) * metersPerPixel;
  const halfHeightMeters = (height / 2) * metersPerPixel;

  // 计算边界的墨卡托坐标
  const minX = centerMercator.x - halfWidthMeters;
  const maxX = centerMercator.x + halfWidthMeters;
  const minY = centerMercator.y - halfHeightMeters;
  const maxY = centerMercator.y + halfHeightMeters;

  // 转换回经纬度 (用于查询)
  const minLon = (minX / EARTH_RADIUS) * 180 / Math.PI;
  const maxLon = (maxX / EARTH_RADIUS) * 180 / Math.PI;
  const minLat = (360 / Math.PI) * Math.atan(Math.exp(minY / EARTH_RADIUS)) - 90;
  const maxLat = (360 / Math.PI) * Math.atan(Math.exp(maxY / EARTH_RADIUS)) - 90;

  return {
    minLat, maxLat, minLon, maxLon,
    minX, maxX, minY, maxY
  };
}

// 经纬度转换为像素坐标 (使用 Web Mercator 投影)
function latLonToPixel(lon, lat, bounds, width, height) {
  const mercator = latLonToMercator(lon, lat);

  const x = Math.round(((mercator.x - bounds.minX) / (bounds.maxX - bounds.minX)) * width);
  const y = Math.round(height - ((mercator.y - bounds.minY) / (bounds.maxY - bounds.minY)) * height);

  return { x: Math.max(0, Math.min(width - 1, x)), y: Math.max(0, Math.min(height - 1, y)) };
}

// 确保输出目录存在
function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

// 生成带时间戳的文件名
function generateUniqueFilename(baseFilename) {
  ensureOutputDir();

  const now = new Date();
  const timestamp = now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    '_' +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');

  const ext = path.extname(baseFilename);
  const name = path.basename(baseFilename, ext);
  return path.join(OUTPUT_DIR, `${name}_${timestamp}${ext}`);
}

// 画双层边框
function drawDoubleBorder(pixels, width, height, outerWidth, gap, innerWidth, color) {
  const totalWidth = outerWidth + gap + innerWidth;

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      // 判断是否在边框区域
      const isLeftEdge = x < totalWidth;
      const isRightEdge = x >= width - totalWidth;
      const isTopEdge = y < totalWidth;
      const isBottomEdge = y >= height - totalWidth;

      if (!isLeftEdge && !isRightEdge && !isTopEdge && !isBottomEdge) {
        continue;
      }

      // 计算到边缘的距离
      const distLeft = x;
      const distRight = width - 1 - x;
      const distTop = y;
      const distBottom = height - 1 - y;
      const minDist = Math.min(distLeft, distRight, distTop, distBottom);

      let shouldDraw = false;

      // 外层边框
      if (minDist < outerWidth) {
        shouldDraw = true;
      }
      // 内层边框
      else if (minDist >= outerWidth + gap && minDist < outerWidth + gap + innerWidth) {
        shouldDraw = true;
      }

      if (shouldDraw) {
        const idx = (y * width + x) * 4;
        pixels[idx] = color.r;
        pixels[idx + 1] = color.g;
        pixels[idx + 2] = color.b;
        pixels[idx + 3] = 255;
      }
    }
  }
}

// 扫描线填充多边形（用于河流/绿地/建筑物填充）
function fillPolygon(pixels, width, height, points, color, alpha = 255, rangeConfig = null) {
  if (points.length < 3) return;

  // 计算中心点和范围配置
  const centerX = width / 2;
  const centerY = height / 2;
  const hasRange = rangeConfig && rangeConfig.maxDist > 0;
  const maxDist = hasRange ? rangeConfig.maxDist : Math.max(width, height);
  const fadeWidth = hasRange ? rangeConfig.fadeWidth : 0;

  // 找到多边形的y范围
  let minY = height, maxY = 0;
  for (const p of points) {
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  minY = Math.max(0, Math.floor(minY));
  maxY = Math.min(height - 1, Math.ceil(maxY));

  // 对每一行扫描
  for (let y = minY; y <= maxY; y++) {
    const intersections = [];

    // 计算与多边形各边的交点
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];

      // 检查边是否与扫描线相交
      if ((p1.y <= y && p2.y > y) || (p2.y <= y && p1.y > y)) {
        // 计算交点的x坐标
        const t = (y - p1.y) / (p2.y - p1.y);
        const x = p1.x + t * (p2.x - p1.x);
        intersections.push(x);
      }
    }

    // 排序交点
    intersections.sort((a, b) => a - b);

    // 填充交点之间的区域
    for (let i = 0; i < intersections.length; i += 2) {
      if (i + 1 >= intersections.length) break;

      const xStart = Math.max(0, Math.floor(intersections[i]));
      const xEnd = Math.min(width - 1, Math.ceil(intersections[i + 1]));

      for (let x = xStart; x <= xEnd; x++) {
        // 计算到中心的距离
        const distToCenter = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);

        // 范围检查：超出最大距离的不绘制
        if (distToCenter > maxDist) continue;

        // 计算渐隐系数（在渐隐边缘区域）
        let alphaMultiplier = 1;
        if (hasRange && fadeWidth > 0) {
          if (distToCenter > maxDist - fadeWidth) {
            alphaMultiplier = (maxDist - distToCenter) / fadeWidth;
            alphaMultiplier = Math.max(0, Math.min(1, alphaMultiplier));
          }
        }

        const finalAlpha = Math.round(alpha * alphaMultiplier);
        if (finalAlpha <= 0) continue;

        const idx = (y * width + x) * 4;

        if (finalAlpha === 255) {
          pixels[idx] = color.r;
          pixels[idx + 1] = color.g;
          pixels[idx + 2] = color.b;
          pixels[idx + 3] = 255;
        } else {
          const existingAlpha = pixels[idx + 3] / 255;
          const newAlpha = finalAlpha / 255;
          const outAlpha = newAlpha + existingAlpha * (1 - newAlpha);

          if (outAlpha > 0) {
            pixels[idx] = Math.round((color.r * newAlpha + pixels[idx] * existingAlpha * (1 - newAlpha)) / outAlpha);
            pixels[idx + 1] = Math.round((color.g * newAlpha + pixels[idx + 1] * existingAlpha * (1 - newAlpha)) / outAlpha);
            pixels[idx + 2] = Math.round((color.b * newAlpha + pixels[idx + 2] * existingAlpha * (1 - newAlpha)) / outAlpha);
            pixels[idx + 3] = Math.round(outAlpha * 255);
          }
        }
      }
    }
  }
}

// 添加边缘渐隐效果
function addGradientFade(pixels, width, height, fadeWidth) {
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      // 计算到最近边缘的距离
      const distLeft = x;
      const distRight = width - 1 - x;
      const distTop = y;
      const distBottom = height - 1 - y;
      const minDist = Math.min(distLeft, distRight, distTop, distBottom);

      if (minDist < fadeWidth) {
        const idx = (y * width + x) * 4;
        // 计算透明度系数 (0 到 1)
        const alphaFactor = minDist / fadeWidth;
        // 应用渐变到现有像素的透明度
        pixels[idx + 3] = Math.round(pixels[idx + 3] * alphaFactor);
      }
    }
  }
}

// 画线（Bresenham算法）支持透明度
function drawLine(pixels, width, height, x0, y0, x1, y1, color, thickness, alpha = 255) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  const halfThick = Math.floor(thickness / 2);

  while (true) {
    // 画粗线
    for (let tx = -halfThick; tx <= halfThick; tx++) {
      for (let ty = -halfThick; ty <= halfThick; ty++) {
        const px = x0 + tx;
        const py = y0 + ty;
        if (px >= 0 && px < width && py >= 0 && py < height) {
          const idx = (py * width + px) * 4;

          if (alpha === 255) {
            // 不透明直接覆盖
            pixels[idx] = color.r;
            pixels[idx + 1] = color.g;
            pixels[idx + 2] = color.b;
            pixels[idx + 3] = 255;
          } else {
            // 半透明混合
            const existingAlpha = pixels[idx + 3] / 255;
            const newAlpha = alpha / 255;
            const outAlpha = newAlpha + existingAlpha * (1 - newAlpha);

            if (outAlpha > 0) {
              pixels[idx] = Math.round((color.r * newAlpha + pixels[idx] * existingAlpha * (1 - newAlpha)) / outAlpha);
              pixels[idx + 1] = Math.round((color.g * newAlpha + pixels[idx + 1] * existingAlpha * (1 - newAlpha)) / outAlpha);
              pixels[idx + 2] = Math.round((color.b * newAlpha + pixels[idx + 2] * existingAlpha * (1 - newAlpha)) / outAlpha);
              pixels[idx + 3] = Math.round(outAlpha * 255);
            }
          }
        }
      }
    }

    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
}

// 铁路枕木样式：中心线 + 等间距垂直短横线
// baseWidth 为枕木尺寸的基准（不随线宽倍数变化）
function drawRailway(pixels, width, height, x0, y0, x1, y1, color, thickness, tieSpacing, tieLength, baseWidth) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return;

  const ux = dx / len;
  const uy = dy / len;
  const px = -uy; // 垂直方向
  const py = ux;

  drawLine(pixels, width, height, x0, y0, x1, y1, color, thickness);

  const base = baseWidth || thickness;
  const spacing = base * tieSpacing;
  const tieHalf = Math.ceil(base * tieLength);

  for (let d = spacing / 2; d < len; d += spacing) {
    const cx = Math.round(x0 + ux * d);
    const cy = Math.round(y0 + uy * d);
    drawLine(pixels, width, height,
      Math.round(cx - px * tieHalf), Math.round(cy - py * tieHalf),
      Math.round(cx + px * tieHalf), Math.round(cy + py * tieHalf),
      color, 1
    );
  }
}

async function generateMap() {
  try {
    console.log('=== MapToPoster - OSM 街道地图生成器 ===');
    console.log('位置:', config.location.name);
    console.log('中心坐标:', config.location.center.join(', '));

    const { center, zoom, width, height } = config.location;
    const { themeColor, roadColor, roadWidth } = config.style;
    const baseThemeColor = themeColor || roadColor || '#ffffff';

    const lon = center[0];
    const lat = center[1];

  // 计算查询半径 (基于中心纬度)
  const metersPerPixel = (2 * Math.PI * EARTH_RADIUS * Math.cos(lat * Math.PI / 180)) / (256 * Math.pow(2, zoom));
  const radius = Math.max(width, height) * metersPerPixel / 2;

  // 获取边界形状配置，默认为 bbox（矩形）
  const boundaryShape = config.location?.boundaryShape || 'bbox';

  // 检查缓存
  const cacheKey = generateCacheKey(center, zoom, boundaryShape);
  let data = readCache(cacheKey);

  // 验证缓存
  if (data) {
    const cacheError = validateCacheData(data);
    if (cacheError) {
      console.log(`  ⚠ 缓存数据异常（${cacheError}），重新获取...`);
      data = null;
    }
  }

  if (!data) {
    console.log('正在获取 OpenStreetMap 数据...');
    console.log(`边界形状: ${boundaryShape === 'around' ? '圆形' : '矩形'}`);
    console.log(`查询半径: ${Math.round(radius)} 米`);

    try {
      data = await fetchOverpassData(buildOverpassQuery(lat, lon, radius, boundaryShape));
      const fetchError = validateCacheData(data);
      if (fetchError) {
        throw new Error(`获取的数据异常：${fetchError}`);
      }
      writeCache(cacheKey, data);
      console.log(`  ✓ 数据已缓存 (${cacheKey})`);
    } catch (e) {
      console.error('\n❌ 获取数据失败:', e.message);
      console.log('\n可能的解决方案:');
      console.log('1. 检查网络连接');
      console.log('2. 稍后重试（Overpass API 可能有使用限制）');
      throw e;
    }
  }

  console.log(`✓ 获取到 ${data.elements.length} 个地图元素`);

  // 创建节点映射
  const nodes = {};
  let nodeCount = 0;
  data.elements.forEach(el => {
    if (el.type === 'node') {
      nodes[el.id] = { lat: el.lat, lon: el.lon };
      nodeCount++;
    }
  });
  console.log(`  节点数: ${nodeCount}`);

  // 计算边界 (Web Mercator 投影)
  const bounds = calculateBounds(center, zoom, width, height);
  console.log(`边界: ${bounds.minLat.toFixed(4)},${bounds.minLon.toFixed(4)} - ${bounds.maxLat.toFixed(4)},${bounds.maxLon.toFixed(4)}`);

  // 创建透明像素缓冲区
  const pixels = Buffer.alloc(width * height * 4);
  // 全部设置为透明
  for (let i = 3; i < pixels.length; i += 4) {
    pixels[i] = 0; // Alpha = 0
  }

  // 获取配置选项（带默认值）
  const borderConfig = config.border || { type: 'double', outerWidth: 4, gap: 20, innerWidth: 1, width: 4 };
  const waterConfig = config.water || { show: true, opacity: 40 };
  const greenConfig = config.green || { show: true, opacity: 80 };
  const fadeConfig = config.fade || { type: 'gradient', ratio: 15 };
  const buildingConfig = config.building || { show: true, opacity: 60, range: 80 };
  const railwayConfig = config.railway || { show: true, lineWidth: 2, tieSpacing: 15, tieLength: 1.6 };

  // 解析基础颜色（支持 #RGB 或 #RRGGBB 格式）
  function parseColor(colorStr) {
    const color = colorStr?.toString().trim() || '#ffffff';
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      if (hex.length === 3) {
        return {
          r: parseInt(hex[0] + hex[0], 16),
          g: parseInt(hex[1] + hex[1], 16),
          b: parseInt(hex[2] + hex[2], 16)
        };
      } else if (hex.length >= 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return {
          r: Number.isNaN(r) ? 255 : r,
          g: Number.isNaN(g) ? 255 : g,
          b: Number.isNaN(b) ? 255 : b
        };
      }
    }
    return { r: 255, g: 255, b: 255 };
  }

  // 所有元素使用统一的基础颜色（主题色）
  const baseColor = parseColor(baseThemeColor);
  const roadLineColor = baseColor;
  const waterColor = baseColor;
  const greenColor = baseColor;
  const buildingColor = baseColor;

  const waterAlpha = Math.round(255 * (waterConfig.opacity || 40) / 100);
  const greenAlpha = Math.round(255 * (greenConfig.opacity || 80) / 100);
  const buildingAlpha = Math.round(255 * (buildingConfig.opacity || 60) / 100);

  // 分类地图元素
  const roads = [];
  const waterPolygons = []; // 水域多边形（河流、湖泊等）
  const waterRelations = []; // 水域关系
  const greenPolygons = []; // 绿地多边形
  const greenRelations = []; // 绿地关系
  const buildingPolygons = []; // 建筑物多边形
  const buildingRelations = []; // 建筑物关系

  data.elements.forEach(el => {
    if (el.type === 'way' && el.nodes && el.nodes.length > 1) {
      const tags = el.tags || {};
      if (tags.highway || tags.railway) {
        roads.push(el);
      } else if (waterConfig.show !== false && (tags.waterway === 'riverbank' ||
                 tags.natural === 'water' ||
                 tags.water === 'river' ||
                 tags.water === 'lake' ||
                 tags.water === 'pond')) {
        waterPolygons.push(el);
      } else if (greenConfig.show !== false && (
                 tags.leisure === 'park' ||
                 tags.landuse === 'grass' ||
                 tags.landuse === 'recreation_ground' ||
                 tags.natural === 'grassland' ||
                 tags.natural === 'meadow' ||
                 tags.landuse === 'forest' ||
                 tags.natural === 'wood')) {
        greenPolygons.push(el);
      } else if (buildingConfig.show !== false && tags.building) {
        buildingPolygons.push(el);
      }
    } else if (el.type === 'relation' && el.members) {
      const tags = el.tags || {};
      // 处理水域关系
      if (waterConfig.show !== false && (tags.waterway === 'riverbank' ||
          tags.natural === 'water' ||
          tags.water === 'river')) {
        waterRelations.push(el);
      } else if (greenConfig.show !== false && (
          tags.leisure === 'park')) {
        greenRelations.push(el);
      } else if (buildingConfig.show !== false && tags.building) {
        buildingRelations.push(el);
      }
    }
  });

  console.log(`  道路数: ${roads.length}, 绿地: ${greenPolygons.length}, 水域: ${waterPolygons.length}, 建筑: ${buildingPolygons.length}`);

  // 绘制绿地（在最下层）
  let greenPolygonCount = 0;

  if (greenConfig.show !== false) {
    greenPolygons.forEach(el => {
      const points = [];
      el.nodes.forEach(nodeId => {
        const node = nodes[nodeId];
        if (node) {
          const pos = latLonToPixel(node.lon, node.lat, bounds, width, height);
          points.push(pos);
        }
      });

      if (points.length >= 3) {
        fillPolygon(pixels, width, height, points, greenColor, greenAlpha);
        greenPolygonCount++;
      }
    });

    // 处理关系类型的绿地
    greenRelations.forEach(rel => {
      const outerWays = rel.members.filter(m => m.type === 'way' && (m.role === 'outer' || m.role === ''));

      outerWays.forEach(member => {
        const way = data.elements.find(e => e.type === 'way' && e.id === member.ref);
        if (way && way.nodes) {
          const points = [];
          way.nodes.forEach(nodeId => {
            const node = nodes[nodeId];
            if (node) {
              const pos = latLonToPixel(node.lon, node.lat, bounds, width, height);
              points.push(pos);
            }
          });

          if (points.length >= 3) {
            fillPolygon(pixels, width, height, points, greenColor, greenAlpha);
            greenPolygonCount++;
          }
        }
      });
    });

    if (greenPolygonCount > 0) {
      console.log(`✓ 绘制了 ${greenPolygonCount} 个绿地区域 (${greenConfig.opacity || 80}%透明度)`);
    }
  }

  // 绘制水域多边形（在绿地之上，道路之下）
  let waterPolygonCount = 0;

  if (waterConfig.show !== false) {
    waterPolygons.forEach(el => {
      const points = [];
      el.nodes.forEach(nodeId => {
        const node = nodes[nodeId];
        if (node) {
          const pos = latLonToPixel(node.lon, node.lat, bounds, width, height);
          points.push(pos);
        }
      });

      if (points.length >= 3) {
        fillPolygon(pixels, width, height, points, waterColor, waterAlpha);
        waterPolygonCount++;
      }
    });

    // 处理关系类型的水域
    waterRelations.forEach(rel => {
      const outerWays = rel.members.filter(m => m.type === 'way' && (m.role === 'outer' || m.role === ''));

      outerWays.forEach(member => {
        const way = data.elements.find(e => e.type === 'way' && e.id === member.ref);
        if (way && way.nodes) {
          const points = [];
          way.nodes.forEach(nodeId => {
            const node = nodes[nodeId];
            if (node) {
              const pos = latLonToPixel(node.lon, node.lat, bounds, width, height);
              points.push(pos);
            }
          });

          if (points.length >= 3) {
            fillPolygon(pixels, width, height, points, waterColor, waterAlpha);
            waterPolygonCount++;
          }
        }
      });
    });

    if (waterPolygonCount > 0) {
      console.log(`✓ 绘制了 ${waterPolygonCount} 个水域区域 (${waterConfig.opacity || 40}%透明度)`);
    }
  }

  // 绘制建筑物（在水域之上，道路之下）
  let buildingPolygonCount = 0;

  if (buildingConfig.show !== false) {
    // 计算建筑物绘制范围（从中心开始的百分比）
    const buildingRange = (buildingConfig.range || 80) / 100;
    const maxBuildingDist = (Math.min(width, height) / 2) * buildingRange;
    const fadeRatio = (fadeConfig.ratio || 15) / 100;
    const fadeWidth = maxBuildingDist * fadeRatio;

    const buildingRangeConfig = {
      maxDist: maxBuildingDist,
      fadeWidth: fadeWidth,
      fadeRatio: fadeRatio
    };

    buildingPolygons.forEach(el => {
      const points = [];
      el.nodes.forEach(nodeId => {
        const node = nodes[nodeId];
        if (node) {
          const pos = latLonToPixel(node.lon, node.lat, bounds, width, height);
          points.push(pos);
        }
      });

      if (points.length >= 3) {
        fillPolygon(pixels, width, height, points, buildingColor, buildingAlpha, buildingRangeConfig);
        buildingPolygonCount++;
      }
    });

    // 处理关系类型的建筑物
    buildingRelations.forEach(rel => {
      const outerWays = rel.members.filter(m => m.type === 'way' && (m.role === 'outer' || m.role === ''));

      outerWays.forEach(member => {
        const way = data.elements.find(e => e.type === 'way' && e.id === member.ref);
        if (way && way.nodes) {
          const points = [];
          way.nodes.forEach(nodeId => {
            const node = nodes[nodeId];
            if (node) {
              const pos = latLonToPixel(node.lon, node.lat, bounds, width, height);
              points.push(pos);
            }
          });

          if (points.length >= 3) {
            fillPolygon(pixels, width, height, points, buildingColor, buildingAlpha, buildingRangeConfig);
            buildingPolygonCount++;
          }
        }
      });
    });

    if (buildingPolygonCount > 0) {
      console.log(`✓ 绘制了 ${buildingPolygonCount} 个建筑物 (${buildingConfig.opacity || 60}%透明度, ${buildingConfig.range || 80}%范围)`);
    }
  }

  // 绘制道路（根据等级调整宽度）
  let roadSegmentCount = 0;
  let totalNodeRefs = 0;
  let matchedNodes = 0;

  roads.forEach(el => {
    const points = [];
    if (el.nodes) {
      el.nodes.forEach(nodeId => {
        totalNodeRefs++;
        const node = nodes[nodeId];
        if (node) {
          matchedNodes++;
          const pos = latLonToPixel(node.lon, node.lat, bounds, width, height);
          points.push(pos);
        }
      });
    }

    const isRailway = !!el.tags?.railway;
    if (isRailway && railwayConfig.show === false) return;

    const currentRoadWidth = isRailway
      ? Math.max(1, railwayConfig.lineWidth || 2)
      : getRoadWidth(el.tags?.highway, roadWidth);

    for (let i = 0; i < points.length - 1; i++) {
      if (isRailway) {
        drawRailway(
          pixels, width, height,
          points[i].x, points[i].y,
          points[i + 1].x, points[i + 1].y,
          roadLineColor, currentRoadWidth,
          railwayConfig.tieSpacing || 15,
          railwayConfig.tieLength || 1.6,
          roadWidth
        );
      } else {
        drawLine(
          pixels, width, height,
          points[i].x, points[i].y,
          points[i + 1].x, points[i + 1].y,
          roadLineColor, currentRoadWidth
        );
      }
      roadSegmentCount++;
    }
  });
  console.log(`  道路节点引用: ${totalNodeRefs}, 成功匹配: ${matchedNodes}`);

  console.log(`✓ 绘制了 ${roads.length} 条道路 (${roadSegmentCount} 个线段，按等级调整宽度)`);

  // 添加边缘渐隐效果（只对道路内容，不包括边框）
  const fadeType = fadeConfig.type || 'gradient';
  if (fadeType === 'gradient') {
    const fadeRatio = (fadeConfig.ratio || 15) / 100;
    const fadeWidth = Math.round(Math.min(width, height) * fadeRatio);
    console.log('正在添加边缘渐隐效果...');
    addGradientFade(pixels, width, height, fadeWidth);
    console.log(`✓ 边缘渐隐效果已添加（${fadeWidth}px渐变，图片尺寸${Math.round(fadeRatio * 100)}%）`);
  } else {
    console.log('✓ 无边过渡效果');
  }

  // 添加边框
  const borderColor = { r: 255, g: 255, b: 255 };
  const borderType = borderConfig.type || 'double';

  if (borderType === 'double') {
    console.log('正在添加双层边框...');
    const outerWidth = borderConfig.outerWidth || 4;
    const gap = borderConfig.gap || 20;
    const innerWidth = borderConfig.innerWidth || 1;
    drawDoubleBorder(pixels, width, height, outerWidth, gap, innerWidth, borderColor);
    console.log(`✓ 双层边框已添加（外层${outerWidth}px + 间隔${gap}px + 内层${innerWidth}px）`);
  } else if (borderType === 'single') {
    console.log('正在添加单边框...');
    const borderWidth = borderConfig.width || 4;
    drawDoubleBorder(pixels, width, height, borderWidth, 0, 0, borderColor);
    console.log(`✓ 单边框已添加（${borderWidth}px）`);
  } else {
    console.log('✓ 无边框模式');
  }

  // 生成唯一文件名
  const outputFilename = generateUniqueFilename(config.output.filename);

  // 使用 sharp 保存为 PNG
  await sharp(pixels, {
    raw: {
      width: width,
      height: height,
      channels: 4
    }
  })
    .png()
    .toFile(outputFilename);

  console.log(`\n✅ 地图已保存到: ${path.basename(outputFilename)}`);
  console.log(`   尺寸: ${width}x${height}`);
  console.log(`   主题色: ${baseThemeColor}`);
  console.log(`   背景: 透明`);
  console.log(`   投影: Web Mercator (修正长宽比)`);
  if (borderType === 'double') {
    console.log(`   双层边框: 外层${borderConfig.outerWidth || 4}px + 间隔${borderConfig.gap || 20}px + 内层${borderConfig.innerWidth || 1}px`);
  } else if (borderType === 'single') {
    console.log(`   单边框: ${borderConfig.width || 4}px`);
  } else {
    console.log(`   边框: 无`);
  }
  if (fadeType === 'gradient') {
    const fadeRatio = (fadeConfig.ratio || 15) / 100;
    const fadeWidth = Math.round(Math.min(width, height) * fadeRatio);
    console.log(`   边缘渐隐: ${fadeWidth}px渐变 (图片尺寸${Math.round(fadeRatio * 100)}%)`);
  } else {
    console.log(`   边缘过渡: 无`);
  }
  if (buildingConfig.show !== false) {
    console.log(`   建筑物: ${buildingConfig.opacity || 60}%透明度, ${buildingConfig.range || 80}%范围`);
  } else {
    console.log(`   建筑物: 不显示`);
  }
  } catch (err) {
    console.error('\n❌ 生成过程错误:', err.message);
    console.error('   堆栈:', err.stack);
    throw err;
  }
}

generateMap().catch(err => {
  console.error('\n❌ 错误:', err.message);
  console.error('   堆栈:', err.stack);
  process.exit(1);
});
