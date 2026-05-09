const fs = require('fs');
const https = require('https');
const config = require('./config.json');

// Mapbox 白色道路样式 (需要替换为你的 access token)
// 这个样式使用 dark background 但道路为白色
const MAPBOX_STYLE_WHITE_ROADS = 'mapbox/dark-v11';

function generateMapboxUrl() {
  const { center, zoom, width, height } = config.location;
  const accessToken = process.env.MAPBOX_ACCESS_TOKEN || config.mapboxAccessToken;

  if (!accessToken) {
    console.error('错误: 请设置 MAPBOX_ACCESS_TOKEN 环境变量或在 config.json 中添加 mapboxAccessToken');
    process.exit(1);
  }

  // 使用 Mapbox Static API
  // 格式: /styles/v1/{username}/{style_id}/static/{overlay}/{lon},{lat},{zoom},{bearing},{pitch}|{bbox}|{auto}/{width}x{height}{@2x}
  const lon = center[0];
  const lat = center[1];

  // 使用自定义样式: 深色背景+白色道路，或完全自定义样式
  const styleUrl = encodeURIComponent('mapbox/dark-v11');

  return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${lon},${lat},${zoom}/${width}x${height}?access_token=${accessToken}&attribution=false&logo=false`;
}

// 使用自定义样式 URL (需要在 Mapbox Studio 中创建)
function generateCustomStyleUrl() {
  const { center, zoom, width, height } = config.location;
  const accessToken = process.env.MAPBOX_ACCESS_TOKEN || config.mapboxAccessToken;

  if (!accessToken) {
    console.error('错误: 请设置 MAPBOX_ACCESS_TOKEN 环境变量');
    process.exit(1);
  }

  const lon = center[0];
  const lat = center[1];

  // 如果你创建了自定义样式，可以在这里使用
  // const styleId = '你的用户名/样式ID';

  return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${lon},${lat},${zoom}/${width}x${height}@2x?access_token=${accessToken}&attribution=false&logo=false`;
}

function downloadImage(url, outputPath) {
  return new Promise((resolve, reject) => {
    console.log('正在下载地图...');
    console.log('URL:', url);

    const file = fs.createWriteStream(outputPath);

    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // 跟随重定向
        const redirectUrl = response.headers.location;
        console.log('跟随重定向...');
        downloadImage(redirectUrl, outputPath).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`下载失败，状态码: ${response.statusCode}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(`地图已保存到: ${outputPath}`);
        resolve(outputPath);
      });
    }).on('error', (err) => {
      fs.unlink(outputPath, () => {});
      reject(err);
    });
  });
}

async function main() {
  console.log('=== MapToPoster - 生成街道地图 ===');
  console.log('位置:', config.location.name);
  console.log('中心坐标:', config.location.center.join(', '));
  console.log('缩放级别:', config.location.zoom);
  console.log('图片尺寸:', `${config.location.width}x${config.location.height}`);
  console.log('');

  const url = generateCustomStyleUrl();
  const outputPath = `./${config.output.filename}`;

  try {
    await downloadImage(url, outputPath);
    console.log('\n✅ 地图生成成功!');
    console.log('注意: 此版本使用 Mapbox dark 样式，道路显示为浅色');
    console.log('如需纯白色道路+透明背景，请使用 osm-generator.js');
  } catch (error) {
    console.error('生成失败:', error.message);
  }
}

main();
