/* assets/section-product-single.js */

console.log('🖼️ [GALLERY] Script loaded at:', new Date().toISOString());

document.addEventListener("DOMContentLoaded", function() {
  
  // 1. ISOLATE GALLERY FROM SWIPER
  // This prevents the Testimonial slider from trying to "swipe" your gallery
  const nativeGallery = document.querySelector('.native-gallery');
  if (nativeGallery) {
    nativeGallery.classList.add('swiper-no-swiping');
    nativeGallery.classList.add('swiper-no-swiping-class'); 
  }
  
  // ==================================================
  // --- IOS SCROLL RESET ---
  // ==================================================
  const sliderReset = document.getElementById('MainSlider');

  function forceScrollToStart() {
    if (!sliderReset) return;
    sliderReset.style.scrollBehavior = 'auto';
    sliderReset.style.webkitOverflowScrolling = 'auto';
    sliderReset.scrollLeft = 0;
    setTimeout(() => {
      sliderReset.style.scrollBehavior = '';
      sliderReset.style.webkitOverflowScrolling = '';
    }, 150);
  }

  forceScrollToStart();
  window.addEventListener('load', forceScrollToStart);

  // ==================================================
  // NATIVE GALLERY LOGIC (UNIQUE CLASSES)
  // ==================================================
  const mainSlider = document.getElementById('MainSlider');
  const thumbs = document.querySelectorAll('.native-gallery__thumb');
  
  // Define unique class for active state
  const ACTIVE_CLASS = 'ng-thumb-active'; 

  if (mainSlider && thumbs.length > 0) {
    
    // A. Handle Thumbnail Clicks
    thumbs.forEach((btn, idx) => {
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
        
        // Remove active class from ALL thumbs
        thumbs.forEach(t => t.classList.remove(ACTIVE_CLASS));
        
        // Add active class to CURRENT thumb
        const activeThumb = document.querySelector(`.native-gallery__thumb[data-index="${currentIndex}"]`);
        if (activeThumb) {
          activeThumb.classList.add(ACTIVE_CLASS);
          
          // Optional: Scroll thumbnail into view if it's a long list
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

    buttons.forEach((btn) => {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        
        // Use a local active class for variants (scoped to this wrapper)
        // This is safe because it's inside .product-detail-wrapper
        buttons.forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        
        const id = this.getAttribute('data-value');
        if(productSelect) productSelect.value = id;
      });
    });
  }
});