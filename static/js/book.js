// Behavior for the pages inside a book: the Contents button on small screens
// and the Chat menu beside the page name.

(function () {
  // Contents button ---------------------------------------------------------

  var toggle = document.getElementById('nav-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var open = document.documentElement.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', open);
    });
  }
  var current = document.querySelector('.sidebar [aria-current]');
  if (current) current.scrollIntoView({ block: 'nearest' });

  // Chat menu ---------------------------------------------------------------

  var chat = document.querySelector('.chat');
  if (!chat) return;
  var button = chat.querySelector('.chat-button');
  var menu = chat.querySelector('.chat-menu');

  // Where each assistant accepts a prompt in the address of a new chat.
  var assistants = {
    claude: 'https://claude.ai/new?q=',
    chatgpt: 'https://chatgpt.com/?q='
  };

  // Addresses longer than this are not reliably accepted, so longer pages are
  // copied to the clipboard instead of being put in the address.
  var MAX_ADDRESS_LENGTH = 6000;

  function setOpen(open) {
    menu.hidden = !open;
    button.setAttribute('aria-expanded', open);
  }

  button.addEventListener('click', function () {
    setOpen(menu.hidden);
    if (!menu.hidden) menu.querySelector('button').focus();
  });

  document.addEventListener('click', function (event) {
    if (!chat.contains(event.target)) setOpen(false);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !menu.hidden) {
      setOpen(false);
      button.focus();
    }
  });

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () { copyWithSelection(text); });
    } else {
      copyWithSelection(text);
    }
  }

  function copyWithSelection(text) {
    var area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); } catch (error) { /* nothing more to try */ }
    area.remove();
  }

  menu.addEventListener('click', function (event) {
    var item = event.target.closest('[data-chat]');
    if (!item) return;

    var title = chat.dataset.title;
    var book = chat.dataset.book;
    var page = '# ' + title + '\n\n' + chat.dataset.source.trim();
    var about = 'a page from my notes, “' + title + '” (' + book + ')';
    var base = assistants[item.dataset.chat];

    var address = base + encodeURIComponent(
      'Here is ' + about + '. I want to ask questions about it.\n\n' + page
    );
    if (address.length > MAX_ADDRESS_LENGTH) {
      copy(page);
      address = base + encodeURIComponent(
        'I want to ask questions about ' + about + '. I have copied the page and am pasting it below.\n\n'
      );
    }

    window.open(address, '_blank', 'noopener');
    setOpen(false);
  });
})();
