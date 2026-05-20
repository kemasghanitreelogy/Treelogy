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
    thumbs[0].classList.add('active');
    
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
          
          // Use targeted scrollTo instead of scrollIntoView to prevent body shifting
          const thumbSlider = document.getElementById('ThumbSlider');
          if (thumbSlider) {
            const centerPos = activeThumb.offsetLeft + (activeThumb.offsetWidth / 2) - (thumbSlider.offsetWidth / 2);
            
            thumbSlider.scrollTo({ 
              left: centerPos, 
              behavior: 'smooth' 
            });
          }
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


  // ==================================================
  // 6. CUSTOM SUBSCRIPTION SELECTOR
  // ==================================================
  const subFrequency = document.getElementById('SubFrequency');
  if (subFrequency) {
    // --- PATCH FETCH: inject selling_plan into /cart/add calls ---
    // The theme's app.bundle.js (Product class) intercepts the form submit
    // and POSTs to /cart/add.js with only { id, quantity }, dropping selling_plan.
    // We patch fetch to re-inject selling_plan when:
    //   1) User has selected a subscription option (non-empty radio value)
    //   2) The item being added is the main product variant (avoid affecting
    //      related-product carousels on the same page).
    if (!window.__subscriptionFetchPatched) {
      window.__subscriptionFetchPatched = true;
      const originalFetch = window.fetch.bind(window);
      console.log('[Subscription] fetch patch installed ✓');

      window.fetch = function (input, init) {
        try {
          const url = typeof input === 'string' ? input : (input && input.url) || '';
          if (url.indexOf('/cart/add') !== -1 && init && init.body) {
            const checked = document.querySelector('#SubFrequency .sub-option__input:checked');
            const sellingPlan = checked && checked.value;
            console.log('[Subscription] /cart/add intercepted. selling_plan=', sellingPlan || '(none / one-time)');

            if (sellingPlan) {
              const productSelectEl = document.getElementById('productSelect');
              const mainVariantId = productSelectEl ? String(productSelectEl.value) : null;

              if (typeof init.body === 'string') {
                let bodyObj;
                try { bodyObj = JSON.parse(init.body); } catch (_) { bodyObj = null; }

                if (bodyObj) {
                  if (Array.isArray(bodyObj.items)) {
                    bodyObj.items = bodyObj.items.map(function (item) {
                      if (item && String(item.id) === mainVariantId) {
                        return Object.assign({}, item, { selling_plan: sellingPlan });
                      }
                      return item;
                    });
                  } else if (bodyObj.id && String(bodyObj.id) === mainVariantId) {
                    bodyObj.selling_plan = sellingPlan;
                  }
                  init = Object.assign({}, init, { body: JSON.stringify(bodyObj) });
                  console.log('[Subscription] payload modified:', bodyObj);
                }
              } else if (init.body instanceof FormData) {
                // Native form submit case (just in case)
                if (!init.body.has('selling_plan')) {
                  init.body.append('selling_plan', sellingPlan);
                }
              }
            }
          }
        } catch (err) {
          console.warn('[Subscription] fetch patch error:', err);
        }
        return originalFetch(input, init);
      };
    }

    // --- ALSO patch the legacy XMLHttpRequest path (defensive) ---
    if (!window.__subscriptionXhrPatched && window.XMLHttpRequest) {
      window.__subscriptionXhrPatched = true;
      const origOpen = XMLHttpRequest.prototype.open;
      const origSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function () {
        this.__url = arguments[1];
        return origOpen.apply(this, arguments);
      };

      XMLHttpRequest.prototype.send = function (body) {
        try {
          if (this.__url && this.__url.indexOf('/cart/add') !== -1 && typeof body === 'string') {
            const checked = document.querySelector('#SubFrequency .sub-option__input:checked');
            const sellingPlan = checked && checked.value;
            if (sellingPlan) {
              let bodyObj;
              try { bodyObj = JSON.parse(body); } catch (_) { bodyObj = null; }
              if (bodyObj) {
                const productSelectEl = document.getElementById('productSelect');
                const mainVariantId = productSelectEl ? String(productSelectEl.value) : null;
                if (Array.isArray(bodyObj.items)) {
                  bodyObj.items = bodyObj.items.map(function (item) {
                    if (item && String(item.id) === mainVariantId) {
                      return Object.assign({}, item, { selling_plan: sellingPlan });
                    }
                    return item;
                  });
                } else if (bodyObj.id && String(bodyObj.id) === mainVariantId) {
                  bodyObj.selling_plan = sellingPlan;
                }
                arguments[0] = JSON.stringify(bodyObj);
              }
            }
          }
        } catch (err) {
          console.warn('[Subscription] XHR patch error:', err);
        }
        return origSend.apply(this, arguments);
      };
    }

    const subOptions = subFrequency.querySelectorAll('.sub-option');
    const subInputs = subFrequency.querySelectorAll('.sub-option__input');
    const productSelectEl = document.getElementById('productSelect');

    function syncSelectedState() {
      subOptions.forEach(opt => {
        const input = opt.querySelector('.sub-option__input');
        if (input && input.checked) {
          opt.classList.add('is-selected');
        } else {
          opt.classList.remove('is-selected');
        }
      });
    }

    // Radio change → visual selection
    subInputs.forEach(input => {
      input.addEventListener('change', syncSelectedState);
    });

    // Click anywhere on the card → check its radio
    subOptions.forEach(opt => {
      opt.addEventListener('click', function(e) {
        // Allow native label click for the input; only intercept if user clicked outside the input area
        if (e.target.tagName === 'INPUT') return;
        const input = opt.querySelector('.sub-option__input');
        if (input && !input.checked) {
          input.checked = true;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });

    // Update displayed prices when variant changes
    function refreshSubscriptionPrices() {
      if (!productSelectEl || !window.subscriptionPriceMatrix) return;
      const variantId = productSelectEl.value;
      const matrix = window.subscriptionPriceMatrix[variantId];
      if (!matrix) return;

      // One-time option
      subFrequency.querySelectorAll('[data-onetime-price]').forEach(el => {
        el.textContent = matrix.onetime;
      });

      // Plan options
      subFrequency.querySelectorAll('.sub-option--plan').forEach(opt => {
        const planId = opt.getAttribute('data-plan-id');
        const planPrices = matrix.plans && matrix.plans[planId];
        if (!planPrices) return;
        const origEl = opt.querySelector('[data-sub-price-original]');
        const finalEl = opt.querySelector('[data-sub-price-final]');
        if (origEl) origEl.textContent = planPrices.original;
        if (finalEl) finalEl.textContent = planPrices.final;
      });
    }

    // Hook into variant button clicks (defer to next tick so productSelect.value is updated)
    const variantBtns = document.querySelectorAll('.product-detail-wrapper .checkbox-button');
    variantBtns.forEach(btn => {
      btn.addEventListener('click', function() {
        setTimeout(refreshSubscriptionPrices, 0);
      });
    });

    // Also listen for direct productSelect changes (safety net)
    if (productSelectEl) {
      productSelectEl.addEventListener('change', refreshSubscriptionPrices);
    }

    // Initial sync
    syncSelectedState();
    refreshSubscriptionPrices();
  }
});