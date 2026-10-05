(function(){

  // 1. Theme picker — sync <select> to persisted value; write back on change.
  //    (The <head> inline script already set data-theme before paint to avoid FOUC.)
  var saved = null;
  try { saved = localStorage.getItem('doc-theme'); } catch(e){}
  var sel = document.getElementById('doc-theme');
  if (sel) {
    sel.value = saved || 'paper';
    sel.addEventListener('change', function(){
      var v = sel.value;
      try { localStorage.setItem('doc-theme', v); } catch(e){}
      document.documentElement.dataset.theme = v;
      // Re-init Mermaid when theme changes so diagrams recolour.
      if (window.__mermaid) {
        var sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        var isDark = v === 'phosphor' || v === 'amber' || (v === 'auto' && sysDark);
        window.__mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
          themeVariables: { fontFamily: '"JetBrains Mono", monospace' },
          securityLevel: 'strict'
        });
      }
    });
  }

  // 2. Code-block frame — wrap <pre><code data-filename="..."> in a .code-block div
  //    so the .strip header renders above the code.
  document.querySelectorAll('pre > code[data-filename]').forEach(function(code){
    var pre = code.parentElement;
    var wrap = document.createElement('div');
    wrap.className = 'code-block';
    var strip = document.createElement('div');
    strip.className = 'strip';
    strip.textContent = code.getAttribute('data-filename');
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(strip);
    wrap.appendChild(pre);
  });

  // 3. TOC scrollspy — highlight the current section's TOC link as the user scrolls.
  var tocLinks = {};
  document.querySelectorAll('.toc a').forEach(function(a){
    var id = a.getAttribute('href').slice(1);
    tocLinks[id] = a;
  });
  if ('IntersectionObserver' in window && Object.keys(tocLinks).length) {
    var obs = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        var a = tocLinks[en.target.id];
        if (!a) return;
        if (en.isIntersecting) {
          Object.values(tocLinks).forEach(function(x){ x.classList.remove('active'); });
          a.classList.add('active');
        }
      });
    }, { rootMargin: '-10% 0px -80% 0px' });
    document.querySelectorAll('h2[id], h3[id]').forEach(function(h){ obs.observe(h); });
  }

  // 4. Search — Fuse.js fuzzy search with plain substring fallback.
  var idxEl = document.getElementById('search-index');
  var input  = document.getElementById('doc-search');
  var panel  = document.getElementById('doc-search-results');
  if (!idxEl || !input || !panel) return;

  var idx = [];
  try { idx = JSON.parse(idxEl.textContent); } catch(e){}

  var fuse = null;
  if (window.Fuse) {
    fuse = new Fuse(idx, {
      keys: [{name:'h',weight:2},{name:'b',weight:1},{name:'pt',weight:1.5}],
      threshold: 0.4,
      ignoreLocation: true,
      minMatchCharLength: 2,
      includeMatches: true
    });
  }

  var selIdx = -1, rows = [];

  function search(q) {
    if (!q || q.length < 2) { panel.hidden = true; return; }
    var results;
    if (fuse) {
      results = fuse.search(q).slice(0, 10).map(function(r){ return r.item; });
    } else {
      var lq = q.toLowerCase();
      results = idx.filter(function(e){
        return (e.h + ' ' + e.b + ' ' + e.pt).toLowerCase().indexOf(lq) !== -1;
      }).slice(0, 10);
    }
    panel.innerHTML = '';
    rows = [];
    results.forEach(function(e){
      var a = document.createElement('a');
      a.href = (e.p ? e.p : '') + '#' + e.i;
      var rh = document.createElement('span');
      rh.className = 'rh';
      rh.textContent = e.h;
      var rb = document.createElement('span');
      rb.className = 'rb';
      rb.textContent = e.b.slice(0, 120);
      a.appendChild(rh);
      a.appendChild(rb);
      a.addEventListener('click', function(){ panel.hidden = true; });
      panel.appendChild(a);
      rows.push(a);
    });
    selIdx = -1;
    panel.hidden = results.length === 0;
  }

  function paintSel() {
    rows.forEach(function(r, i){ r.classList.toggle('sel', i === selIdx); });
    if (rows[selIdx]) rows[selIdx].scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('input', function(){ search(input.value.trim()); });
  input.addEventListener('focus', function(){ if (input.value.trim().length >= 2) search(input.value.trim()); });
  input.addEventListener('keydown', function(e){
    if (e.key === 'Escape')     { input.value = ''; panel.hidden = true; input.blur(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); selIdx = Math.min(selIdx + 1, rows.length - 1); paintSel(); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); selIdx = Math.max(selIdx - 1, 0); paintSel(); }
    else if (e.key === 'Enter' && selIdx >= 0 && rows[selIdx]) { rows[selIdx].click(); }
  });

  // Cmd/Ctrl-K opens search from anywhere on the page.
  document.addEventListener('keydown', function(e){
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault(); input.focus(); input.select();
    }
  });

  document.addEventListener('click', function(e){
    if (!panel.contains(e.target) && e.target !== input) panel.hidden = true;
  });

})();
