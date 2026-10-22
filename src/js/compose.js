// Compose page glue: Cc/Bcc rows, discard, formatting toolbar toggle, TinyMCE configuration
// (Gmail-like toolbar at the bottom of the editor, our embed.css inside the editable area).
import { modal } from './modal.js';
import { recipients } from './recipients.js';

const html = document.documentElement;
const label = (n) => (window.rcmail?.get_label ? rcmail.get_label(n) : n);

export const compose = {
  show_header(name) {
    const row = document.getElementById(`compose_${name}`);
    if (!row) return false;
    row.classList.remove('hidden');
    document.querySelector(`.gm-hlink[data-header="${name}"]`)?.classList.add('hidden');
    const input = row.querySelector('ul.recipient-input input, input, textarea');
    input?.focus();
    return false;
  },

  header_reset(id) {
    const input = document.getElementById(id);
    const row = input?.closest('.gm-hrow');
    if (!input || !row) return false;
    input.value = '';
    // recipient widget: remove chips
    row.querySelectorAll('ul.recipient-input > li.recipient').forEach((li) => li.remove());
    row.querySelectorAll('ul.recipient-input input').forEach((i) => (i.value = ''));
    row.classList.add('hidden');
    document
      .querySelector(`.gm-hlink[data-header="${id.replace(/^_/, '')}"]`)
      ?.classList.remove('hidden');
    if (window.rcmail) rcmail.compose_type_activity++;
    return false;
  },

  discard() {
    const rc = window.rcmail;
    if (!rc) return false;
    const dirty = typeof rc.cmp_hash === 'string' && rc.cmp_hash !== rc.compose_field_hash();
    const go = () => {
      rc.compose_skip_unsavedcheck = true;
      rc.env.gm_discarded = true; // compose-window.js: no "message sent" toast for a discarded draft
      if (rc.env.extwin) window.close();
      rc.command('list');
    };
    if (dirty) {
      modal
        .confirm(label('notsentwarning'), { okLabel: label('discard'), danger: true })
        .then((ok) => ok && go());
    } else go();
    return false;
  },

  toggle_toolbar() {
    html.classList.toggle('gm-editor-toolbar-hidden');
    const ed = window.rcmail?.editor;
    if (ed && !ed.is_html()) {
      // plain text → switch to HTML (Gmail has formatting on by default)
      window.rcmail.command('toggle-editor', { id: 'composebody', html: true });
      html.classList.remove('gm-editor-toolbar-hidden');
    }
    return false;
  },

  init() {
    // scheduled_sending renders "⏰ Send at" + a native datetime input; strip the emoji (icon comes
    // from CSS) — datetime.js replaces the native control.
    const ssLabel = document.querySelector('#ss-inline-schedule .ss-label');
    if (ssLabel) ssLabel.textContent = ssLabel.textContent.replace(/^[^\p{L}\p{N}]+/u, '').trim();
    const rc = window.rcmail;
    if (!rc || rc.env.action !== 'compose') return;

    // Elastic normally builds this menu; our skin owns that contract too.
    const spellMenu = document.getElementById('spell-menu');
    if (spellMenu) {
      const list = document.createElement('ul');
      list.className = 'menu listing';
      for (const [code, name] of Object.entries(rc.env.spell_langs || {})) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = '#';
        link.className = 'active';
        link.textContent = name;
        link.dataset.lang = code;
        link.addEventListener('click', (event) => {
          event.preventDefault();
          rc.spellcheck_lang_set(code);
          rc.hide_menu('spell-menu');
        });
        item.append(link);
        list.append(item);
      }
      spellMenu.replaceChildren(list);
      const trigger = document.querySelector('[data-popup="spell-menu"]');
      if (trigger && list.children.length) {
        trigger.classList.remove('disabled');
        trigger.parentElement.classList.remove('disabled');
      }
      rc.addEventListener('menu-open', ({ name }) => {
        if (name !== 'spell-menu') return;
        const current = rc.spellcheck_lang();
        for (const link of list.querySelectorAll('a')) {
          const selected = link.dataset.lang === current;
          link.classList.toggle('selected', selected);
          link.setAttribute('aria-selected', String(selected));
        }
      });
    }

    // recipient chips on To/Cc/Bcc/Reply-To/Followup-To (must run before rcmail.init() binds the textareas)
    recipients.init();

    // drag & drop overlay: show the drop area only while a file is dragged over the page
    let dragDepth = 0;
    document.addEventListener('dragenter', (e) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      dragDepth++;
      html.classList.add('gm-dragging');
    });
    document.addEventListener('dragleave', () => {
      if (--dragDepth <= 0) ((dragDepth = 0), html.classList.remove('gm-dragging'));
    });
    document.addEventListener(
      'drop',
      () => ((dragDepth = 0), html.classList.remove('gm-dragging'))
    );

    // rows pre-filled by the server (reply-all etc.) → show them
    for (const name of ['cc', 'bcc', 'replyto', 'followupto']) {
      const input = document.getElementById(`_${name}`);
      if (input && input.value.trim()) this.show_header(name);
    }

    // Gmail-like TinyMCE: no menubar, compact toolbar below the editing area, our content css
    rc.addEventListener('editor-init', (e) => {
      const c = e.config;
      c.menubar = false;
      c.statusbar = false;
      c.toolbar_location = 'bottom';
      c.toolbar_mode = 'sliding';
      c.toolbar =
        'undo redo | fontselect fontsizeselect | bold italic underline forecolor | alignleft aligncenter alignright | numlist bullist outdent indent | blockquote link image | removeformat';
      c.content_style =
        (c.content_style || '') +
        ' body{font-family:Roboto Flex,Roboto,system-ui,sans-serif;font-size:14px;line-height:1.5;margin:8px 0}';
      if (html.classList.contains('dark-mode')) c.skin = 'oxide-dark';
    });

    // mark the Cc/Bcc links as used once their row is visible
    const obs = new MutationObserver(() => {
      for (const name of ['cc', 'bcc']) {
        const row = document.getElementById(`compose_${name}`);
        document
          .querySelector(`.gm-hlink[data-header="${name}"]`)
          ?.classList.toggle('hidden', row && !row.classList.contains('hidden'));
      }
    });
    for (const name of ['cc', 'bcc']) {
      const row = document.getElementById(`compose_${name}`);
      if (row) obs.observe(row, { attributes: true, attributeFilter: ['class'] });
    }
  },
};
