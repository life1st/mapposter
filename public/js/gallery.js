// 图库模块 - 处理历史记录
const Gallery = {
  images: [],
  currentPreview: null,
  displayCount: 10,
  DISPLAY_INCREMENT: 10,

  async load() {
    try {
      const res = await fetch('/api/images');
      this.images = await res.json();
      this.displayCount = this.DISPLAY_INCREMENT;
      this.render(this.images);

      // 如果当前在编辑 tab 且有最新图片，更新预览
      if (currentTab === 'edit' && this.images.length > 0) {
        this.showLatestOrPlaceholder();
      }
    } catch (e) {
      console.error('加载历史记录失败:', e);
    }
  },

  render(images) {
    const gallery = document.getElementById('gallery');
    if (!gallery) return;

    if (images.length === 0) {
      gallery.innerHTML = `
        <div class="empty-history">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          <p>暂无历史记录</p>
        </div>
      `;
      return;
    }

    const displayedImages = images.slice(0, this.displayCount);
    const hasMore = images.length > this.displayCount;

    let html = displayedImages.map((img, index) => `
      <div class="gallery-item ${index === 0 ? 'active' : ''}" data-filename="${img.name}" data-index="${index}">
        <img src="${img.url}" alt="${img.name}" loading="lazy">
        ${img.hasConfig ? `<button class="gallery-copy" data-filename="${img.name}" title="复制配置">⧉</button>` : ''}
        <button class="gallery-delete" data-filename="${img.name}" title="删除">×</button>
      </div>
    `).join('');

    // 添加"加载更多"按钮
    if (hasMore) {
      const remaining = images.length - this.displayCount;
      html += `
        <div class="gallery-load-more" onclick="Gallery.loadMore()">
          <span>加载更多 (${remaining} 张)</span>
        </div>
      `;
    }

    gallery.innerHTML = html;

    this.initEvents();
  },

  selectImage(filename, index) {
    // 更新选中状态
    document.querySelectorAll('.gallery-item').forEach((item, i) => {
      item.classList.toggle('active', i === index);
    });

    // 更新预览
    this.currentPreview = filename;
    Preview.show(filename);
  },

  showFirstImage() {
    if (this.images.length > 0) {
      // 更新选中状态
      document.querySelectorAll('.gallery-item').forEach((item, i) => {
        item.classList.toggle('active', i === 0);
      });
      this.currentPreview = this.images[0].name;
      Preview.show(this.images[0].name);
    } else {
      this.showPlaceholder();
    }
  },

  showLatestOrPlaceholder() {
    if (this.images.length > 0) {
      // 编辑 tab 显示最后生成的图片（数组第一个是最新的）
      const latest = this.images[0].name;
      this.currentPreview = latest;
      Preview.show(latest);
    } else {
      this.showPlaceholder();
    }
  },

  showPlaceholder() {
    Preview.reset();
    const wrapper = document.getElementById('previewWrapper');
    if (wrapper) {
      wrapper.innerHTML = `
        <div class="preview-placeholder" id="previewPlaceholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          <p>${currentTab === 'history' ? '暂无历史记录' : '点击"生成地图"开始创建'}</p>
        </div>
      `;
    }
    document.getElementById('previewControls').style.display = 'none';
  },

  loadMore() {
    this.displayCount += this.DISPLAY_INCREMENT;
    this.render(this.images);
  },

  initEvents() {
    const gallery = document.getElementById('gallery');
    if (!gallery || gallery._delegated) return;
    gallery._delegated = true;

    gallery.addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('.gallery-delete');
      if (deleteBtn) {
        e.stopPropagation();
        this.deleteImage(deleteBtn.dataset.filename);
        return;
      }

      const copyBtn = e.target.closest('.gallery-copy');
      if (copyBtn) {
        e.stopPropagation();
        this.copyConfig(copyBtn.dataset.filename);
        return;
      }

      const item = e.target.closest('.gallery-item');
      if (item) {
        this.selectImage(item.dataset.filename, parseInt(item.dataset.index));
      }
    });
  },

  async copyConfig(filename) {
    try {
      const res = await fetch(`/api/images/${encodeURIComponent(filename)}/config`);
      if (!res.ok) {
        alert('未找到该记录的配置文件');
        return;
      }
      const config = await res.json();
      await UI.loadConfigObject(config);
      switchTab('edit');
    } catch (e) {
      console.error('复制配置失败:', e);
      alert('复制配置失败: ' + e.message);
    }
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
        await this.load();

        // 如果删除的是当前预览的图片，切换到第一张
        if (this.currentPreview === filename) {
          if (this.images.length > 0) {
            this.selectImage(this.images[0].name, 0);
          } else {
            this.showPlaceholder();
          }
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
