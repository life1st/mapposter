// 图库模块 - 处理历史记录
const Gallery = {
  async load() {
    try {
      const res = await fetch('/api/images');
      const images = await res.json();
      this.render(images);
    } catch (e) {
      console.error('加载历史记录失败:', e);
    }
  },

  render(images) {
    const gallery = document.getElementById('gallery');
    if (!gallery) return;

    gallery.innerHTML = images.slice(0, 10).map(img => `
      <div class="gallery-item" data-filename="${img.name}">
        <img src="${img.url}" alt="${img.name}" loading="lazy">
        <button class="gallery-delete" data-filename="${img.name}" title="删除">×</button>
      </div>
    `).join('');

    // 使用事件委托绑定点击事件
    gallery.querySelectorAll('.gallery-item').forEach(item => {
      item.addEventListener('click', (e) => {
        // 如果点击的是删除按钮，不触发预览
        if (e.target.classList.contains('gallery-delete')) return;
        const filename = item.dataset.filename;
        Preview.show(filename);
      });
    });

    // 绑定删除按钮事件
    gallery.querySelectorAll('.gallery-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const filename = btn.dataset.filename;
        this.deleteImage(filename);
      });
    });
  },

  async deleteImage(filename) {
    if (!confirm(`确定要删除 ${filename} 吗？`)) return;

    try {
      const res = await fetch(`/api/images/${encodeURIComponent(filename)}`, {
        method: 'DELETE'
      });

      const result = await res.json();

      if (result.success) {
        // 删除成功后刷新列表
        this.load();
        // 如果当前预览的是被删除的图片，清空预览
        const currentImage = document.getElementById('currentImage');
        if (currentImage && currentImage.src.includes(filename)) {
          Preview.reset();
          document.getElementById('previewWrapper').innerHTML = `
            <div class="preview-placeholder" id="previewPlaceholder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              <p>点击"生成地图"开始创建</p>
            </div>
          `;
          document.getElementById('previewControls').style.display = 'none';
        }
      } else {
        alert('删除失败: ' + (result.error || '未知错误'));
      }
    } catch (e) {
      console.error('删除图片失败:', e);
      alert('删除失败: ' + e.message);
    }
  }
};
