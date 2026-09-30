# Teddy’s Notes — Hugo site

A plain, readable site for several textbooks. The home page is a dark grid of
cards grouped by semester, one card per book, each with the book's icon, color,
name and word count. Inside a book, a gray sidebar lists its chapters and
pages, and a thin bar in the book's color runs across the top. The site name at
the left of that bar links back to the home page. Content is Markdown, and math
is rendered by MathJax. An editor at `/edit` edits a page's Markdown file with
a live preview.

## Build

    hugo            # writes the compiled site to public/
    hugo server     # live preview at http://localhost:1313

Requires Hugo 0.158 or newer (built with 0.167). The compiled site uses relative
links, so it works from any folder or host path, and when opened from disk.
The compiled site contains everything it needs and loads nothing from a CDN.

Building needs the internet the first time an icon is used: Hugo fetches it
from the Tabler Icons project and keeps it in its cache for later builds.

## Hosting on GitHub Pages

The workflow in `.github/workflows/pages.yaml` builds the site with Hugo and
publishes it each time you push to the `main` branch, so only the source goes
in the repository. `public/` is never committed (see `.gitignore`).

1. Create a repository on GitHub and push this folder to its `main` branch:

       git init -b main
       git add -A
       git commit -m "Teddy's Notes"
       git remote add origin https://github.com/USER/REPO.git
       git push -u origin main

2. In the repository, open Settings → Pages and set Source to "GitHub Actions".
3. Push again, or run "Build and deploy" from the Actions tab. The site appears
   at `https://USER.github.io/REPO/`.

However the files reach GitHub, the hidden `.github` folder has to be included;
git and GitHub Desktop include it, a file manager may not show it.
The Hugo version the workflow installs is `HUGO_VERSION` at the top of the
workflow file.

## Content

    content/
      linear-algebra/             a book
        _index.md                 the book's title, semester, icon and color
        introduction.md           a page listed above the chapters
        vectors/                  a chapter
          _index.md               chapter title and position
          linear-combinations.md  a page in the chapter
          dot-product.md

Each folder directly under `content/` is a book. Each folder inside a book is a
chapter, and each Markdown file is a page. `title` sets the name and `weight`
sets the order, for books, chapters and pages alike:

    ---
    title: Dot Products and Length
    weight: 2
    ---

A chapter's `_index.md` needs only a title and weight.

## Books

A book's `_index.md` holds no text of its own, only the book's details:

    ---
    title: Linear Algebra
    semester: FA26
    icon: matrix
    color: "#2e5c8a"
    ---

A book has no page of its own. Its card, its title in the sidebar and its
address (`/linear-algebra/`) all lead to its first page: the first page placed
directly in the book's folder, or else the first page of its first chapter.

`semester` is `FA` or `SP` followed by a two-digit year. The home page groups
the books under one heading per semester, newest first, and the semester is
shown with the word count under the book's title in the sidebar. Books without
a semester are listed last under "Other".

`icon` is the name of any icon in the Tabler Icons set (https://tabler.io/icons);
nothing is stored in this project. Each icon in use is fetched from the Tabler
Icons repository when the site is built and written into the page. The address
it is fetched from, with the version, is `icons` in `hugo.toml`.

`color` is a six-digit hex color. It colors the strip and icon on the book's
card and the bar across the top of the book's pages; the text on the bar turns
white or dark to suit it. A book without an icon or color gets a plain book
icon and gray.

The word count is the number of words in the Markdown source of all the book's
pages, counted the way `wc -w` counts them.

To add a book, create a new folder under `content/` with an `_index.md`.

## GitHub link

The link at the right of the top bar goes to the site's repository on GitHub.
Inside a book it goes instead to the Markdown file of the page being read.

The repository is `github` in `hugo.toml`, and the branch is `githubBranch`:

    github = "https://github.com/USER/REPO"
    githubBranch = "main"

Both can be left empty. The workflow in `.github/workflows` then fills in the
repository and branch it is building, so a site published that way gets the
right link with nothing to set. A build on your own computer with both empty
has no GitHub link. The file links assume `hugo.toml` is at the top level of
the repository.

## Chat button

The Chat button beside each page's name opens a new chat with Claude or ChatGPT
about that page. The page's Markdown source is sent as the opening message, in
the address of the new chat. A page too long for an address (about 650 words)
is copied to the clipboard instead, and the opening message says it will be
pasted. The addresses and the length limit are at the top of
`static/js/book.js`.

## Editor

`/edit` (`edit/index.html` in the compiled site) is a separate tool. Nothing on
the site links to it; open it by its address. It opens one Markdown file from
disk, shows its source on the left and the rendered page on the right, and
saves every change back to the same file a moment after you stop typing (or at
once with Ctrl/Cmd+S). It needs no server and works when
opened from disk. It does not need to know which book the file belongs to.

It relies on the browser's File System Access API, which Chrome and Edge have
and Firefox and Safari do not. The browser asks once per file for permission
to save changes.

The preview renders Markdown with markdown-it, set up to match what Hugo
produces for the site: math, theorem blocks, tables, footnotes, definition
lists and plain code blocks. The page's `title` is shown as its heading. Images
and links to other pages are not resolved, since the editor sees only the one
file.

## Site name and icon

The name in the top bar is `title` in `hugo.toml`, and the icon beside it is
`icon` under `[params]` there. The dark background of the home page is `--dark`
at the top of `static/css/book.css`, and the height of the top bar is
`--header-height`.

## Math

Inline math goes between `$ … $` or `\( … \)`, display math between `$$ … $$`
or `\[ … \]`. Use `\begin{equation}` with `\label` and `\eqref` for numbered
equations.

One Markdown rule to know: inside `$$ … $$`, a line must not begin with `+`,
`-`, `*` or `>` followed by a space, or Markdown reads it as a list or a quote.
End the previous line with the operator instead, or write the display as a
fenced block, where anything goes:

    ```math
    a
    + b
    - c
    ```

## Definitions, theorems, proofs

Write them as Markdown alerts. The word in brackets becomes the label, and any
word works; the text after it is an optional title.

    > [!theorem] Cauchy–Schwarz inequality
    > For all $\mathbf{u}$ and $\mathbf{v}$ in $\mathbb{R}^n$, …

    > [!proof]
    > …

## Files

    hugo.toml                   site settings
    .github/workflows/          builds and publishes the site on GitHub Pages
    content/edit/_index.md      makes the /edit page exist; leave as is
    layouts/baseof.html         the frame of every page, and the book redirect
    layouts/home.html           the grid of books
    layouts/all.html            every page inside a book
    layouts/edit.html           the editor
    layouts/_partials/          top bar, sidebar, icons, chat button, book details
    layouts/_markup/            math, theorem-block and code-block rendering
    static/css/                 book.css for the site, editor.css for the editor
    static/js/                  book.js, editor.js and MathJax 3
    static/fonts/               Source Serif 4
    static/vendor/              Monaco (the source editor) and markdown-it

Everything under `static/` is loaded by some page of the site. The three
license files there cover the font, Monaco and markdown-it, and should stay
with them.
