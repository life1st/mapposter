#!/usr/bin/env node

const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('=== MapToPoster 配置向导 ===\n');
  console.log('这个向导将帮助你配置地图生成参数。\n');

  // 读取现有配置
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
  } catch (e) {
    console.log('无法读取现有配置，将创建新配置。\n');
  }

  const locationName = await question(`位置名称 [${config.location?.name || 'my-street'}]: `);

  console.log('\n请输入中心坐标（可以从 OpenStreetMap 或 Google Maps 获取）');
  console.log('格式: 经度,纬度 (例如: 116.4074,39.9042)');
  const centerDefault = config.location?.center?.join(',') || '116.4074,39.9042';
  const centerInput = await question(`中心坐标 [${centerDefault}]: `);

  const zoom = await question(`缩放级别 (1-20, 越大越详细) [${config.location?.zoom || 16}]: `);
  const width = await question(`图片宽度 [${config.location?.width || 1200}]: `);
  const height = await question(`图片高度 [${config.location?.height || 800}]: `);
  const roadWidth = await question(`道路粗细 [${config.style?.roadWidth || 2}]: `);

  const newConfig = {
    location: {
      name: locationName || config.location?.name || 'my-street',
      center: centerInput
        ? centerInput.split(',').map(Number)
        : config.location?.center || [116.4074, 39.9042],
      zoom: Number(zoom) || config.location?.zoom || 16,
      width: Number(width) || config.location?.width || 1200,
      height: Number(height) || config.location?.height || 800
    },
    style: {
      themeColor: '#ffffff',
      roadWidth: 2,
      background: 'transparent',
      showLabels: false,
      showBuildings: false,
      showPois: false
    },
    output: {
      filename: 'street-map.png',
      format: 'png'
    },
    provider: 'osm'
  };

  fs.writeFileSync('./config.json', JSON.stringify(newConfig, null, 2));

  console.log('\n✅ 配置已保存到 config.json');
  console.log('\n现在运行以下命令生成地图:');
  console.log('  npm install');
  console.log('  npm run generate:osm');

  rl.close();
}

main().catch(console.error);
