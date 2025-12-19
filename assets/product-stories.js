/**
 * HIGH PERFORMANCE STORY PLAYER (Variant Selector Edition)
 * Features: Smart Preloading, Memory Cleanup, Seamless Mute Toggle, Expandable Variant Selector
 */

class StoryPlayer {
  constructor() {
    this.data = [];
    this.variants = []; // Store product variants
    this.currentIndex = 0;
    this.selectedVariant = null; // Track user selection
    this.videoEl = null;
    this.preloadedVideo = null;
    
    // Select Elements
    this.overlay = document.getElementById('story-overlay');
    this.mediaContainer = document.getElementById('story-media-display');
    this.barsContainer = document.getElementById('story-bars-container');
    this.volumeBtn = document.getElementById('story-volume-btn');
    
    // UI Elements for Variant Selector
    this.variantTrigger = document.getElementById('story-variant-trigger');
    this.variantLabel = document.getElementById('story-variant-label');
    this.variantList = document.getElementById('story-variant-list');
    this.atcBtn = document.getElementById('story-atc-btn');

    // Create Loader
    this.loader = document.createElement('div'); 
    this.loader.className = 'story-loader';
    this.mediaContainer.appendChild(this.loader);
    
    // Load Data
    const dataScript = document.getElementById('product-story-data');
    const variantScript = document.getElementById('product-variants-data');
    
    if (dataScript && variantScript) {
      this.data = JSON.parse(dataScript.innerHTML);
      this.variants = JSON.parse(variantScript.innerHTML);
      
      // Default selection to first available or first in list
      this.selectedVariant = this.variants.find(v => v.available) || this.variants[0];
      
      this.init();
    }
  }

  init() {
    window.openStoryPlayer = (i) => this.open(i);

    // Initial Render of UI based on default variant
    this.updateVariantUI();
    this.renderVariantList();

    // Event Delegation
    this.overlay.addEventListener('click', (e) => {
      // 1. Variant Trigger (Expand/Minimize)
      if (e.target.closest('#story-variant-trigger')) {
        this.toggleVariantList();
        return;
      }

      // 2. Volume Toggle
      if (e.target.closest('#story-volume-btn')) {
        this.toggleVolume();
        return; 
      }

      // 3. Variant Selection (Delegation)
      const variantOption = e.target.closest('.variant-option');
      if (variantOption) {
        const id = parseInt(variantOption.dataset.id);
        this.selectVariant(id);
        return;
      }

      // 4. Close if clicking outside list when open
      if (!e.target.closest('.story-cta-container') && this.variantList.classList.contains('is-open')) {
        this.toggleVariantList(false);
      }

      // 5. Controls
      if (e.target.id === 'story-tap-next') this.next();
      if (e.target.id === 'story-tap-prev') this.prev();
      if (e.target.id === 'story-close-btn') this.close();
      if (e.target.id === 'story-atc-btn') this.addToCart();
    });

    this.renderBarsDOM();
  }

  // --- VARIANT LOGIC ---

  renderVariantList() {
    // If only 1 variant (Default Title), hide the selector entirely
    if (this.variants.length === 1 && this.variants[0].title === 'Default Title') {
      this.variantTrigger.style.display = 'none';
      return;
    }

    this.variantList.innerHTML = this.variants.map(v => `
      <div class="variant-option ${v.id === this.selectedVariant.id ? 'selected' : ''} ${!v.available ? 'sold-out' : ''}" 
           data-id="${v.id}">
        <span>${v.title}</span>
        <span>${v.available ? v.price : 'Sold Out'}</span>
      </div>
    `).join('');
  }

  toggleVariantList(forceState) {
    const isOpen = this.variantList.classList.contains('is-open');
    const newState = forceState !== undefined ? forceState : !isOpen;

    if (newState) {
      this.variantList.classList.add('is-open');
      this.variantTrigger.classList.add('is-open');
    } else {
      this.variantList.classList.remove('is-open');
      this.variantTrigger.classList.remove('is-open');
    }
  }

  selectVariant(id) {
    const found = this.variants.find(v => v.id === id);
    if (found) {
      this.selectedVariant = found;
      this.updateVariantUI();
      this.renderVariantList(); // Re-render to update 'selected' class
      this.toggleVariantList(false); // Close list after selection
    }
  }

  updateVariantUI() {
    if (!this.selectedVariant) return;

    // 1. Update Trigger Label
    let label = this.selectedVariant.title;
    if (label === 'Default Title') label = 'Select Option'; // Should be hidden anyway
    this.variantLabel.innerText = label;

    // 2. Update ATC Button
    // Format: "Add to Cart - Price"
    // Note: User wanted seamless UI, keeping variant info in trigger and price in button works best
    // OR: "Add to Cart - $XX.XX"
    const currentSlide = this.data[this.currentIndex];
    const ctaText = currentSlide ? currentSlide.cta_text : 'Add to Cart';
    
    this.atcBtn.innerText = `${ctaText} - ${this.selectedVariant.price}`;
  }


  // --- PLAYER LOGIC ---

  open(index = 0) {
    this.overlay.style.display = 'block';
    document.body.style.overflow = 'hidden';
    this.currentIndex = index;
    this.loadSlide(this.currentIndex);
  }

  close() {
    this.overlay.style.display = 'none';
    document.body.style.overflow = '';
    this.volumeBtn.style.display = 'none'; 
    this.volumeBtn.classList.remove('sound-on'); 
    this.toggleVariantList(false); // Ensure list is closed
    this.cleanupCurrentSlide();
  }

