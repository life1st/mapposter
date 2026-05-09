#!/usr/bin/env node

const fs = require('fs');
const { spawn } = require('child_process');

console.log('=== MapToPoster ===\n');

// 检查 config.json 是否存在
if (!fs.existsSync('./config.json')) {
  console.log('配置文件不存在，请先运行配置向导:');
  console.log('  npm run setup\n');
  process.exit(1);
}

const config = require('./config.json');

console.log('当前配置:');
console.log(`  位置: ${config.location.name}`);
console.log(`  坐标: ${config.location.center.join(', ')}`);
console.log(`  缩放: ${config.location.zoom}`);
console.log(`  尺寸: ${config.location.width}x${config.location.height}`);
console.log(`  道路颜色: ${config.style.roadColor}`);
console.log('');

const provider = config.provider || 'osm';

if (provider === 'mapbox') {
  console.log('使用 Mapbox 生成器...\n');
  const child = spawn('node', ['mapbox-generator.js'], { stdio: 'inherit' });
  child.on('close', code => process.exit(code));
} else {
  console.log('使用 OpenStreetMap 生成器（免费）...\n');
  const child = spawn('node', ['osm-generator.js'], { stdio: 'inherit' });
  child.on('close', code => process.exit(code));
}
