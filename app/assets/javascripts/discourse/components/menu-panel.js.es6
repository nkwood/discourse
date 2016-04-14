import { default as computed, on, observes } from 'ember-addons/ember-computed-decorators';

const mutationSupport = !Ember.testing && !!window['MutationObserver'];

export default Ember.Component.extend({
  _lastVisible: false,
  showClose: Ember.computed.equal('viewMode', 'slide-in'),

  @observes('viewMode', 'visible')
  _visibleChanged() {
    if (this.get('visible')) {
      // Allow us to hook into things being shown
      if (!this._lastVisible) {
        Ember.run.scheduleOnce('afterRender', () => this.sendAction('onVisible'));
        this._lastVisible = true;
      }

      $('html').on('click.close-menu-panel', (e) => {
        const $target = $(e.target);
        if ($target.closest('.header-dropdown-toggle').length > 0) { return; }
        if ($target.closest('.menu-panel').length > 0) { return; }
        this.hide();
      });
      this.performLayout();
      this._watchSizeChanges();

      // iOS does not handle scroll events well
      if (!this.capabilities.isIOS) {
        $(window).on('scroll.discourse-menu-panel', () => this.performLayout());
      }
    } else if (this._lastVisible) {
      this._lastVisible = false;
      Ember.run.scheduleOnce('afterRender', () => this.sendAction('onHidden'));
      $('html').off('click.close-menu-panel');
      $(window).off('scroll.discourse-menu-panel');
      this._stopWatchingSize();
      $('body').removeClass('drop-down-visible');
    }
  },

  @computed()
  showKeyboardShortcuts() {
    return !this.site.mobileView && !this.capabilities.touch;
  },

  @computed()
  showMobileToggle() {
    return this.site.mobileView || (this.siteSettings.enable_mobile_theme && this.capabilities.touch);
  },

  @computed()
  mobileViewLinkTextKey() {
    return this.site.mobileView ? "desktop_view" : "mobile_view";
  },

  @computed()
  faqUrl() {
    return this.siteSettings.faq_url ? this.siteSettings.faq_url : Discourse.getURL('/faq');
  },

  performLayout() {
    Ember.run.scheduleOnce('afterRender', this, this._layoutComponent);
  },

  _watchSizeChanges() {
    if (mutationSupport) {
      this._observer.disconnect();
      this._observer.observe(this.element, { childList: true, subtree: true, characterData: true, attributes: true });
    } else {
      clearInterval(this._resizeInterval);
      this._resizeInterval = setInterval(() => {
        Ember.run(() => {
          const $panelBodyContents = this.$('.panel-body-contents');
          if ($panelBodyContents && $panelBodyContents.length) {
            const contentHeight = parseInt($panelBodyContents.height());
            if (contentHeight !== this._lastHeight) { this.performLayout(); }
            this._lastHeight = contentHeight;
          }
        });
      }, 500);
    }
  },

  _stopWatchingSize() {
    if (mutationSupport) {
      this._observer.disconnect();
    } else {
      clearInterval(this._resizeInterval);
    }
  },

  @on('didInsertElement')
  _bindEvents() {
    this.$().on('click.discourse-menu-panel', 'a', e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) { return; }
      const $target = $(e.target);
      if ($target.data('ember-action') || $target.closest('.search-link').length > 0) { return; }
      this.hide();
    });

    this.appEvents.on('dropdowns:closeAll', this, this.hide);
    this.appEvents.on('dom:clean', this, this.hide);

    $('body').on('keydown.discourse-menu-panel', e => {
      if (e.which === 27) {
        this.hide();
      }
    });

    $(window).on('resize.discourse-menu-panel', () => {
      this.propertyDidChange('viewMode');
      this.performLayout();
    });

    if (mutationSupport) {
      this._observer = new MutationObserver(() => {
        Ember.run.debounce(this, this.performLayout, 50);
      });
    }

    this.propertyDidChange('viewMode');
  },

  @on('willDestroyElement')
  _removeEvents() {
    this.appEvents.off('dom:clean', this, this.hide);
    this.appEvents.off('dropdowns:closeAll', this, this.hide);
    this.$().off('click.discourse-menu-panel');
    $('body').off('keydown.discourse-menu-panel');
    $('html').off('click.close-menu-panel');
    $(window).off('resize.discourse-menu-panel');
    $(window).off('scroll.discourse-menu-panel');
  },

  hide() {
    this.set('visible', false);
  },

  actions: {
    close() {
      this.hide();
    }
  }
});
