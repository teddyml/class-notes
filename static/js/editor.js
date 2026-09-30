// The editor at /edit.
//
// It opens one Markdown file from disk with the File System Access API, shows
// its source in Monaco on the left and a live rendering on the right, and
// writes every change back to the same file. Nothing is sent anywhere and no
// server is involved; the page works when opened straight from disk.

(function () {
  'use strict';

  var byId = function (id) { return document.getElementById(id); };

  var welcome = byId('welcome');
  var split = byId('split');
  var openFirst = byId('open-first');
  var openAnother = byId('open-another');
  var fileName = byId('file-name');
  var saveStatus = byId('save-status');
  var preview = byId('preview');

  var SAVE_DELAY = 600;    // milliseconds after the last keystroke
  var RENDER_DELAY = 120;

  // ---------------------------------------------------------------------------
  // Markdown → HTML, matching what Hugo produces for the site
  // ---------------------------------------------------------------------------

  var md = window.markdownit({ html: false, linkify: true, typographer: true })
    .use(window.markdownitFootnote)
    .use(window.markdownitDeflist)
    .use(mathPlugin)
    .use(theoremPlugin);

  var escapeHtml = md.utils.escapeHtml;

  // Code blocks are shown plain; a ```math block is display math.
  md.renderer.rules.fence = function (tokens, index) {
    var token = tokens[index];
    var language = token.info.trim().split(/\s+/)[0];
    if (language === 'math') {
      return '\\[' + escapeHtml(token.content) + '\\]\n';
    }
    return '<pre><code' + (language ? ' class="language-' + escapeHtml(language) + '"' : '') + '>' +
      escapeHtml(token.content) + '</code></pre>\n';
  };

  // Footnotes are marked up the way Hugo marks them up.
  md.renderer.rules.footnote_ref = function (tokens, index, options, env, self) {
    var id = self.rules.footnote_anchor_name(tokens, index, options, env, self);
    var ref = id + (tokens[index].meta.subId > 0 ? ':' + tokens[index].meta.subId : '');
    return '<sup><a class="footnote-ref" href="#fn' + id + '" id="fnref' + ref + '">' +
      (tokens[index].meta.id + 1) + '</a></sup>';
  };
  md.renderer.rules.footnote_block_open = function () {
    return '<div class="footnotes">\n<hr>\n<ol>\n';
  };
  md.renderer.rules.footnote_block_close = function () {
    return '</ol>\n</div>\n';
  };
  md.renderer.rules.footnote_open = function (tokens, index, options, env, self) {
    return '<li id="fn' + self.rules.footnote_anchor_name(tokens, index, options, env, self) + '">';
  };

  // Math between $…$, \(…\), $$…$$ or \[…\] is passed through untouched for
  // MathJax, so Markdown never reads its underscores and asterisks.
  function mathPlugin(md) {
    var delimiters = [
      { open: '$$', close: '$$', display: true },
      { open: '\\[', close: '\\]', display: true },
      { open: '\\(', close: '\\)', display: false },
      { open: '$', close: '$', display: false }
    ];

    md.inline.ruler.before('escape', 'math', function (state, silent) {
      for (var i = 0; i < delimiters.length; i++) {
        var d = delimiters[i];
        if (!state.src.startsWith(d.open, state.pos)) continue;
        var start = state.pos + d.open.length;
        var end = state.src.indexOf(d.close, start);
        if (end <= start || end + d.close.length > state.posMax) continue;
        if (!silent) {
          var token = state.push(d.display ? 'math_display' : 'math_inline', '', 0);
          token.content = state.src.slice(start, end);
        }
        state.pos = end + d.close.length;
        return true;
      }
      return false;
    });

    md.renderer.rules.math_inline = function (tokens, index) {
      return '\\(' + escapeHtml(tokens[index].content) + '\\)';
    };
    md.renderer.rules.math_display = function (tokens, index) {
      return '\\[' + escapeHtml(tokens[index].content) + '\\]';
    };

    // A paragraph that is nothing but display math needs no <p> around it.
    md.core.ruler.after('inline', 'math_paragraphs', function (state) {
      var tokens = state.tokens;
      for (var i = 1; i < tokens.length - 1; i++) {
        var children = tokens[i].children;
        if (tokens[i].type === 'inline' && children && children.length === 1 &&
            children[0].type === 'math_display' && tokens[i - 1].type === 'paragraph_open') {
          tokens[i - 1].hidden = true;
          tokens[i + 1].hidden = true;
        }
      }
    });
  }

  // A quote that starts with [!theorem], [!definition], [!proof], … becomes a
  // labeled block, with any text after the marker as its title.
  function theoremPlugin(md) {
    md.core.ruler.before('inline', 'theorem_blocks', function (state) {
      var tokens = state.tokens;
      for (var i = 0; i < tokens.length - 2; i++) {
        if (tokens[i].type !== 'blockquote_open' || tokens[i + 1].type !== 'paragraph_open') continue;
        var first = tokens[i + 2];
        var match = /^\[!([A-Za-z]+)\][+-]?[ \t]*([^\n]*)(?:\n|$)/.exec(first.content);
        if (!match) continue;

        var type = match[1].toLowerCase();
        var title = match[2].trim();

        tokens[i].tag = 'div';
        tokens[i].attrSet('class', 'env env-' + type);
        for (var j = i + 1; j < tokens.length; j++) {
          if (tokens[j].type === 'blockquote_close' && tokens[j].level === tokens[i].level) {
            tokens[j].tag = 'div';
            break;
          }
        }

        var label = new state.Token('html_block', '', 0);
        label.content = '<p class="env-label">' + type.charAt(0).toUpperCase() + type.slice(1) +
          (title ? ' <span class="env-title">(' + md.renderInline(title) + ')</span>' : '') + '</p>\n';

        first.content = first.content.slice(match[0].length);
        if (first.content.trim() === '') {
          tokens.splice(i + 1, 3, label);   // the marker was the whole paragraph
        } else {
          tokens.splice(i + 1, 0, label);
        }
      }
    });
  }

  // Splits a file into the title from its front matter and the Markdown body.
  function parse(text) {
    var match = /^(---|\+\+\+)[ \t]*\r?\n([\s\S]*?)\r?\n\1[ \t]*(?:\r?\n|$)/.exec(text);
    if (!match) return { title: '', body: text };
    var title = /^title\s*[:=]\s*(.*?)\s*$/m.exec(match[2]);
    return {
      title: title ? title[1].replace(/^(["'])(.*)\1$/, '$2') : '',
      body: text.slice(match[0].length)
    };
  }

  function toHtml(text) {
    var file = parse(text);
    return (file.title ? '<h1>' + escapeHtml(file.title) + '</h1>\n' : '') + md.render(file.body);
  }

  // ---------------------------------------------------------------------------
  // Preview
  // ---------------------------------------------------------------------------

  var rendering = false;
  var renderAgain = false;
  var renderTimer = null;

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, RENDER_DELAY);
  }

  // Renders into the hidden copy of the page, typesets its math, then swaps it
  // with the visible one.
  function render() {
    if (rendering) { renderAgain = true; return; }
    rendering = true;

    var staging = preview.querySelector('.staging');
    var visible = preview.querySelector('article:not(.staging)');
    var mathjax = window.MathJax;

    // MathJax loads after this script; wait for it the first time.
    if (!mathjax.startup) {
      rendering = false;
      renderTimer = setTimeout(render, 50);
      return;
    }

    Promise.resolve()
      .then(function () { return mathjax.startup.promise; })
      .then(function () {
        mathjax.typesetClear([staging]);
        staging.innerHTML = toHtml(editor.getValue());
        mathjax.texReset();
        return mathjax.typesetPromise([staging]);
      })
      .catch(function (error) { console.error(error); })
      .then(function () {
        staging.classList.remove('staging');
        staging.removeAttribute('aria-hidden');
        visible.classList.add('staging');
        visible.setAttribute('aria-hidden', 'true');
        rendering = false;
        if (renderAgain) { renderAgain = false; render(); }
      });
  }

  // ---------------------------------------------------------------------------
  // The file
  // ---------------------------------------------------------------------------

  var handle = null;      // the open file
  var savedText = '';     // what the file on disk contains
  var canWrite = false;
  var saving = false;
  var saveTimer = null;

  function setStatus(text, problem) {
    saveStatus.textContent = text;
    saveStatus.classList.toggle('problem', Boolean(problem));
  }

  function isUnsaved() {
    return Boolean(handle && editor && editor.getValue() !== savedText);
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    if (!isUnsaved()) { if (canWrite) setStatus('Saved'); return; }
    if (!canWrite) return;
    setStatus('Unsaved changes');
    saveTimer = setTimeout(save, SAVE_DELAY);
  }

  function save() {
    clearTimeout(saveTimer);
    if (!handle || !canWrite || !isUnsaved()) return Promise.resolve();
    if (saving) return saving;

    var target = handle;
    var text = editor.getValue();
    setStatus('Saving…');

    saving = target.createWritable()
      .then(function (writable) {
        return writable.write(text).then(function () { return writable.close(); });
      })
      .then(function () {
        if (target === handle) savedText = text;
        saving = false;
        if (isUnsaved()) scheduleSave(); else setStatus('Saved');
      })
      .catch(function (error) {
        saving = false;
        setStatus('Could not save: ' + error.message, true);
      });
    return saving;
  }

  function openFile() {
    var picked;
    save()
      .then(function () {
        return window.showOpenFilePicker({
          types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'] } }]
        });
      })
      .then(function (handles) {
        picked = handles[0];
        // Asked for straight away, while the click that opened the file still counts.
        return picked.requestPermission({ mode: 'readwrite' });
      })
      .then(function (permission) {
        canWrite = permission === 'granted';
        return picked.getFile();
      })
      .then(function (file) { return file.text(); })
      .then(function (text) {
        handle = picked;
        savedText = text;
        fileName.textContent = picked.name;
        document.title = picked.name + ' · ' + siteTitle;
        welcome.hidden = true;
        split.hidden = false;
        openAnother.hidden = false;
        editor.setValue(text);
        editor.updateOptions({ readOnly: !canWrite });
        editor.setScrollTop(0);
        editor.focus();
        preview.scrollTop = 0;
        if (canWrite) setStatus('Saved');
        else setStatus('Read only: saving to this file was not allowed', true);
      })
      .catch(function (error) {
        if (error.name !== 'AbortError') setStatus('Could not open the file: ' + error.message, true);
      });
  }

  // ---------------------------------------------------------------------------
  // Source editor
  // ---------------------------------------------------------------------------

  var editor = null;
  var siteTitle = document.title.split(' · ').pop();
  var styles = getComputedStyle(document.documentElement);
  var color = function (name) { return styles.getPropertyValue(name).trim(); };

  var loader = byId('monaco-loader');
  var vs = new URL('.', loader.src).href.replace(/\/$/, '');

  // Monaco runs some background work in a web worker. Browsers refuse to start
  // a worker from a file on disk, so the worker is started from a small script
  // held in memory that then loads Monaco's own worker code. If that is
  // refused too, Monaco does the same work on the page instead.
  window.MonacoEnvironment = {
    getWorkerUrl: function () {
      var source = 'self.MonacoEnvironment = { baseUrl: ' + JSON.stringify(vs.replace(/vs$/, '')) + ' };' +
        'importScripts(' + JSON.stringify(vs + '/base/worker/workerMain.js') + ');';
      return URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    }
  };

  window.require.config({ paths: { vs: vs } });
  window.require(['vs/editor/editor.main'], function () {
    var monaco = window.monaco;

    // A light Markdown highlighter: headings and list markers in bold, code
    // and quote markers in gray, math left alone. It is defined here rather
    // than taken from Monaco's language files, so none of those are bundled.
    monaco.languages.register({ id: 'notes-markdown' });
    monaco.languages.setLanguageConfiguration('notes-markdown', {
      comments: { blockComment: ['<!--', '-->'] },
      brackets: [['{', '}'], ['[', ']'], ['(', ')']],
      autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' }
      ],
      surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '`', close: '`' },
        { open: '*', close: '*' },
        { open: '_', close: '_' },
        { open: '$', close: '$' }
      ]
    });
    monaco.languages.setMonarchTokensProvider('notes-markdown', {
      defaultToken: '',
      tokenizer: {
        root: [
          [/^\s{0,3}#{1,6}(\s.*)?$/, 'keyword'],
          [/^\s*(>\s?)*(`{3,}|~{3,}).*$/, { token: 'string', next: '@code' }],
          [/^\s*(>\s?)+/, 'comment'],
          [/^\s*([-+*]|\d+[.)])\s/, 'keyword'],
          { include: '@inline' }
        ],
        inline: [
          [/`[^`]*`/, 'string'],
          [/\$\$[^$]+\$\$/, ''],
          [/\$\$\s*$/, { token: '', next: '@math' }],
          [/\$[^$]+\$/, ''],
          [/\\\(.*?\\\)/, ''],
          [/\*\*[^*]+\*\*/, 'strong'],
          [/\*[^*\s][^*]*\*/, 'emphasis'],
          [/\b_[^_]+_\b/, 'emphasis']
        ],
        // Inside a fenced code block.
        code: [
          [/^\s*(>\s?)*(`{3,}|~{3,})\s*$/, { token: 'string', next: '@pop' }],
          [/.*$/, 'string']
        ],
        // Inside display math that was opened by $$ at the end of a line.
        math: [
          [/^.*\$\$\s*$/, { token: '', next: '@pop' }],
          [/.*$/, '']
        ]
      }
    });

    // Plain grays on the sidebar's background, to match the rest of the site.
    monaco.editor.defineTheme('notes', {
      base: 'vs',
      inherit: false,
      rules: [
        { token: '', foreground: color('--text').slice(1) },
        { token: 'keyword', fontStyle: 'bold' },
        { token: 'strong', fontStyle: 'bold' },
        { token: 'emphasis', fontStyle: 'italic' },
        { token: 'comment', foreground: color('--muted').slice(1) },
        { token: 'string', foreground: color('--muted').slice(1) }
      ],
      colors: {
        'editor.background': color('--sidebar'),
        'editor.foreground': color('--text'),
        'editorGutter.background': color('--sidebar'),
        'editorLineNumber.foreground': '#a3a39f',
        'editorLineNumber.activeForeground': color('--text'),
        'editor.lineHighlightBackground': '#eaeae7',
        'editor.lineHighlightBorder': '#00000000',
        'editor.selectionBackground': '#d3d3cf',
        'editor.inactiveSelectionBackground': '#deded9',
        'editorCursor.foreground': color('--text'),
        'scrollbarSlider.background': '#00000022',
        'scrollbarSlider.hoverBackground': '#00000033',
        'scrollbarSlider.activeBackground': '#00000044'
      }
    });

    editor = monaco.editor.create(byId('source'), {
      value: '',
      language: 'notes-markdown',
      theme: 'notes',
      wordWrap: 'on',
      wrappingIndent: 'same',
      automaticLayout: true,
      fontFamily: color('--mono'),
      fontSize: 14,
      lineHeight: 23,
      padding: { top: 18, bottom: 18 },
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      folding: false,
      glyphMargin: false,
      lineNumbersMinChars: 4,
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      renderLineHighlight: 'line',
      occurrencesHighlight: 'off',
      selectionHighlight: false,
      quickSuggestions: false,
      wordBasedSuggestions: 'off',
      stickyScroll: { enabled: false },
      guides: { indentation: false },
      'bracketPairColorization.enabled': false,
      unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: false }
    });

    editor.onDidChangeModelContent(function () {
      scheduleRender();
      scheduleSave();
    });

    // Ctrl/Cmd+S saves at once instead of waiting for the pause.
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, save);

    if ('showOpenFilePicker' in window) {
      openFirst.addEventListener('click', openFile);
      openAnother.addEventListener('click', openFile);
    } else {
      openFirst.disabled = true;
      byId('unsupported').hidden = false;
    }
  });

  window.addEventListener('beforeunload', function (event) {
    if (isUnsaved()) {
      save();
      event.preventDefault();
      event.returnValue = '';
    }
  });
})();