  loadSlide(index) {
    if (index < 0) index = 0;
    if (index >= this.data.length) {
      this.close();
      return;
    }

    this.currentIndex = index;
    this.cleanupCurrentSlide();
    this.updateBarsUI(index);
    this.loader.style.display = 'block';
    
    this.volumeBtn.style.display = 'none'; 
    this.volumeBtn.classList.remove('sound-on'); 

    const slide = this.data[index];
    
    // Update UI based on current selection (in case slides differ, though usually variants are product-wide)
    this.updateVariantUI();

    this.preloadNextSlide(index);
    this.handleMediaLoad(slide, index);
  }

  handleMediaLoad(slide, index) {
    const fillEl = document.getElementById(`story-fill-${index}`);

    if (slide.type === 'video') {
      let video = this.createVideo(slide.url);
      
      video.play().then(() => {
        this.loader.style.display = 'none';
        video.style.opacity = '1';
        this.volumeBtn.style.display = 'flex'; 
      }).catch((e) => {
        this.loader.style.display = 'none';
        video.style.opacity = '1';
        this.volumeBtn.style.display = 'flex'; 
      });

      this.mediaContainer.appendChild(video);
      this.videoEl = video;

      video.ontimeupdate = () => {
        if (video.duration) {
          const percent = (video.currentTime / video.duration) * 100;
          fillEl.style.width = `${percent}%`;
        }
      };
      video.onended = () => this.next();

    } else {
      const img = document.createElement('img');
      img.src = slide.url;
      img.onload = () => { this.loader.style.display = 'none'; };
      this.mediaContainer.appendChild(img);

      setTimeout(() => {
        fillEl.style.transition = `width ${slide.duration}ms linear`;
        fillEl.style.width = '100%';
      }, 50);
      this.timer = setTimeout(() => this.next(), slide.duration);
    }
  }

  createVideo(url) {
    let video;
    if (this.preloadedVideo && this.preloadedVideo.src === url) {
      video = this.preloadedVideo;
      this.preloadedVideo = null;
    } else {
      video = document.createElement('video');
      video.src = url;
      video.preload = 'auto';
    }
    video.setAttribute('playsinline', '');
    video.muted = true; 
    video.style.opacity = '0';
    return video;
  }

  preloadNextSlide(index) {
    if (index + 1 >= this.data.length) return;
    const nextSlide = this.data[index + 1];
    if (nextSlide.type === 'video') {
      this.preloadedVideo = document.createElement('video');
      this.preloadedVideo.src = nextSlide.url;
      this.preloadedVideo.preload = 'auto';
      this.preloadedVideo.muted = true;
    } else {
      new Image().src = nextSlide.url;
    }
  }

  toggleVolume() {
    if (!this.videoEl) return;
    if (this.videoEl.muted) {
      this.videoEl.muted = false;
      this.volumeBtn.classList.add('sound-on');
    } else {
      this.videoEl.muted = true;
      this.volumeBtn.classList.remove('sound-on');
    }
  }

  next() {
    const currentBar = document.getElementById(`story-fill-${this.currentIndex}`);
    if(currentBar) { currentBar.style.transition = 'none'; currentBar.style.width = '100%'; }
    this.loadSlide(this.currentIndex + 1);
  }

  prev() {
    const currentBar = document.getElementById(`story-fill-${this.currentIndex}`);
    if(currentBar) { currentBar.style.width = '0%'; }
    if (this.currentIndex === 0) this.loadSlide(0);
    else this.loadSlide(this.currentIndex - 1);
  }

  cleanupCurrentSlide() {
    if (this.timer) clearTimeout(this.timer);
    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.removeAttribute('src');
      this.videoEl.load();
      this.videoEl = null;
    }
    this.mediaContainer.innerHTML = '';
    this.mediaContainer.appendChild(this.loader);
  }

  renderBarsDOM() {
    this.barsContainer.innerHTML = '';
    this.data.forEach((_, index) => {
      const bar = document.createElement('div');
      bar.className = 'story-bar';
      const fill = document.createElement('div');
      fill.className = 'story-bar-fill';
      fill.id = `story-fill-${index}`;
      bar.appendChild(fill);
      this.barsContainer.appendChild(bar);
    });
  }

  updateBarsUI(activeIndex) {
    this.data.forEach((_, i) => {
      const fill = document.getElementById(`story-fill-${i}`);
      fill.style.transition = 'none';
      if (i < activeIndex) fill.style.width = '100%';
      else fill.style.width = '0%';
    });
  }
  
  addToCart() {
    const btn = this.atcBtn;
    const originalText = btn.innerText;
    // USE THE SELECTED VARIANT ID
    const variantId = this.selectedVariant.id;

    btn.innerText = "Adding...";
    btn.disabled = true;

    const payload = {
      'items': [{
        'id': variantId,
        'quantity': 1,
        'properties': {
          '_source': 'Story Widget',
          '_ux': 'immersive_player'
        }
      }]
    };

    fetch(window.Shopify.routes.root + 'cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
      btn.innerText = "Added!";
      setTimeout(() => {
        btn.innerText = originalText;
        btn.disabled = false;
      }, 1500);
    })
    .catch(err => {
      console.error(err);
      btn.innerText = "Error";
      btn.disabled = false;
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new StoryPlayer();
});