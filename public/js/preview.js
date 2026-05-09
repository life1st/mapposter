// 预览模块 - 处理图片缩放、拖动
const Preview = {
  scale: 1,
  translateX: 0,
  translateY: 0,
  isDragging: false,
  startX: 0,
  startY: 0,
  lastX: 0,
  lastY: 0,
  isLightTheme: false,

  MIN_SCALE: 0.5,
  MAX_SCALE: 5,
  ZOOM_STEP: 0.1,

  elements: {},

  init() {
    this.elements = {
      container: document.getElementById('previewContainer'),
      wrapper: document.getElementById('previewWrapper'),
      placeholder: document.getElementById('previewPlaceholder'),
      controls: document.getElementById('previewControls'),
      zoomLevel: document.getElementById('zoomLevel'),
      previewArea: document.getElementById('previewArea')
    };

    this.bindEvents();
    return this;
  },

  toggleTheme() {
    this.isLightTheme = !this.isLightTheme;
    const { previewArea } = this.elements;
    if (previewArea) {
      previewArea.classList.toggle('light', this.isLightTheme);
    }
  },

  bindEvents() {
    const { container } = this.elements;
    if (!container) return;

    // 滚轮缩放
    container.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });

    // 鼠标拖动
    container.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    document.addEventListener('mouseup', () => this.handleMouseUp());

    // 触摸支持
    container.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: true });
    container.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    container.addEventListener('touchend', () => this.handleTouchEnd(), { passive: true });
  },

  handleWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -this.ZOOM_STEP : this.ZOOM_STEP;
    const newScale = Math.max(this.MIN_SCALE, Math.min(this.MAX_SCALE, this.scale + delta));

    if (newScale !== this.scale) {
      this.scale = newScale;
      if (this.scale <= 1) {
        this.translateX = 0;
        this.translateY = 0;
      }
      this.updateTransform();
    }
  },

  handleMouseDown(e) {
    if (this.scale <= 1) return;
    this.isDragging = true;
    this.elements.wrapper.classList.add('dragging');
    this.startX = e.clientX - this.translateX;
    this.startY = e.clientY - this.translateY;
    this.elements.container.style.cursor = 'grabbing';
  },

  handleMouseMove(e) {
    if (!this.isDragging) return;
    e.preventDefault();
    this.translateX = e.clientX - this.startX;
    this.translateY = e.clientY - this.startY;
    this.updateTransform();
  },

  handleMouseUp() {
    if (this.isDragging) {
      this.isDragging = false;
      this.elements.wrapper.classList.remove('dragging');
      this.elements.container.style.cursor = 'grab';
    }
  },

  handleTouchStart(e) {
    if (e.touches.length === 1 && this.scale > 1) {
      this.isDragging = true;
      this.lastX = e.touches[0].clientX - this.translateX;
      this.lastY = e.touches[0].clientY - this.translateY;
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      this.touchStartDistance = Math.sqrt(dx * dx + dy * dy);
      this.touchStartScale = this.scale;
    }
  },

  handleTouchMove(e) {
    if (e.touches.length === 1 && this.isDragging) {
      e.preventDefault();
      this.translateX = e.touches[0].clientX - this.lastX;
      this.translateY = e.touches[0].clientY - this.lastY;
      this.updateTransform();
    } else if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      this.scale = Math.max(this.MIN_SCALE, Math.min(this.MAX_SCALE, this.touchStartScale * (distance / this.touchStartDistance)));
      this.updateTransform();
    }
  },

  handleTouchEnd() {
    this.isDragging = false;
  },

  updateTransform() {
    const { wrapper, zoomLevel } = this.elements;
    if (!wrapper) return;
    wrapper.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
    if (zoomLevel) {
      zoomLevel.textContent = Math.round(this.scale * 100) + '%';
    }
  },

  zoomIn() {
    if (this.scale < this.MAX_SCALE) {
      this.scale = Math.min(this.scale + this.ZOOM_STEP, this.MAX_SCALE);
      this.updateTransform();
    }
  },

  zoomOut() {
    if (this.scale > this.MIN_SCALE) {
      this.scale = Math.max(this.scale - this.ZOOM_STEP, this.MIN_SCALE);
      if (this.scale <= 1) {
        this.translateX = 0;
        this.translateY = 0;
      }
      this.updateTransform();
    }
  },

  reset() {
    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;
    this.updateTransform();
  },

  show(filename) {
    const { wrapper, placeholder, controls } = this.elements;
    if (!wrapper || !placeholder || !controls) {
      console.error('Preview elements not found');
      return;
    }

    placeholder.style.display = 'none';
    wrapper.innerHTML = `<img src="/static/${filename}" class="preview-image" id="currentImage" alt="地图" draggable="false">`;
    controls.style.display = 'flex';
    this.reset();
  },

  showGenerated(filename) {
    this.show(filename + '?t=' + Date.now());
  }
};
