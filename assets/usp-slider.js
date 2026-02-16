/* assets/usp-slider.js */

(function() {
  'use strict';

  function initUspSlider(container) {
    // Prevent double-initialization
    if (container.classList.contains('native-init')) return;
    
    var wrapper = container.querySelector('.usp-wrapper');
    var slides = container.querySelectorAll('.usp-slide');
    var pagination = container.querySelector('.usp-pagination');
    
    // Safety check
    if (!wrapper || slides.length === 0) return;

    // Mark as initialized
    container.classList.add('native-init');

    var currentIndex = 0;
    var slideCount = slides.length;
    var autoplayInterval;
    var touchStartX = 0;
    var touchEndX = 0;

    // --- RENDER DOTS ---
    function renderDots() {
      if (!pagination) return;
      pagination.innerHTML = '';
      for (var i = 0; i < slideCount; i++) {
        var dot = document.createElement('button');
        dot.className = 'usp-dot';
        if (i === 0) dot.classList.add('active');
        dot.setAttribute('aria-label', 'Go to slide ' + (i + 1));
        
        (function(idx) {
          dot.addEventListener('click', function() {
            goToSlide(idx);
            resetAutoplay();
          });
        })(i);
        
        pagination.appendChild(dot);
      }
    }

    // --- MOVE SLIDE ---
    function goToSlide(index) {
      // Loop Logic
      if (index < 0) index = slideCount - 1;
      if (index >= slideCount) index = 0;

      currentIndex = index;

      // Move Wrapper (Works on all screens now)
      wrapper.style.transform = 'translateX(-' + (currentIndex * 100) + '%)';

      // Update Dots
      if (pagination) {
        var dots = pagination.querySelectorAll('.usp-dot');
        dots.forEach(function(d) { d.classList.remove('active'); });
        if (dots[currentIndex]) dots[currentIndex].classList.add('active');
      }
    }

    // --- AUTOPLAY ---
    function startAutoplay() {
      stopAutoplay();
      autoplayInterval = setInterval(function() {
        goToSlide(currentIndex + 1);
      }, 3000); // 3 Seconds
    }

    function stopAutoplay() {
      if (autoplayInterval) clearInterval(autoplayInterval);
    }

    function resetAutoplay() {
      stopAutoplay();
      startAutoplay();
    }

    // --- TOUCH / MOUSE SWIPE EVENTS ---
    // (Added mouse support for Desktop dragging)
    wrapper.addEventListener('touchstart', function(e) {
      touchStartX = e.changedTouches[0].screenX;
      stopAutoplay();
    }, { passive: true });

    wrapper.addEventListener('touchend', function(e) {
      touchEndX = e.changedTouches[0].screenX;
      handleSwipe();
      startAutoplay();
    }, { passive: true });
    
    // Optional: Pause on hover (Good for Desktop)
    wrapper.addEventListener('mouseenter', stopAutoplay);
    wrapper.addEventListener('mouseleave', startAutoplay);

    function handleSwipe() {
      var diff = touchEndX - touchStartX;
      var threshold = 50;
      if (Math.abs(diff) > threshold) {
        if (diff < 0) goToSlide(currentIndex + 1); // Swipe Left (Next)
        if (diff > 0) goToSlide(currentIndex - 1); // Swipe Right (Prev)
      }
    }

    // --- RESIZE HANDLER ---
    window.addEventListener('resize', function() {
      // Just snap to current slide to fix any width changes
      goToSlide(currentIndex);
    });

    // --- START ---
    renderDots();
    startAutoplay();
  }

  // --- INIT MANAGER ---
  function initAll() {
    var containers = document.querySelectorAll('.usp-custom-container');
    containers.forEach(function(c) {
      initUspSlider(c);
    });
  }

  // Run immediately if DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  // Support for Shopify Theme Editor
  document.addEventListener('shopify:section:load', initAll);

})();