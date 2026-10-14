(function () {
  var grid = document.getElementById('game-grid');
  if (!grid) return;

  var cards = Array.prototype.slice.call(grid.querySelectorAll('.card'));
  var search = document.getElementById('game-search');
  var countEl = document.getElementById('result-count');
  var chips = Array.prototype.slice.call(document.querySelectorAll('.chip'));

  var state = { col: 'All', cat: 'All', dev: 'All', q: '' };

  function apply() {
    var shown = 0;
    cards.forEach(function (card) {
      var col = card.getAttribute('data-col');
      var cat = card.getAttribute('data-cat');
      var dev = card.getAttribute('data-dev');
      var hay = card.getAttribute('data-search') || '';
      var okCol = state.col === 'All' || col === state.col;
      var okCat = state.cat === 'All' || cat === state.cat;
      var okDev = state.dev === 'All' || dev === state.dev;
      var okQ = !state.q || hay.indexOf(state.q) !== -1;
      var ok = okCol && okCat && okDev && okQ;
      card.style.display = ok ? '' : 'none';
      if (ok) shown++;
    });
    if (countEl) {
      countEl.textContent = shown + (shown === 1 ? ' project' : ' projects') + ' shown';
    }
    // analytics.js (when a GA4 ID is configured) reads this for the
    // game_search event's result_count — one attribute, no shared state.
    if (search) search.dataset.results = String(shown);
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      var group = chip.getAttribute('data-group');
      var value = chip.getAttribute('data-value');
      chips.forEach(function (c) {
        if (c.getAttribute('data-group') === group) c.classList.remove('active');
      });
      chip.classList.add('active');
      if (group === 'col') state.col = value;
      if (group === 'cat') state.cat = value;
      if (group === 'dev') state.dev = value;
      apply();
    });
  });

  if (search) {
    search.addEventListener('input', function () {
      state.q = search.value.trim().toLowerCase();
      apply();
    });
  }

  apply();
})();
