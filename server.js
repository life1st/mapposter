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

// 全局生成任务状态
let currentTask = null;
// 存储最近的生成日志（用于新客户端恢复状态）
const MAX_LOG_LINES = 500;
let globalLogBuffer = [];

function addGlobalLog(line) {
  globalLogBuffer.push({ time: Date.now(), line });
  if (globalLogBuffer.length > MAX_LOG_LINES) {
    globalLogBuffer.shift();
  }
}

function clearGlobalLog() {
  globalLogBuffer = [];
}

function startNewTask(config) {
  clearGlobalLog();
  const taskId = Date.now().toString(36);
  const task = {
    id: taskId,
    status: 'running', // running, completed, error, stopped
    startTime: Date.now(),
    endTime: null,
    output: '',
    errorOutput: '',
    filename: null,
    generator: null,
    clients: new Set() // 连接的客户端响应对象
  };
  currentTask = task;
  runGenerator(task, config);
  return task;
}

function runGenerator(task, config) {
  // 保存配置
  const configPath = path.join(__dirname, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  addGlobalLog('启动生成器...');
  console.log('[Server] Starting generator, task:', task.id);

  const generator = spawn('node', ['osm-generator.js'], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  task.generator = generator;
  console.log('[Server] Generator PID:', generator.pid);
  addGlobalLog(`生成器进程已启动 (PID: ${generator.pid})...`);

  generator.stdout.setEncoding('utf8');
  generator.stderr.setEncoding('utf8');

  let buffer = '';

  let isCompleted = false;

  function completeTask(success, code = 0) {
    if (isCompleted) return;
    isCompleted = true;

    if (buffer.trim()) {
      addGlobalLog(buffer.trim());
      broadcastToClients(task, { type: 'progress', line: buffer.trim() });
    }

    const match = task.output.match(/地图已保存到: (.+\.png)/);
    task.filename = match ? match[1] : null;

    if (code === 0 && task.status !== 'stopped') {
      task.status = 'completed';
    } else if (task.status !== 'stopped') {
      task.status = 'error';
    }

    task.endTime = Date.now();
    const logLine = success ? `✅ 生成完成: ${task.filename || '无文件'}` : '❌ 生成失败或已停止';
    console.log(`[Server] ${logLine}`);
    addGlobalLog(logLine);
    broadcastToClients(task, { type: 'progress', line: logLine });
    broadcastToClients(task, {
      type: 'complete',
      success: success,
      filename: task.filename,
      output: task.output,
      error: task.errorOutput
    });
  }

  generator.stdout.on('data', (data) => {
    const text = data.toString();
    task.output += text;

    buffer += text;
    const lines = buffer.split('\n');
    buffer = lines.pop();

    lines.forEach(line => {
      if (line.trim()) {
        addGlobalLog(line.trim());
        broadcastToClients(task, { type: 'progress', line: line.trim() });
        // 检测到生成完成标志立即处理
        if (line.includes('地图已保存到:') || line.includes('✅ 地图已保存到:')) {
          console.log('[Server] Detected completion signal');
          setTimeout(() => completeTask(true, 0), 100);
        }
      }
    });
  });

  generator.stderr.on('data', (data) => {
    const text = data.toString();
    task.errorOutput += text;
    const lines = text.split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        addGlobalLog('❌ ' + line.trim());
        broadcastToClients(task, { type: 'progress', line: '❌ ' + line.trim() });
      }
    });
  });

  generator.on('close', (code) => {
    console.log(`[Server] Generator closed with code ${code}`);
    // 如果还没完成（可能 stdout 没有检测到完成标志），在这里处理
    if (!isCompleted) {
      const success = code === 0 && task.status !== 'stopped';
      completeTask(success, code);
    }
  });

  generator.on('error', (err) => {
    console.error('[Server] Generator spawn error:', err);
    if (isCompleted) return;
    isCompleted = true;
    task.errorOutput += err.message;
    task.status = 'error';
    task.endTime = Date.now();
    addGlobalLog('❌ 启动生成器失败: ' + err.message);
    broadcastToClients(task, { type: 'complete', success: false, error: err.message });
  });
}

function broadcastToClients(task, data) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  task.clients.forEach(res => {
    try {
      res.write(message);
      if (res.flush) res.flush();
    } catch (e) {
      // 客户端已断开，忽略错误
    }
  });
}

function stopTask(task) {
  if (task.generator) {
    task.status = 'stopped';
    task.generator.kill();
    task.endTime = Date.now();
    const logLine = '⏹️ 生成已手动停止';
    console.log(`[Server] ${logLine}`);
    addGlobalLog(logLine);
    broadcastToClients(task, { type: 'progress', line: logLine });
    broadcastToClients(task, { type: 'complete', success: false, error: '已手动停止' });
    return true;
  }
  return false;
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

// 获取当前任务状态
app.get('/api/generate/status', (req, res) => {
  if (!currentTask) {
    return res.json({ running: false });
  }

  const isRunning = currentTask.status === 'running';
  res.json({
    running: isRunning,
    taskId: currentTask.id,
    status: currentTask.status,
    startTime: currentTask.startTime,
    elapsed: isRunning ? Date.now() - currentTask.startTime : (currentTask.endTime - currentTask.startTime),
    filename: currentTask.filename,
    recentLogs: isRunning ? globalLogBuffer.slice(-50) : []
  });
});

// 停止当前任务
app.post('/api/generate/stop', (req, res) => {
  if (currentTask && currentTask.status === 'running') {
    stopTask(currentTask);
    res.json({ success: true, message: '生成已停止' });
  } else {
    res.json({ success: false, message: '没有运行中的生成任务' });
  }
});

// 生成地图（流式响应）
app.post('/api/generate', (req, res) => {
  // 如果已有运行中的任务，加入监听
  if (currentTask && currentTask.status === 'running') {
    console.log('[Server] Joining existing task:', currentTask.id);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // 发送历史日志
    globalLogBuffer.forEach(log => {
      res.write(`data: ${JSON.stringify({ type: 'progress', line: log.line })}\n\n`);
    });

    // 加入客户端集合
    currentTask.clients.add(res);

    // 如果已完成，立即发送完成消息
    if (currentTask.status !== 'running') {
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        success: currentTask.status === 'completed',
        filename: currentTask.filename,
        output: currentTask.output,
        error: currentTask.errorOutput
      })}\n\n`);
      res.end();
      currentTask.clients.delete(res);
    }

    // 客户端断开时移除
    res.on('close', () => {
      if (currentTask) {
        currentTask.clients.delete(res);
      }
    });

    return;
  }

  // 开始新任务
  const task = startNewTask(req.body);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  task.clients.add(res);

  // 客户端断开时只是移除，不停止生成器
  res.on('close', () => {
    task.clients.delete(res);
    console.log('[Server] Client disconnected, but generator continues running');
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
