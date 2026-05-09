const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const PORT = 3000;

// 确保 static 目录存在
const STATIC_DIR = path.join(__dirname, 'static');
if (!fs.existsSync(STATIC_DIR)) {
  fs.mkdirSync(STATIC_DIR, { recursive: true });
}

app.use(express.json());
app.use(express.static('public'));
app.use('/static', express.static('static'));

// 获取当前配置
app.get('/api/config', (req, res) => {
  try {
    const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));
    res.json(config);
  } catch (e) {
    res.status(500).json({ error: '读取配置失败' });
  }
});

// 保存配置
app.post('/api/config', (req, res) => {
  try {
    fs.writeFileSync('./config.json', JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '保存配置失败' });
  }
});

// 生成地图
app.post('/api/generate', (req, res) => {
  // 先保存配置
  try {
    fs.writeFileSync('./config.json', JSON.stringify(req.body, null, 2));
  } catch (e) {
    return res.status(500).json({ error: '保存配置失败' });
  }

  // 运行生成器
  const generator = spawn('node', ['osm-generator.js'], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let output = '';
  let errorOutput = '';

  generator.stdout.on('data', (data) => {
    output += data.toString();
  });

  generator.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  generator.on('close', (code) => {
    if (code === 0) {
      // 提取生成的文件名
      const match = output.match(/地图已保存到: (.+\.png)/);
      const filename = match ? match[1] : null;

      res.json({
        success: true,
        output: output,
        filename: filename
      });
    } else {
      res.status(500).json({
        success: false,
        error: errorOutput || '生成失败',
        output: output
      });
    }
  });
});

// 获取生成的图片列表
app.get('/api/images', (req, res) => {
  try {
    const files = fs.readdirSync(STATIC_DIR)
      .filter(f => f.endsWith('.png'))
      .map(f => ({
        name: f,
        url: `/static/${f}`,
        time: fs.statSync(path.join(STATIC_DIR, f)).mtime
      }))
      .sort((a, b) => b.time - a.time);

    res.json(files);
  } catch (e) {
    res.status(500).json({ error: '读取图片列表失败' });
  }
});

// 删除图片
app.delete('/api/images/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    // 防止目录遍历攻击
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: '非法文件名' });
    }

    const filePath = path.join(STATIC_DIR, filename);

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' });
    }

    // 删除文件
    fs.unlinkSync(filePath);
    res.json({ success: true, message: '删除成功' });
  } catch (e) {
    res.status(500).json({ error: '删除失败: ' + e.message });
  }
});

app.listen(PORT, () => {
  console.log(`=== MapToPoster Web Server ===`);
  console.log(`访问 http://localhost:${PORT} 开始配置地图`);
  console.log('');
});
