import MountWidget from 'discourse/components/mount-widget';

const PANEL_BODY_MARGIN = 30;

export default MountWidget.extend({
  widget: 'header',
  docAt: null,
  dockedHeader: null,
  // profileWidget: true,

  // classNameBindings: ['editingTopic'],

  examineDockHeader() {
    const $body = $('body');

    // Check the dock after the current run loop. While rendering,
    // it's much slower to calculate `outlet.offset()`
    Ember.run.next(() => {
      if (this.docAt === null) {
        const outlet = $('#main-outlet');
        if (!(outlet && outlet.length === 1)) return;
        this.docAt = outlet.offset().top;
      }

      const offset = window.pageYOffset || $('html').scrollTop();
      if (offset >= this.docAt) {
        if (!this.dockedHeader) {
          $body.addClass('docked');
          this.dockedHeader = true;
        }
      } else {
        if (this.dockedHeader) {
          $body.removeClass('docked');
          this.dockedHeader = false;
        }
      }
    });
  },

  didInsertElement() {
    this._super();
    $(window).bind('scroll.discourse-dock', () => this.examineDockHeader());
    $(document).bind('touchmove.discourse-dock', () => this.examineDockHeader());

    this.dispatch('notifications:changed', 'user-notifications');
    this.examineDockHeader();
  },

  willDestroyElement() {
    this._super();
    $(window).unbind('scroll.discourse-dock');
    $(document).unbind('touchmove.discourse-dock');
    $('body').off('keydown.header');
    this.appEvents.off('notifications:changed');
  },

  afterRender() {
    const $menuPanels = $('.menu-panel');
    if ($menuPanels.length === 0) { return; }

    const $window = $(window);
    const windowWidth = parseInt($window.width());


    const headerWidth = $('#main-outlet .container').width() || 1100;
    const remaining = parseInt((windowWidth - headerWidth) / 2);
    const viewMode = (remaining < 50) ? 'slide-in' : 'drop-down';

    $menuPanels.each((idx, panel) => {
      const $panel = $(panel);
      let width = parseInt($panel.attr('data-max-width') || 300);
      if ((windowWidth - width) < 50) {
        width = windowWidth - 50;
      }

      $panel.removeClass('drop-down').removeClass('slide-in').addClass(viewMode);

      const $panelBody = $('.panel-body', $panel);
      let contentHeight = parseInt($('.panel-body-contents', $panel).height());

      // We use a mutationObserver to check for style changes, so it's important
      // we don't set it if it doesn't change. Same goes for the $panelBody!
      const style = $panel.prop('style');

      if (viewMode === 'drop-down') {
        const $buttonPanel = $('header ul.icons');
        if ($buttonPanel.length === 0) { return; }

        // These values need to be set here, not in the css file - this is to deal with the
        // possibility of the window being resized and the menu changing from .slide-in to .drop-down.
        if (style.top !== '100%' || style.height !== 'auto') {
          $panel.css({ top: '100%', height: 'auto' });
        }

        // adjust panel height
        const fullHeight = parseInt($window.height());
        const offsetTop = $panel.offset().top;
        const scrollTop = $window.scrollTop();

        if (contentHeight + (offsetTop - scrollTop) + PANEL_BODY_MARGIN > fullHeight) {
          contentHeight = fullHeight - (offsetTop - scrollTop) - PANEL_BODY_MARGIN;
        }
        if ($panelBody.height() !== contentHeight) {
          $panelBody.height(contentHeight);
        }
        $('body').addClass('drop-down-visible');
      } else {
        const menuTop = headerHeight();

        let height;
        const winHeight = $(window).height() - 16;
        if ((menuTop + contentHeight) < winHeight) {
          height = contentHeight + "px";
        } else {
          height = winHeight - menuTop;
        }

        if ($panelBody.prop('style').height !== '100%') {
          $panelBody.height('100%');
        }
        if (style.top !== menuTop + "px" || style.height !== height) {
          $panel.css({ top: menuTop + "px", height });
        }
        $('body').removeClass('drop-down-visible');
      }

      $panel.width(width);
    });
  }
});

export function headerHeight() {
  const $header = $('header.d-header');
  const headerOffset = $header.offset();
  const headerOffsetTop = (headerOffset) ? headerOffset.top : 0;
  return parseInt($header.outerHeight() + headerOffsetTop - $(window).scrollTop());
}
