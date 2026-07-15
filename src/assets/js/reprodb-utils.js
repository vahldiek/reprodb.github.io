/**
 * reprodb-utils.js — Shared utility functions for ReproDB website.
 *
 * Provides: window.ReproDB.escHtml, .fetchJSON, .isDark, .themeColors,
 *           .echartsTheme, .onThemeChange, .assignDenseRanks, .rankChangeHtml,
 *           .createTable (Tabulator wrapper)
 */
(function() {
  'use strict';
  var R = window.ReproDB = window.ReproDB || {};

  /** Escape HTML to prevent XSS. */
  R.escHtml = function(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(s));
    return d.innerHTML;
  };

  /** Duration (ms) for "Copied!" flash feedback. */
  R.COPIED_FLASH_MS = 1500;

  /** Default rows per page for Tabulator and ranking tables. */
  R.DEFAULT_PAGE_SIZE = 20;

  /** Page-size selector options shown in table footers. */
  R.PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

  /** Fetch JSON with consistent error handling. */
  R._fetchedUrls = [];
  R._pendingFetches = [];
  R.fetchJSON = function(url) {
    if (R._fetchedUrls.indexOf(url) === -1) R._fetchedUrls.push(url);
    var p = fetch(url).then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
      return r.json();
    });
    R._pendingFetches.push(p);
    return p;
  };

  /* ─── Dark-mode theme helpers ─────────────────────────────────────── */

  R.isDark = function() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t === 'dark') return true;
    if (t === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  };

  R.themeColors = function() {
    var dark = R.isDark();
    return {
      text:       dark ? '#d6d9dc' : '#333',
      textMuted:  dark ? '#aab0b8' : '#666',
      line:       dark ? '#d6d9dc' : '#333',
      grid:       dark ? '#383c43' : '#e0e0e0',
      border:     dark ? '#4a4f57' : '#ddd',
      bg:         dark ? '#1e2127' : '#fff',
      totalLine:  dark ? '#aab0b8' : '#333',
      totalBar:   dark ? 'rgba(170,176,184,0.7)' : 'rgba(51,51,51,0.7)',
      combined:   dark ? '#7fb3d3' : '#2c3e50',
      separator:  dark ? '#6b7280' : '#999'
    };
  };

  /** Build an ECharts theme object for the current light/dark mode. */
  R.echartsTheme = function() {
    var tc = R.themeColors();
    return {
      backgroundColor: 'transparent',
      textStyle: { color: tc.text },
      title: { textStyle: { color: tc.text }, subtextStyle: { color: tc.textMuted } },
      legend: { textStyle: { color: tc.text } },
      categoryAxis: {
        axisLine: { lineStyle: { color: tc.grid } },
        axisTick: { lineStyle: { color: tc.grid } },
        axisLabel: { color: tc.text },
        splitLine: { lineStyle: { color: tc.grid } }
      },
      valueAxis: {
        axisLine: { lineStyle: { color: tc.grid } },
        axisTick: { lineStyle: { color: tc.grid } },
        axisLabel: { color: tc.text },
        splitLine: { lineStyle: { color: tc.grid } }
      },
      tooltip: {
        backgroundColor: R.isDark() ? '#2a2d34' : '#fff',
        borderColor: tc.border,
        textStyle: { color: tc.text }
      }
    };
  };

  /** Convenience: init an ECharts instance with theme and auto-resize. */
  R.initEChart = function(el) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (!el) return null;
    // Dispose any existing instance on this element so re-renders start from
    // a clean slate. echarts.init otherwise returns the existing instance, and
    // a subsequent setOption() merges by default — leaving stale series/data
    // (e.g. a previous profile's "AE Committee Service" bars) behind when
    // switching between people on the profile page.
    var existing = echarts.getInstanceByDom(el);
    if (existing) existing.dispose();
    var chart = echarts.init(el, null, { renderer: 'canvas' });

    // Wrap setOption so every call automatically re-applies theme text
    // colors to title and legend.  ECharts replaces (rather than deep-
    // merges) textStyle inside title/legend components, so any caller
    // that sets e.g. { title: { textStyle: { fontSize: 14 } } } would
    // otherwise wipe the color.
    var _origSetOption = chart.setOption.bind(chart);
    chart.setOption = function(opts, notMerge, lazyUpdate) {
      _origSetOption(opts, notMerge, lazyUpdate);
      var tc = R.themeColors();
      var patch = {};
      var cur = chart.getOption();
      if (cur.legend && cur.legend.length) {
        patch.legend = cur.legend.map(function() { return { textStyle: { color: tc.text } }; });
      }
      if (cur.title && cur.title.length) {
        patch.title = cur.title.map(function() {
          return { textStyle: { color: tc.text }, subtextStyle: { color: tc.textMuted } };
        });
      }
      if (patch.legend || patch.title) _origSetOption(patch);
    };

    // Apply theme colors so first render matches current light/dark mode
    var theme = R.echartsTheme();
    _origSetOption({
      textStyle: theme.textStyle,
      title: theme.title,
      legend: theme.legend,
      tooltip: theme.tooltip
    });
    // Auto-resize (debounced to avoid cascading layout thrashing)
    var resizeTimer;
    var ro = new ResizeObserver(function() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function() { chart.resize(); }, 100);
    });
    ro.observe(el);

    // Clean up ResizeObserver when chart is disposed
    var _origDispose = chart.dispose.bind(chart);
    chart.dispose = function() { ro.disconnect(); return _origDispose(); };

    return chart;
  };

  /* ─── Theme change listener ───────────────────────────────────────── */

  var themeCallbacks = [];
  R.onThemeChange = function(fn) { themeCallbacks.push(fn); };
  var echartsInstances = [];
  R.registerEChart = function(chart) {
    echartsInstances.push(chart);
  };

  window.addEventListener('reprodb-theme-change', function() {
    // Update ECharts instances
    var theme = R.echartsTheme();
    echartsInstances.forEach(function(chart) {
      if (chart && !chart.isDisposed()) {
        var opt = chart.getOption();
        // Merge theme colors into existing options
        chart.setOption({
          textStyle: theme.textStyle,
          title: opt.title ? [theme.title] : undefined,
          legend: opt.legend ? (opt.legend).map(function(l) {
            return { textStyle: theme.legend.textStyle };
          }) : undefined,
          tooltip: theme.tooltip,
          xAxis: (opt.xAxis || []).map(function() {
            return { axisLine: theme.categoryAxis.axisLine, axisTick: theme.categoryAxis.axisTick,
                     axisLabel: theme.categoryAxis.axisLabel, splitLine: theme.categoryAxis.splitLine };
          }),
          yAxis: (opt.yAxis || []).map(function() {
            return { axisLine: theme.valueAxis.axisLine, axisTick: theme.valueAxis.axisTick,
                     axisLabel: theme.valueAxis.axisLabel, splitLine: theme.valueAxis.splitLine };
          })
        });
      }
    });
    // Fire page-specific callbacks
    themeCallbacks.forEach(function(fn) { fn(); });
  });

  /* ─── Shared color palette ──────────────────────────────────────── */

  R.COLORS = {
    systems:      '#2980b9',
    security:     '#c0392b',
    both:         '#8e44ad',
    badges: {
      evaluated:    '#95a5a6',
      available:    '#27ae60',
      functional:   '#2980b9',
      reproducible: '#8e44ad',
      reusable:     '#e67e22'
    }
  };

  /* ─── Debounce utility ────────────────────────────────────────────── */

  R.DEBOUNCE_MS = 200;

  R.debounce = function(fn, ms) {
    var timer;
    return function() {
      var ctx = this, args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function() { fn.apply(ctx, args); }, ms || R.DEBOUNCE_MS);
    };
  };

  /* ─── Profile URL builder ─────────────────────────────────────────── */

  R.profileUrl = function(baseUrl, name, opts) {
    var url = (baseUrl || '') + '/profile.html?name=' + encodeURIComponent(name);
    if (opts && opts.id != null) url += '&id=' + opts.id;
    if (opts && opts.type) url += '&type=' + encodeURIComponent(opts.type);
    return url;
  };

  /* ─── Analytics helpers (GA4) ───────────────────────────────────── */

  // Avoid flooding GA when the same search term is emitted repeatedly
  // (e.g., URL updates and debounced input landing in close succession).
  R._lastSearchEvent = { key: '', ts: 0 };

  /**
   * Emit a GA4 site-search signal for client-side (SPA-like) searches.
   * opts.searchTerm   (required)  - user-entered query string
   * opts.resultsCount (optional)  - number of matched results
   * opts.context      (optional)  - logical source (landing/profile)
   */
  R.trackViewSearchResults = function(opts) {
    if (typeof window.gtag !== 'function') return false;
    opts = opts || {};

    var searchTerm = (opts.searchTerm || '').trim();
    if (!searchTerm) return false;

    var context = (opts.context || 'search').trim();
    var key = context + '|' + searchTerm.toLowerCase();
    var now = Date.now();
    if (R._lastSearchEvent.key === key && now - R._lastSearchEvent.ts < 1500) return false;
    R._lastSearchEvent = { key: key, ts: now };

    var eventParams = { search_term: searchTerm };
    if (opts.resultsCount != null) {
      var n = Number(opts.resultsCount);
      if (!isNaN(n)) eventParams.results_count = n;
    }
    if (context) eventParams.search_context = context;

    window.gtag('event', 'view_search_results', eventParams);

    // In SPA flows, URL changes via history API do not automatically create
    // page_view events; send one so GA4 reports align with the current URL.
    window.gtag('event', 'page_view', {
      page_title: document.title,
      page_location: window.location.href,
      page_path: window.location.pathname + window.location.search
    });

    return true;
  };

  /* ─── Country / continent geo maps (shared across pages) ──────────── */

  R.CODE_TO_NAME = {
    US:'United States',CN:'China',JP:'Japan',GB:'United Kingdom',
    DE:'Germany',FR:'France',CA:'Canada',AU:'Australia',IN:'India',
    SG:'Singapore',KR:'South Korea',CH:'Switzerland',NL:'Netherlands',
    SE:'Sweden',NO:'Norway',DK:'Denmark',FI:'Finland',BE:'Belgium',
    AT:'Austria',IL:'Israel',IT:'Italy',ES:'Spain',PT:'Portugal',
    GR:'Greece',HK:'Hong Kong',TW:'Taiwan',TH:'Thailand',BR:'Brazil',
    MX:'Mexico',AR:'Argentina',CL:'Chile',IE:'Ireland',NZ:'New Zealand',
    ZA:'South Africa',RU:'Russia',UA:'Ukraine',PL:'Poland',RO:'Romania',
    CZ:'Czechia',HU:'Hungary',TR:'Turkey',PK:'Pakistan',MY:'Malaysia',
    ID:'Indonesia',VN:'Vietnam',PH:'Philippines',BD:'Bangladesh',
    LK:'Sri Lanka',IR:'Iran',SA:'Saudi Arabia',AE:'United Arab Emirates',
    EG:'Egypt',KE:'Kenya',NG:'Nigeria',MA:'Morocco',CO:'Colombia',
    PE:'Peru',VE:'Venezuela',RW:'Rwanda',QA:'Qatar',LU:'Luxembourg',CY:'Cyprus',
    BG:'Bulgaria',CI:'Ivory Coast',EE:'Estonia',ET:'Ethiopia',
    GH:'Ghana',HR:'Croatia',IQ:'Iraq',JO:'Jordan',LB:'Lebanon',
    LI:'Liechtenstein',LR:'Liberia',MO:'Macau',MT:'Malta',PA:'Panama',
    SY:'Syria',UG:'Uganda',UZ:'Uzbekistan',ZW:'Zimbabwe'
  };

  R.CODE_TO_CONTINENT = {
    US:'North America',CA:'North America',MX:'North America',PA:'North America',
    CN:'Asia',JP:'Asia',KR:'Asia',SG:'Asia',IN:'Asia',TW:'Asia',
    HK:'Asia',TH:'Asia',PK:'Asia',MY:'Asia',ID:'Asia',VN:'Asia',
    PH:'Asia',BD:'Asia',LK:'Asia',IR:'Asia',SA:'Asia',AE:'Asia',
    IQ:'Asia',JO:'Asia',LB:'Asia',MO:'Asia',QA:'Asia',SY:'Asia',UZ:'Asia',
    GB:'Europe',DE:'Europe',FR:'Europe',CH:'Europe',NL:'Europe',
    SE:'Europe',NO:'Europe',DK:'Europe',FI:'Europe',BE:'Europe',
    AT:'Europe',IL:'Europe',IT:'Europe',ES:'Europe',PT:'Europe',
    GR:'Europe',IE:'Europe',RU:'Europe',UA:'Europe',PL:'Europe',
    RO:'Europe',CZ:'Europe',HU:'Europe',TR:'Europe',
    BG:'Europe',CY:'Europe',EE:'Europe',HR:'Europe',LI:'Europe',
    LU:'Europe',MT:'Europe',
    AU:'Oceania',NZ:'Oceania',
    BR:'South America',AR:'South America',CL:'South America',
    CO:'South America',PE:'South America',VE:'South America',
    ZA:'Africa',KE:'Africa',NG:'Africa',MA:'Africa',EG:'Africa',
    CI:'Africa',ET:'Africa',GH:'Africa',LR:'Africa',RW:'Africa',
    UG:'Africa',ZW:'Africa'
  };

  R.flagHtml = function(code) {
    if (!code || code.length !== 2) return '';
    return '<span class="fi fi-' + code.toLowerCase() + '" title="' + (R.CODE_TO_NAME[code] || code) + '"></span> ';
  };

  /* ─── Ranking helpers (used by ranking table formatters) ──────────── */

  R.assignDenseRanks = function(items, nameKey) {
    // Pre-compute sort keys to avoid repeated toLowerCase in comparator
    var n = items.length;
    for (var k = 0; k < n; k++) {
      items[k]._sortName = (items[k][nameKey] || '').toLowerCase();
    }
    var sorted = items.slice();
    sorted.sort(function(a, b) {
      var av = a.combined_score || 0, bv = b.combined_score || 0;
      if (av !== bv) return bv - av;
      if (a._sortName < b._sortName) return -1;
      if (a._sortName > b._sortName) return 1;
      return 0;
    });
    var rank = 1;
    for (var i = 0; i < n; i++) {
      if (i > 0 && (sorted[i].combined_score || 0) < (sorted[i - 1].combined_score || 0)) rank++;
      sorted[i]._baseRank = rank;
    }
  };

  R.rankChangeHtml = function(baseRank, oldRank) {
    if (!baseRank || oldRank == null) return '';
    var diff = oldRank - baseRank;
    if (diff > 0) return '<span class="rdb-rank-up" title="Up ' + diff + ' from #' + oldRank + '">\u25B2' + diff + '</span>';
    if (diff < 0) return '<span class="rdb-rank-down" title="Down ' + (-diff) + ' from #' + oldRank + '">\u25BC' + (-diff) + '</span>';
    return '<span class="rank-unchanged" title="Unchanged">\u2013</span>';
  };

  /* ─── Tabulator helper ────────────────────────────────────────────── */

  /**
   * Create a Tabulator instance with ReproDB default settings.
   *
   * @param {string|HTMLElement} el - selector or element
   * @param {object} opts - Tabulator options (columns, data, etc.)
   * @returns {Tabulator}
   */
  R.createTable = function(el, opts) {
    if (typeof Tabulator === 'undefined') {
      throw new Error('Tabulator not loaded yet — ensure createTable is called after DOMContentLoaded');
    }
    /* Auto-size pagination: only show selector options ≤ data length,
       and default to the largest option that fits. */
    var dataLen = (opts.data || []).length;
    var sizeOpts = dataLen > 0
      ? R.PAGE_SIZE_OPTIONS.filter(function(s) { return s <= dataLen; })
      : R.PAGE_SIZE_OPTIONS.slice();
    if (sizeOpts.length === 0) sizeOpts = [R.PAGE_SIZE_OPTIONS[0]];
    var effectiveSize = sizeOpts.indexOf(R.DEFAULT_PAGE_SIZE) >= 0
      ? R.DEFAULT_PAGE_SIZE
      : sizeOpts[sizeOpts.length - 1];
    var defaults = {
      layout: 'fitColumns',
      pagination: true,
      paginationSize: effectiveSize,
      paginationSizeSelector: sizeOpts,
      paginationCounter: 'rows',
      movableColumns: false,
      placeholder: 'No data available',
      headerSortClickElement: 'header'
    };
    var merged = Object.assign({}, defaults, opts);
    /* Remove caller's paginationSize — use the computed one unless
       pagination is explicitly disabled. */
    if (!opts.paginationSize) {
      merged.paginationSize = effectiveSize;
      merged.paginationSizeSelector = sizeOpts;
    }
    return new Tabulator(el, merged);
  };

  /* ─── Shared ranking table mixin ─────────────────────────────────── */

  /**
   * Base methods shared by combined + institution ranking tables.
   * Call R.rankingMixin(target) to mix into an Alpine component object.
   *
   * Manual pagination: we handle sorting, filtering and slicing in JS,
   * and feed Tabulator only the current page (~50 rows) via replaceData().
   * This keeps every operation O(pageSize) regardless of total dataset size.
   *
   * The target MUST define: _buildColumns(), _processData(), _matchesFilter(row)
   * and should define _initTableHook(data) for table-specific init logic.
   *
   * Optional hooks:
   *   _dataUrls        — { all, systems, security } URL map (REQUIRED)
   *   _onDataLoaded(data, area) — transform fetched data before caching
   */
  R.rankingMixin = function(target) {
    // Heavy data lives OUTSIDE Alpine's reactive proxy to avoid
    // O(n) proxy-trap overhead on every property access.
    var _store = {
      dataCache: {},       // area → raw JSON array
      rowCache: {},        // area → processed row array
      filteredCache: null, // current filtered+sorted rows
      allData: [],         // raw data for current area
      prevSnapshot: null,  // history snapshot for rank-change
      yearColumns: [],     // extracted year columns
      columns: null,       // column definitions from _buildColumns
      tbody: null          // <tbody> element for direct HTML rendering
    };

    var base = {
      area: 'all',
      areaSystems: true,
      areaSecurity: true,
      contribArtifacts: true,
      contribAE: true,
      contribFilter: 'both',
      _searchTimer: null,
      _tableReady: false,
      _page: 1,
      _pageSize: R.DEFAULT_PAGE_SIZE,
      _sortCol: null,
      _sortDir: 'desc',
      totalPages: 1,
      totalRows: 0,
      loaded: false,
      loadingMsg: 'Loading data…',

      /* ── lifecycle ─────────────────────────────────────────────── */

      boot: function() {
        var self = this;
        /* Apply ?area= URL parameter if present */
        var params = new URLSearchParams(window.location.search);
        var areaParam = params.get('area');
        if (areaParam === 'systems') {
          this.areaSystems = true;
          this.areaSecurity = false;
          this.area = 'systems';
        } else if (areaParam === 'security') {
          this.areaSystems = false;
          this.areaSecurity = true;
          this.area = 'security';
        }
        var contribParam = params.get('contrib');
        if (contribParam === 'artifacts') {
          this.contribArtifacts = true;
          this.contribAE = false;
          this.contribFilter = 'artifacts_only';
        } else if (contribParam === 'ae') {
          this.contribArtifacts = false;
          this.contribAE = true;
          this.contribFilter = 'ae_only';
        }
        var el = this.$refs.loading;
        if ('IntersectionObserver' in window && el) {
          var io = new IntersectionObserver(function(entries) {
            for (var i = 0; i < entries.length; i++) {
              if (entries[i].isIntersecting) { io.disconnect(); self._doLoad(); break; }
            }
          }, { rootMargin: '300px 0px' });
          io.observe(el);
        } else {
          this._doLoad();
        }
      },

      _doLoad: function() {
        _store._alpineRef = this;
        this.loadArea();
        this._loadHistory();
      },

      onAreaChange: function() {
        if (this.areaSystems && this.areaSecurity) this.area = 'all';
        else if (this.areaSystems) this.area = 'systems';
        else if (this.areaSecurity) this.area = 'security';
        else this.area = 'all';
        this.loadArea();
      },

      /* ── data loading ──────────────────────────────────────────── */

      loadArea: function() {
        var self = this;
        if (_store.rowCache[this.area]) {
          this._swapData(_store.rowCache[this.area]);
          return;
        }
        if (_store.dataCache[this.area]) {
          this._initTable(_store.dataCache[this.area]);
          return;
        }
        if (!_store.tbody) {
          this.loaded = false;
          this.loadingMsg = 'Loading ' + this.area + ' ranking data\u2026';
        }
        R.fetchJSON(this._dataUrls[this.area])
          .then(function(data) {
            if (self._onDataLoaded) self._onDataLoaded(data, self.area);
            _store.dataCache[self.area] = data;
            self._initTable(data);
            self._prefetchAreaFiles();
          })
          .catch(function(e) { self.loadingMsg = 'Failed to load data: ' + e; });
      },

      _prefetchAreaFiles: function() {
        var self = this;
        var areas = ['all', 'systems', 'security'];
        areas.forEach(function(a) {
          if (_store.dataCache[a]) return;
          R.fetchJSON(self._dataUrls[a]).then(function(data) {
            if (self._onDataLoaded) self._onDataLoaded(data, a);
            _store.dataCache[a] = data;
            self._prefetchOtherAreas();
          }).catch(function(e) { console.error('Prefetch failed for ' + a + ':', e); });
        });
      },

      _loadHistory: function() {
        var url = this._historyUrl;
        if (!url) return;
        fetch(url).then(function(r) { return r.json(); }).catch(function() { return []; })
          .then(function(h) {
            if (h && h.length >= 2) {
              _store.prevSnapshot = h[h.length - 2].entries;
              // Re-render to pick up rank-change indicators
              if (_store.tbody && _store.filteredCache) {
                var self2 = _store._alpineRef;
                if (self2 && self2._tableReady) self2._renderPage();
              }
            }
          });
      },

      /* ── manual pagination helpers ────────────────────────────── */

      /** Sort rows in place by _sortCol / _sortDir. */
      _sortRows: function(rows) {
        var col = this._sortCol || this._sortField || 'combined_score';
        var dir = this._sortDir === 'asc' ? 1 : -1;
        rows.sort(function(a, b) {
          var va = a[col], vb = b[col];
          if (va == null) return 1;
          if (vb == null) return -1;
          if (typeof va === 'string') return dir * va.localeCompare(vb);
          return dir * (va - vb);
        });
      },

      /** Slice _filteredCache for current page and render as HTML. */
      _renderPage: function() {
        var fc = _store.filteredCache;
        this.totalRows = fc ? fc.length : 0;
        this.totalPages = Math.max(1, Math.ceil(this.totalRows / this._pageSize));
        if (this._page > this.totalPages) this._page = this.totalPages;
        if (this._page < 1) this._page = 1;
        var start = (this._page - 1) * this._pageSize;
        var slice = fc ? fc.slice(start, start + this._pageSize) : [];
        if (!_store.tbody || !this._tableReady) return;
        var t0 = performance.now();
        var cols = _store.columns;
        var html = '';
        for (var r = 0; r < slice.length; r++) {
          var row = slice[r];
          html += '<tr>';
          for (var c = 0; c < cols.length; c++) {
            var col = cols[c];
            var val = row[col.field];
            var content;
            if (col.formatter) {
              var proxy = {
                getValue: function() { return val; },
                getRow: function() { return { getData: function() { return row; } }; }
              };
              content = col.formatter(proxy);
            } else {
              content = val != null ? R.escHtml(String(val)) : '';
            }
            html += '<td>' + content + '</td>';
          }
          html += '</tr>';
        }
        var t1 = performance.now();
        _store.tbody.innerHTML = html;
        var t2 = performance.now();
        console.log('[ReproDB ' + this.area + '] _renderPage: build=' + (t1 - t0).toFixed(1) + 'ms DOM=' + (t2 - t1).toFixed(1) + 'ms (' + slice.length + ' rows, page ' + this._page + '/' + this.totalPages + ')');
      },

      goPage: function(p) {
        p = parseInt(p) || 1;
        p = Math.max(1, Math.min(p, this.totalPages));
        if (p === this._page) return;
        this._page = p;
        this._renderPage();
      },
      nextPage: function() { this.goPage(this._page + 1); },
      prevPage: function() { this.goPage(this._page - 1); },

      setPageSize: function(size) {
        this._pageSize = parseInt(size) || R.DEFAULT_PAGE_SIZE;
        this._page = 1;
        this._renderPage();
      },

      /* ── swap data (area switch) ───────────────────────────────── */

      _swapData: function(rows) {
        var t0 = performance.now();
        this._filterRankAndCache(rows);
        this._page = 1;
        this._renderPage();
        console.log('[ReproDB ' + this.area + '] _swapData: ' + (performance.now() - t0).toFixed(1) + 'ms (' + rows.length + ' rows, ' + _store.filteredCache.length + ' filtered)');
      },

      /* ── init table ────────────────────────────────────────────── */

      _initTable: function(data) {
        var t0 = performance.now();
        if (this._initTableHook) this._initTableHook(data);

        // Extract year columns
        var yrs = {};
        _store.allData.forEach(function(d) {
          if (d.years) Object.keys(d.years).forEach(function(y) { yrs[y] = true; });
        });
        _store.yearColumns = Object.keys(yrs).map(function(y) { return parseInt(y) || y; })
          .sort(function(a, b) { return b - a; });

        var t1 = performance.now();
        R.assignDenseRanks(_store.allData, this._rankKey || 'name');
        var t2 = performance.now();

        var rows = this._processData();
        var t3 = performance.now();
        _store.rowCache[this.area] = rows;

        // Apply initial filter + sort + rank
        this._filterRankAndCache(rows);

        if (_store.tbody) {
          // Table exists — just render page 1 with new filtered data
          this._page = 1;
          this._renderPage();
        } else {
          var cols = this._buildColumns();
          _store.columns = cols;
          var self = this;
          var tableEl = this.$refs.tableWrap.querySelector('[data-table]');

          // Build a plain HTML <table> — no Tabulator overhead.
          var headerHtml = '<table class="rdb-table"><thead><tr>';
          for (var ci = 0; ci < cols.length; ci++) {
            var col = cols[ci];
            var style = '';
            if (col.width) style = 'width:' + col.width + 'px;min-width:' + col.width + 'px;max-width:' + col.width + 'px;';
            else if (col.minWidth) style = 'min-width:' + col.minWidth + 'px;';
            var tip = col.tooltip ? ' title="' + col.tooltip.replace(/"/g, '&quot;') + '"' : '';
            headerHtml += '<th data-field="' + (col.field || '') + '"' + tip
              + ' style="' + style + '" class="rdb-sortable">' + col.title + '</th>';
          }
          headerHtml += '</tr></thead><tbody></tbody></table>';
          tableEl.innerHTML = headerHtml;
          _store.tbody = tableEl.querySelector('tbody');

          // Header click → manual sort
          var ths = tableEl.querySelectorAll('th[data-field]');
          for (var hi = 0; hi < ths.length; hi++) {
            ths[hi].addEventListener('click', function() {
              var field = this.getAttribute('data-field');
              if (!field) return;
              if (field === self._sortCol) {
                self._sortDir = self._sortDir === 'desc' ? 'asc' : 'desc';
              } else {
                self._sortCol = field;
                self._sortDir = 'desc';
              }
              self._sortRows(_store.filteredCache);
              self._page = 1;
              self._renderPage();
            });
          }

          self._tableReady = true;
          self._renderPage();
        }
        var t4 = performance.now();
        this.loaded = true;

        console.log('[ReproDB ' + this.area + '] _initTable: prep=' + (t1 - t0).toFixed(1) + 'ms rank=' + (t2 - t1).toFixed(1) + 'ms process=' + (t3 - t2).toFixed(1) + 'ms DOM=' + (t4 - t3).toFixed(1) + 'ms total=' + (t4 - t0).toFixed(1) + 'ms (' + rows.length + ' rows)');

        this._prefetchOtherAreas();
      },

      /**
       * Pre-process remaining areas during idle time so switching
       * hits the _rowCache fast path immediately.
       */
      _prefetchOtherAreas: function() {
        var self = this;
        var areas = ['all', 'systems', 'security'];
        var pending = areas.filter(function(a) { return !_store.rowCache[a] && _store.dataCache[a]; });
        if (!pending.length) return;

        var schedule = window.requestIdleCallback || function(cb) { setTimeout(cb, 50); };
        var idx = 0;
        function processNext() {
          if (idx >= pending.length) return;
          var area = pending[idx++];
          var savedArea = self.area;
          var savedAllData = _store.allData;
          var savedYears = _store.yearColumns;
          self.area = area;
          if (self._initTableHook) self._initTableHook(_store.dataCache[area]);
          var yrs = {};
          _store.allData.forEach(function(d) {
            if (d.years) Object.keys(d.years).forEach(function(y) { yrs[y] = true; });
          });
          _store.yearColumns = Object.keys(yrs).map(function(y) { return parseInt(y) || y; })
            .sort(function(a, b) { return b - a; });
          R.assignDenseRanks(_store.allData, self._rankKey || 'name');
          _store.rowCache[area] = self._processData();
          self.area = savedArea;
          _store.allData = savedAllData;
          _store.yearColumns = savedYears;
          schedule(processNext);
        }
        schedule(processNext);
      },

      /* ── filtering ─────────────────────────────────────────────── */

      /**
       * Filter rows through _matchesFilter.
       */
      _applyFilterToRows: function(rows) {
        var self = this;
        return rows.filter(function(d) { return self._matchesFilter(d); });
      },

      /**
       * Re-assign dense ranks based on the active score field.
       * Operates on the provided array of rows (mutates _rank in place).
       */
      _assignViewRanks: function(rows) {
        if (!rows || !rows.length) return;
        var scoreField = this._sortCol || this._sortField || 'combined_score';
        // Sort a copy by score desc + name asc for ranking
        var ranked = rows.slice().sort(function(a, b) {
          var av = a[scoreField] || 0, bv = b[scoreField] || 0;
          if (av !== bv) return bv - av;
          var an = a._nameLower || a._affLower || '', bn = b._nameLower || b._affLower || '';
          return an < bn ? -1 : an > bn ? 1 : 0;
        });
        var rank = 1;
        for (var i = 0; i < ranked.length; i++) {
          if (i > 0 && (ranked[i][scoreField] || 0) < (ranked[i - 1][scoreField] || 0)) rank++;
          ranked[i]._rank = rank;
        }
      },

      /**
       * Two-phase filter: rank on structural filters, then narrow by search.
       * Sets _store.filteredCache and sorts it.
       */
      _filterRankAndCache: function(rows) {
        // Phase 1: structural filters (everything except search) → rank
        var savedSearch = this.$refs.searchInput ? this.$refs.searchInput.value : '';
        if (this.$refs.searchInput) this.$refs.searchInput.value = '';
        var structural = this._applyFilterToRows(rows);
        if (this.$refs.searchInput) this.$refs.searchInput.value = savedSearch;
        this._assignViewRanks(structural);

        // Phase 2: narrow by search (ranks already set on row objects)
        var searchVal = savedSearch.trim().toLowerCase();
        if (searchVal) {
          _store.filteredCache = structural.filter(function(d) {
            return (d._nameLower && d._nameLower.indexOf(searchVal) >= 0) ||
                   (d._displayNameLower && d._displayNameLower.indexOf(searchVal) >= 0) ||
                   (d._affLower && d._affLower.indexOf(searchVal) >= 0) ||
                   (d._countryLower && d._countryLower.indexOf(searchVal) >= 0);
          });
        } else {
          _store.filteredCache = structural;
        }
        this._sortRows(_store.filteredCache);
      },

      /**
       * Called when filters change — re-filter cached rows and refresh.
       */
      applyFilters: function() {
        var rows = _store.rowCache[this.area];
        if (!rows || !this._tableReady) return;
        this._filterRankAndCache(rows);
        this._page = 1;
        this._renderPage();
      },

      /* ── contribution filter ───────────────────────────────────── */

      onContribChange: function() {
        if (this.contribArtifacts && this.contribAE) this.contribFilter = 'both';
        else if (this.contribArtifacts) this.contribFilter = 'artifacts_only';
        else if (this.contribAE) this.contribFilter = 'ae_only';
        else this.contribFilter = 'both';
        var sortField = this.contribFilter === 'artifacts_only' ? 'artifact_score' :
                        this.contribFilter === 'ae_only' ? 'ae_score' : 'combined_score';
        this._sortCol = sortField;
        this._sortDir = 'desc';
        this.applyFilters();
      },

      /* ── search ────────────────────────────────────────────────── */

      onSearchInput: function() {
        var self = this;
        clearTimeout(this._searchTimer);
        this._searchTimer = setTimeout(function() { self.applyFilters(); }, R.DEBOUNCE_MS);
      }
    };

    // Mix base into target (target overrides take precedence)
    for (var key in base) {
      if (base.hasOwnProperty(key) && !target.hasOwnProperty(key)) {
        target[key] = base[key];
      }
    }

    // Install getter/setter proxies that redirect heavy data
    // properties to the non-reactive _store closure.  Alpine's
    // Object.assign doesn't copy accessor descriptors, but Alpine 3
    // respects defineProperty on the data object returned from x-data.
    var storeProps = {
      allData:      { get: function() { return _store.allData; },      set: function(v) { _store.allData = v; },      enumerable: true, configurable: true },
      yearColumns:  { get: function() { return _store.yearColumns; },  set: function(v) { _store.yearColumns = v; },  enumerable: true, configurable: true },
      prevSnapshot: { get: function() { return _store.prevSnapshot; }, set: function(v) { _store.prevSnapshot = v; }, enumerable: true, configurable: true },
      _dataCache:   { get: function() { return _store.dataCache; },    enumerable: true, configurable: true },
      _rowCache:    { get: function() { return _store.rowCache; },     enumerable: true, configurable: true }
    };
    Object.defineProperties(target, storeProps);

    return target;
  };

  /**
   * Promise that resolves when deferred CDN scripts (Tabulator, ECharts)
   * are available.  Deferred scripts execute before DOMContentLoaded, so
   * waiting for that event guarantees they are ready.
   */
  R.ready = new Promise(function(resolve) {
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
      resolve();
    } else {
      document.addEventListener('DOMContentLoaded', resolve);
    }
  });
})();
