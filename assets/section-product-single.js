/**
 * PRODUCT CUSTOM LOGIC
 * Handles: iOS Scroll Fix, Variant Syncing, Native Gallery, and Auto-Kickstart
 */

// 1. Run immediately to stop browser from remembering scroll position
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

document.addEventListener("DOMContentLoaded", function() {

  // ==================================================
  // 1. IOS SCROLL RESET (Robust Fix)
  // ==================================================
  const sliderReset = document.getElementById('MainSlider');

  function forceScrollToStart() {
    if (!sliderReset) return;

    // Temporarily disable CSS smooth scrolling
    sliderReset.style.scrollBehavior = 'auto';
    sliderReset.style.webkitOverflowScrolling = 'auto';

    // Force scroll to 0
    sliderReset.scrollLeft = 0;
    sliderReset.scrollTo({ left: 0, behavior: 'auto' });

    // Re-enable smooth scrolling after delay
    setTimeout(() => {
      sliderReset.style.scrollBehavior = '';
      sliderReset.style.webkitOverflowScrolling = '';
    }, 150);
  }

  // Trigger 1: Immediately
  forceScrollToStart();

  // Trigger 2: Short delay
  setTimeout(forceScrollToStart, 50);

  // Trigger 3: On Window Load (Crucial for iOS images)
  window.addEventListener('load', () => {
     setTimeout(forceScrollToStart, 10);
  });


  // ==================================================
  // 2. CORE SYNC FUNCTION
  // ==================================================
  function broadcastVariantChange(variantId) {
    // Access the global data object defined in Liquid
    const data = window.productSingleData ? window.productSingleData[variantId] : null;

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
  // 3. NATIVE GALLERY LOGIC
  // ==================================================
  const mainSlider = document.getElementById('MainSlider');
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
  // 4. VARIANT BUTTON LOGIC
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

    // Initialize with active button or first button
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
  // 5. AUTO-TRIGGER VARIANT SWAP (KICKSTART FIX)
  // ==================================================
  setTimeout(function() {
    const mainWrapper = document.querySelector('.product-detail-wrapper');
    if (!mainWrapper) return;

    const activeBtn = mainWrapper.querySelector('.checkbox-button.active');
    const allBtns = mainWrapper.querySelectorAll('.checkbox-button');

    // If multiple variants, toggle away and back
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
    } 
    // If single variant, just re-click to force binding
    else if (activeBtn) {
      activeBtn.click();
    }
    
  }, 500); 
});