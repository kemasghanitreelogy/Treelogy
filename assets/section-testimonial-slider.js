/* assets/section-testimonial-slider.js */

(function() {
  'use strict';

  function initNativeTestimonialSlider(container) {
    // 1. Setup Elements
    const wrapper = container.querySelector('.tm-wrapper');
    const slides = container.querySelectorAll('.tm-slide');
    const pagination = container.querySelector('.tm-pagination');
    const slideCount = slides.length;
    let currentIndex = 0;
    let autoplayTimer;

    if (slideCount <= 1) return; // No slider needed for 1 item

    // 2. Create Pagination Dots
    pagination.innerHTML = '';
    for (let i = 0; i < slideCount; i++) {
      const dot = document.createElement('button');
      dot.className = 'tm-dot';
      if (i === 0) dot.classList.add('tm-dot-active');
      dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
      
      dot.addEventListener('click', () => {
        goToSlide(i);
        resetAutoplay();
      });
      pagination.appendChild(dot);
    }
    const dots = pagination.querySelectorAll('.tm-dot');

    // 3. Core Slider Logic
    function goToSlide(index) {
      // Loop logic
      if (index < 0) index = slideCount - 1;
      if (index >= slideCount) index = 0;

      currentIndex = index;

      // Move Wrapper
      // We use translateX based on percentage (100% per slide)
      wrapper.style.transform = `translateX(-${currentIndex * 100}%)`;

      // Update Dots
      dots.forEach(d => d.classList.remove('tm-dot-active'));
      dots[currentIndex].classList.add('tm-dot-active');
    }

    // 4. Autoplay Logic
    function startAutoplay() {
      autoplayTimer = setInterval(() => {
        goToSlide(currentIndex + 1);
      }, 5000); // 5 seconds delay
    }

    function resetAutoplay() {
      clearInterval(autoplayTimer);
      startAutoplay();
    }

    // 5. Touch / Swipe Support (Simple)
    let touchStartX = 0;
    let touchEndX = 0;

    container.addEventListener('touchstart', e => {
      touchStartX = e.changedTouches[0].screenX;
      clearInterval(autoplayTimer); // Pause on touch
    }, {passive: true});

    container.addEventListener('touchend', e => {
      touchEndX = e.changedTouches[0].screenX;
      handleSwipe();
      startAutoplay(); // Resume
    }, {passive: true});

    function handleSwipe() {
      const sensitivity = 50;
      if (touchEndX < touchStartX - sensitivity) goToSlide(currentIndex + 1); // Swipe Left
      if (touchEndX > touchStartX + sensitivity) goToSlide(currentIndex - 1); // Swipe Right
    }

    // Initialize
    startAutoplay();
  }

  // Initialize all sliders on the page
  document.addEventListener('DOMContentLoaded', () => {
    const sliders = document.querySelectorAll('.tm-custom-container');
    sliders.forEach(slider => initNativeTestimonialSlider(slider));
  });

  // Re-init for Shopify Theme Editor (Design Mode)
  document.addEventListener('shopify:section:load', (e) => {
    const container = e.target.querySelector('.tm-custom-container');
    if (container) initNativeTestimonialSlider(container);
  });

})();