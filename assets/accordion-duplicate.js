(function() {
  'use strict';

  function initAccordionBlocks() {
    const containers = document.querySelectorAll('.ac-dup-block-wrapper');

    containers.forEach(container => {
      if (container.classList.contains('js-init')) return;
      container.classList.add('js-init');

      // --- 1. ACCORDION LOGIC (Item Toggle) ---
      const items = container.querySelectorAll('.ac-dup-item');
      items.forEach(item => {
        const header = item.querySelector('.ac-dup-header');
        const content = item.querySelector('.ac-dup-description');
        if (!header || !content) return;

        header.addEventListener('click', (e) => {
          e.preventDefault();
          const isOpen = item.classList.contains('active');

          // Close siblings
          items.forEach(sibling => {
            if (sibling !== item && sibling.classList.contains('active')) {
              sibling.classList.remove('active');
              sibling.querySelector('.ac-dup-description').style.maxHeight = null;
            }
          });

          // Toggle self
          if (isOpen) {
            item.classList.remove('active');
            content.style.maxHeight = null;
          } else {
            item.classList.add('active');
            content.style.maxHeight = content.scrollHeight + "px";

            // --- NEW FEATURE: Auto Scroll if Title is Hidden ---
            // We set a timeout to allow the 'Close siblings' animation 
            // to finish (or mostly finish) causing the layout shift.
            setTimeout(() => {
              const rect = header.getBoundingClientRect();
              
              // 1. DEFINE OFFSET: Space (in px) to leave above the title
              // Increase this if you have a large sticky header
              const offset = 190; 

              // 2. CHECK VISIBILITY
              // We check if the element is above the "safe zone" (0 + offset)
              // or below the viewport.
              const isObscuredTop = rect.top < offset; 
              const isOffScreenBottom = rect.bottom > window.innerHeight;

              if (isObscuredTop || isOffScreenBottom) {
                // 3. CALCULATE POSITION
                // Current Scroll + Element Position - Buffer
                const targetPosition = window.scrollY + rect.top - offset;

                window.scrollTo({
                  top: targetPosition,
                  behavior: 'smooth'
                });
              }
            }, 350); // 350ms delay matches standard CSS transition times
          }
        });
      });

      // --- 2. SEE MORE / SEE LESS LOGIC ---
      const toggleBtn = container.querySelector('.ac-toggle-btn');
      const extraWrapper = container.querySelector('.ac-extra-wrapper');
      
      if (toggleBtn && extraWrapper) {
        const textMore = toggleBtn.querySelector('.text-more');
        const textLess = toggleBtn.querySelector('.text-less');

        toggleBtn.addEventListener('click', (e) => {
          e.preventDefault();
          const isExpanded = extraWrapper.classList.contains('active');

          if (!isExpanded) {
            // OPEN
            extraWrapper.classList.add('active');
            extraWrapper.style.maxHeight = extraWrapper.scrollHeight + "px";
            
            // Swap text
            if(textMore) textMore.style.display = 'none';
            if(textLess) textLess.style.display = 'inline';

            // Remove max-height constraint after animation
            setTimeout(() => {
              if (extraWrapper.classList.contains('active')) {
                extraWrapper.style.maxHeight = 'none';
                extraWrapper.style.overflow = 'visible';
              }
            }, 500); 

          } else {
            // CLOSE
            extraWrapper.style.maxHeight = extraWrapper.scrollHeight + "px";
            extraWrapper.style.overflow = 'hidden';
            void extraWrapper.offsetWidth; // Force reflow

            extraWrapper.classList.remove('active');
            extraWrapper.style.maxHeight = null;

            // Swap text
            if(textMore) textMore.style.display = 'inline';
            if(textLess) textLess.style.display = 'none';
          }
        });
      }
    });
  }

  // Init Triggers
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAccordionBlocks);
  } else {
    initAccordionBlocks();
  }
  document.addEventListener('shopify:section:load', initAccordionBlocks);
  document.addEventListener('shopify:block:select', initAccordionBlocks);
})();