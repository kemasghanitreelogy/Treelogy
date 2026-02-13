document.addEventListener('DOMContentLoaded', function() {
  
  function initAllUspSwipers() {
    var containers = document.querySelectorAll('.usp-custom-container');
    
    containers.forEach(function(container) {
      // Check if Swiper is already initialized on this element
      if (container.classList.contains('swiper-initialized')) return;

      var isMobile = window.innerWidth < 769;
      var shouldLoop = container.getAttribute('data-loop') === 'true';
      var sectionId = container.getAttribute('data-section-id');
      
      // We store the swiper instance on the DOM element to access/destroy it later
      if (isMobile) {
        var uspSwiper = new Swiper(container, {
          wrapperClass: 'usp-wrapper',
          slideClass: 'usp-slide',
          slidesPerView: 1,
          spaceBetween: 20,
          loop: shouldLoop,
          autoHeight: true, 
          
          threshold: 10,
          
          pagination: {
            el: container.querySelector('.usp-pagination'),
            clickable: true,
          },
          
          autoplay: {
            delay: 3000,
            disableOnInteraction: false, 
            pauseOnMouseEnter: true 
          },

          on: {
            init: function() {
              this.autoplay.start();
            },
            touchStart: function() {
              this.autoplay.stop();
            },
            touchEnd: function() {
              this.autoplay.start();
            }
          }
        });

        // Save instance to element
        container.swiperInstance = uspSwiper;
        
      }
    });
  }

  // Initialize on load
  initAllUspSwipers();

  // Handle Resize
  var resizeTimer;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(initAllUspSwipers, 200);
  });
  
  // Optional: Listen for Shopify Theme Editor events to re-init immediately
  document.addEventListener('shopify:section:load', initAllUspSwipers);
});