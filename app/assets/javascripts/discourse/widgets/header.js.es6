import { createWidget } from 'discourse/widgets/widget';
import { iconNode } from 'discourse/helpers/fa-icon';
import { avatarImg } from 'discourse/widgets/post';

import { h } from 'virtual-dom';

const dropdown = {
  buildClasses(attrs) {
    if (attrs.active) { return "active"; }
  },

  click(e) {
    e.preventDefault();
    if (!this.attrs.active) {
      this.sendWidgetAction(this.attrs.action);
    }
  }
};

createWidget('user-dropdown', jQuery.extend(dropdown, {
  tagName: 'li.header-dropdown-toggle.current-user',

  buildId() {
    return 'current-user';
  },

  html() {
    const { currentUser } = this;

    const avatar = avatarImg('medium', { template: currentUser.get('avatar_template'),
                                         username: currentUser.get('username') });

    return h('a.icon', { attributes: { href: currentUser.get('path'),
                                       'data-auto-route': true } }, avatar);
  }
}));

createWidget('header-dropdown', jQuery.extend(dropdown, {
  tagName: 'li.header-dropdown-toggle',

  html(attrs) {
    const title = I18n.t(attrs.title);

    return h('a.icon', { attributes: { href: '',
                                       'data-auto-route': true,
                                       title,
                                       'aria-label': title,
                                       id: attrs.iconId } }, iconNode(attrs.icon));
  }
}));

createWidget('header-icons', {
  tagName: 'ul.icons.clearfix',

  buildAttributes() {
    return { role: 'navigation' };
  },

  html(attrs) {
    const icons = [ this.attach('header-dropdown', { title: 'search.title',
                                                     icon: 'search',
                                                     iconId: 'search-title',
                                                     action: 'toggleSearchMenu',
                                                     active: attrs.searchVisible,
                                                     href: '/search' }),
                    this.attach('header-dropdown', { title: 'hamburger_menu',
                                                     icon: 'bars',
                                                     iconId: 'toggle-hamburger-menu',
                                                     active: attrs.hamburgerVisible,
                                                     action: 'toggleHamburger' }) ];
    if (this.currentUser) {
      icons.push(this.attach('user-dropdown', { active: attrs.userVisible,
                                                action: 'toggleUserMenu' }));
    }

    return icons;
  },
});

createWidget('header-buttons', {
  tagName: 'span',

  html() {
    if (this.currentUser) { return; }

    return [ this.attach('button', { label: "sign_up",
                                     className: 'btn-primary btn-small sign-up-button',
                                     action: "showCreateAccount" }),
             this.attach('button', { label: 'log_in',
                                     className: 'btn-primary btn-small login-button',
                                     action: 'showLogin',
                                     icon: 'user' }) ];

  }
});

export default createWidget('header', {
  tagName: 'header.d-header.clearfix',
  buildKey: () => `header`,

  defaultState() {
    return { minimized: false,
             searchVisible: false,
             hamburgerVisible: false,
             userVisible: false };
  },

  html(attrs, state) {
    const panels = [this.attach('header-buttons'),
                    this.attach('header-icons', { hamburgerVisible: state.hamburgerVisible,
                                                  userVisible: state.userVisible,
                                                  searchVisible: state.searchVisible })];

    if (state.searchVisible) {
      panels.push(this.attach('search-menu'));
    } else if (state.hamburgerVisible) {
      panels.push(this.attach('hamburger-menu'));
    } else if (state.userVisible) {
      panels.push(this.attach('user-menu'));
    }

    const panel = h('div.panel.clearfix', panels);

    return h('div.wrap',
             h('div.contents.clearfix', [
                this.attach('home-logo', { minimized: state.minimized }),
                panel
              ])
           );
  },

  updateHighlight() {
    if (!this.state.searchVisible) {
      const service = this.container.lookup('search-service:main');
      service.set('highlightTerm', '');
    }
  },

  linkClickedEvent() {
    this.state.userVisible = false;
    this.state.hamburgerVisible = false;
    this.state.searchVisible = false;
    this.updateHighlight();
  },

  toggleSearchMenu() {
    this.state.searchVisible = !this.state.searchVisible;
    this.updateHighlight();
    Ember.run.next(() => $('#search-term').focus());
  },

  toggleUserMenu() {
    this.state.userVisible = !this.state.userVisible;
  },

  toggleHamburger() {
    this.state.hamburgerVisible = !this.state.hamburgerVisible;
  }
});
