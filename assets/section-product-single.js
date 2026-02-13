/* assets/section-product-single.js */

document.addEventListener("DOMContentLoaded", function() {
    
  // ==================================================
  // --- FIX START: ROBUST IOS SCROLL RESET ---
  // ==================================================
  const sliderReset = document.getElementById('MainSlider');

  function forceScrollToStart() {
    if (!sliderReset) return;

    // 1. Disable smooth scrolling temporarily
    sliderReset.style.scrollBehavior = 'auto';
    sliderReset.style.webkitOverflowScrolling = 'auto';

    // 2. Force scroll to 0
    sliderReset.scrollLeft = 0;
    sliderReset.scrollTo({ left: 0, behavior: 'auto' });

    // 3. Re-enable smooth scrolling
    setTimeout(() => {
      sliderReset.style.scrollBehavior = '';
      sliderReset.style.webkitOverflowScrolling = '';
    }, 150);
  }

  forceScrollToStart();
  setTimeout(forceScrollToStart, 50);
  window.addEventListener('load', () => {
     setTimeout(forceScrollToStart, 10);
  });

  // ==================================================
  // DATA HANDLING (Read from Global Variable)
  // ==================================================
  // Kita mengambil data yang di-pass dari Liquid
  const mainProductData = window.productSingleData || {};

  function broadcastVariantChange(variantId) {
    const data = mainProductData[variantId];

    if (data && data.hasMetafield) {
      sessionStorage.setItem('target_bundle_id', data.linkedId);
      
      const event = new CustomEvent('custom-variant-change', { 
        detail: { targetId: data.linkedId } 
      });
      window.dispatchEvent(event);
    } else {
      sessionStorage.removeItem('target_bundle_id');
      
      const event = new CustomEvent('custom-variant-change', { detail: { targetId: null } });
      window.dispatchEvent(event);
    }
  }

  // ==================================================
  // NATIVE GALLERY LOGIC
  // ==================================================
  const mainSlider = document.getElementById('MainSlider');
  const thumbSlider = document.getElementById('ThumbSlider');
  const thumbs = document.querySelectorAll('.native-gallery__thumb');
  
  if (mainSlider && thumbs.length > 0) {
    
    // A. Handle Thumbnail Clicks
    thumbs.forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        const index = parseInt(this.getAttribute('data-index'));
        const slideWidth = mainSlider.offsetWidth;
        
        mainSlider.scrollTo({
          left: slideWidth * index,
          behavior: 'smooth'
        });
      });
    });

    // B. Handle Scroll Spy
    let isScrolling;
    mainSlider.addEventListener('scroll', function() {
      window.clearTimeout( isScrolling );
      
      isScrolling = setTimeout(function() {
        const slideWidth = mainSlider.offsetWidth;
        const scrollPos = mainSlider.scrollLeft;
        const currentIndex = Math.round(scrollPos / slideWidth);
        
        thumbs.forEach(t => t.classList.remove('active'));
        
        const activeThumb = document.querySelector(`.native-gallery__thumb[data-index="${currentIndex}"]`);
        if (activeThumb) {
          activeThumb.classList.add('active');
          activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }, 60);
    });
  }

  // ==================================================
  // VARIANT LOGIC
  // ==================================================
  const mainWrapper = document.querySelector('.product-detail-wrapper');
  const productSelect = document.getElementById('productSelect');
  
  if (mainWrapper) {
    const buttons = mainWrapper.querySelectorAll('.checkbox-button');

    buttons.forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation(); 

        const id = this.getAttribute('data-value');

        buttons.forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        if(productSelect) productSelect.value = id;

        broadcastVariantChange(id);
      });
    });

    const initialActiveBtn = mainWrapper.querySelector('.checkbox-button.active');
    
    if (initialActiveBtn) {
      const initialId = initialActiveBtn.getAttribute('data-value');
      broadcastVariantChange(initialId);
    } else {
      const firstBtn = buttons[0];
      if (firstBtn) {
         const firstId = firstBtn.getAttribute('data-value');
         broadcastVariantChange(firstId);
      }
    }
  }

  // ==================================================
  // KICKSTART (Auto-Trigger Fix)
  // ==================================================
  setTimeout(function() {
    const mainWrapper = document.querySelector('.product-detail-wrapper');
    if (!mainWrapper) return;

    const activeBtn = mainWrapper.querySelector('.checkbox-button.active');
    const allBtns = mainWrapper.querySelectorAll('.checkbox-button');

    if (activeBtn && allBtns.length > 1) {
      let otherBtn = null;
      for (let i = 0; i < allBtns.length; i++) {
        if (allBtns[i] !== activeBtn) {
          otherBtn = allBtns[i];
          break;
        }
      }

      if (otherBtn) {
        otherBtn.click();
        setTimeout(() => {
          activeBtn.click(); 
        }, 10);
      }
    } else if (activeBtn) {
      activeBtn.click();
    }
  }, 500);

});

// Scroll Restoration
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}