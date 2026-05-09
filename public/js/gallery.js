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
      </div>
    `).join('');

    // 使用事件委托绑定点击事件
    gallery.querySelectorAll('.gallery-item').forEach(item => {
      item.addEventListener('click', () => {
        const filename = item.dataset.filename;
        Preview.show(filename);
      });
    });
  }
};
