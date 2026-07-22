/**
 * reprodb-search.js — Main search page logic (index.md).
 * Reads data-endpoint URLs from the #search-data-urls element.
 */
(function(){
  var cfg = document.getElementById('search-data-urls').dataset;
  var baseUrl = cfg.baseUrl || '';

  var allData = [];
  var filtered = [];
  var currentPage = 1;
  var pageSize = ReproDB.DEFAULT_PAGE_SIZE;
  var sortField = 'year';
  var sortAsc = false;
  var urlAccessible = {};  // url -> boolean
  var availabilityLoaded = false;
  var availabilityCheckedAt = '';
  var authorProfiles = [];
  var institutionData = [];

  var escHtml = ReproDB.escHtml;

  function normalizeUrl(u) {
    if (u && !u.match(/^https?:\/\//i) && /^10\.\d{4,}\//.test(u)) return 'https://doi.org/' + u;
    return u;
  }

  function normalizeText(s) {
    return (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
  }

  function normalizeBadgeForFilter(v) {
    var t = String(v || '').toLowerCase().replace('badges: ', '').trim();
    if (t === 'reproducible') return 'reproduced';
    if (t === 'artifact evaluated') return 'evaluated';
    return t;
  }

  function extractBadgeKeywords(raw) {
    var matches = String(raw || '').toLowerCase().match(/#[a-z]+/g) || [];
    var seen = {};
    var selected = [];
    matches.forEach(function(tag) {
      var t = tag.replace(/^#/, '');
      if (t === 'reproducible') t = 'reproduced';
      if (['available', 'reproduced', 'functional', 'reusable', 'evaluated'].indexOf(t) !== -1 && !seen[t]) {
        seen[t] = true;
        selected.push(t);
      }
    });
    return selected;
  }

  function stripMagicKeywords(raw) {
    return String(raw || '')
      .replace(/#(unavailable|awarded|github|zenodo|nourl|artifinder|available|reproduced|reproducible|functional|reusable|evaluated)/gi, '')
      .trim();
  }

  function buildSearchIndex(data) {
    data.forEach(function(d) {
      d._search = normalizeText(d.title) + ' ' +
        normalizeText((d.authors || []).join(' ')) + ' ' +
        normalizeText((d.affiliations || []).join(' ')) + ' ' +
        normalizeText(d.conference) + ' ' +
        normalizeText(d.category) + ' ' +
        d.year;
    });
  }

  function populateFilters(data) {
    var years = {}, venues = {};
    data.forEach(function(d) {
      years[d.year] = 1;
      venues[d.conference] = 1;
    });
    var yearSel = document.getElementById('yearFilter');
    Object.keys(years).sort().reverse().forEach(function(y) {
      var opt = document.createElement('option');
      opt.value = y; opt.textContent = y;
      yearSel.appendChild(opt);
    });
    var venueSel = document.getElementById('venueFilter');
    Object.keys(venues).sort().forEach(function(v) {
      var opt = document.createElement('option');
      opt.value = v; opt.textContent = v;
      venueSel.appendChild(opt);
    });
  }

  function doSearch() {
    var raw = document.getElementById('searchBox').value.trim();
    var rawLower = raw.toLowerCase();
    // Parse magic keywords
    var onlyUnavail = rawLower.indexOf('#unavailable') !== -1;
    var onlyAwarded = rawLower.indexOf('#awarded') !== -1;
    var onlyGithub = rawLower.indexOf('#github') !== -1;
    var onlyZenodo = rawLower.indexOf('#zenodo') !== -1;
    var onlyNourl = rawLower.indexOf('#nourl') !== -1;
    var onlyArtifinder = rawLower.indexOf('#artifinder') !== -1;
    var selectedBadges = extractBadgeKeywords(rawLower);
    var cleaned = stripMagicKeywords(raw);
    var query = normalizeText(cleaned);
    var yearVal = document.getElementById('yearFilter').value;
    var venueVal = document.getElementById('venueFilter').value;
    var areaChecks = document.querySelectorAll('.areaCheck');
    var selectedAreas = [];
    areaChecks.forEach(function(cb) { if (cb.checked) selectedAreas.push(cb.value); });
    // If both or neither checked, show all areas; if one checked, filter to it
    var areaVal = selectedAreas.length === 1 ? selectedAreas[0] : '';
    var terms = query.split(/\s+/).filter(function(t) { return t.length > 0; });

    filtered = allData.filter(function(d) {
      if (yearVal && String(d.year) !== yearVal) return false;
      if (venueVal && d.conference !== venueVal) return false;
      if (areaVal && d.category !== areaVal) return false;
      if (onlyUnavail) {
        var artUrls = d.artifact_urls || [];
        var hasUnavail = artUrls.some(function(u) {
          return u && urlAccessible[u.replace(/\/+$/, '')] === false;
        });
        if (!hasUnavail) return false;
      }
      if (onlyAwarded && !d.award) return false;
      if (onlyGithub) {
        var urls = d.artifact_urls || [];
        if (!urls.some(function(u) { return u && u.indexOf('github.com') !== -1; })) return false;
      }
      if (onlyZenodo) {
        var urls2 = d.artifact_urls || [];
        if (!urls2.some(function(u) { return u && u.indexOf('zenodo.org') !== -1; })) return false;
      }
      if (onlyNourl) {
        if (d.artifact_urls && d.artifact_urls.length > 0) return false;
      }
      if (onlyArtifinder) {
        if (!d.artifinder_urls || d.artifinder_urls.length === 0) return false;
      }
      if (selectedBadges.length > 0) {
        var recBadges = (d.badges || []).map(normalizeBadgeForFilter);
        var hasAllSelectedBadges = selectedBadges.every(function(b) {
          return recBadges.indexOf(b) !== -1;
        });
        if (!hasAllSelectedBadges) return false;
      }
      if (terms.length === 0) return true;
      return terms.every(function(t) { return d._search.indexOf(t) !== -1; });
    });

    currentPage = 1;
    doSort();
    updateUrl();
    renderResults();
    ReproDB.trackViewSearchResults({
      searchTerm: cleaned,
      resultsCount: filtered.length,
      context: 'landing'
    });
  }

  function doSort() {
    filtered.sort(function(a, b) {
      var va, vb;
      if (sortField === 'year') { va = a.year; vb = b.year; }
      else if (sortField === 'venue') { va = a.conference; vb = b.conference; }
      else { va = a.title.toLowerCase(); vb = b.title.toLowerCase(); }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
  }

  window.sortResults = function(field, asc) {
    sortField = field;
    sortAsc = asc;
    doSort();
    renderResults();
  };

  function applySortFromSelect() {
    var val = document.getElementById('sortSelect').value;
    var parts = val.split('-');
    var field = parts[0];
    var asc = parts[1] === 'asc';
    sortField = field;
    sortAsc = asc;
    doSort();
    currentPage = 1;
    renderResults();
  }

  window.changePage = function(delta) {
    var maxPage = Math.ceil(filtered.length / pageSize);
    currentPage = Math.max(1, Math.min(maxPage, currentPage + delta));
    renderResults();
  };

  function badgeLabel(b) {
    var t = b.toLowerCase().replace('badges: ', '').trim();
    if (t === 'artifact evaluated') return 'Evaluated';
    if (t === 'available') return 'Available';
    if (t === 'functional') return 'Functional';
    if (t === 'reproduced') return 'Reproduced';
    if (t === 'reusable') return 'Reusable';
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function renderResults() {
    var list = document.getElementById('resultsList');
    var noRes = document.getElementById('noResults');
    var pagination = document.getElementById('pagination');
    var status = document.getElementById('searchStatus');
    var hero = document.getElementById('search-hero');
    var query = document.getElementById('searchBox').value.trim();
    var cleaned = stripMagicKeywords(query);
    var terms = normalizeText(cleaned).split(/\s+/).filter(function(t) { return t.length > 0; });
    var yearVal = document.getElementById('yearFilter').value;
    var venueVal = document.getElementById('venueFilter').value;
    var areaChecks = document.querySelectorAll('.areaCheck');
    var selAreas = [];
    areaChecks.forEach(function(cb) { if (cb.checked) selAreas.push(cb.value); });
    var areaVal = selAreas.length === 1 ? selAreas[0] : '';

    var hasActiveSearch = !!(query || yearVal || venueVal || areaVal);

    // Collapse hero when there are results, expand when idle
    if (hero) hero.classList.toggle('has-results', hasActiveSearch);

    if (!hasActiveSearch) {
      list.classList.add('rdb-hidden');
      noRes.classList.add('rdb-hidden');
      pagination.classList.add('rdb-hidden');
      document.getElementById('profileCards').classList.add('rdb-hidden');
      document.getElementById('profileCards').innerHTML = '';
      status.textContent = allData.length + ' artifacts';
      return;
    }

    var maxPage = Math.ceil(filtered.length / pageSize) || 1;
    var start = (currentPage - 1) * pageSize;
    var pageData = filtered.slice(start, start + pageSize);

    list.innerHTML = '';
    if (filtered.length === 0) {
      list.classList.add('rdb-hidden');
      noRes.classList.remove('rdb-hidden');
      pagination.classList.add('rdb-hidden');
      // Still show profile cards even when no artifact results
      renderProfileCards(query, terms);
      var pcCount = document.getElementById('profileCards').querySelectorAll('.profile-card').length;
      var total = pcCount;
      status.textContent = total + ' result' + (total !== 1 ? 's' : '');
      return;
    }

    // Render profile cards above results
    renderProfileCards(query, terms);

    noRes.classList.add('rdb-hidden');
    pageData.forEach(function(d) {
      var entry = document.createElement('div');
      entry.className = 'rdb-result-entry';

      // Line 1: Bold title (linked to artifact)
      var artUrls = (d.artifact_urls || []).map(normalizeUrl);
      var afTitleUrls = (d.artifinder_urls || []).map(normalizeUrl);
      var titleLink = artUrls.length > 0
        ? artUrls[0]
        : (afTitleUrls[0] || normalizeUrl(d.repository_url || d.artifact_url || ''));
      var titleHtml = titleLink
        ? '<a href="' + escHtml(titleLink) + '" target="_blank" rel="noopener">' + escHtml(d.title) + '</a>'
        : escHtml(d.title);

      // Line 2: Authors (clickable)
      var authorsArr = d.authors || [];
      var authorsHtml = authorsArr.map(function(a) {
        var profileUrl = baseUrl + '/profile.html?name=' + encodeURIComponent(a);
        return '<a href="' + profileUrl + '">' + escHtml(a) + '</a>';
      }).join(', ');
      var authorsLine = authorsHtml || '';

      // Line 3: Venue, Year, Badges
      var badges = (d.badges || []).map(function(b) {
        return '<span class="rdb-badge">' + badgeLabel(b) + '</span>';
      }).join(' ');
      var awardTag = d.award ? ' <span class="rdb-badge rdb-badge--award">🏆 ' + escHtml(d.award) + '</span>' : '';
      var metaLine = escHtml(d.conference) + ' ' + d.year + (badges ? ' &middot; ' + badges : '') + awardTag;

      // Line 4: Links
      var links = [];
      // Paper link: prefer doi_url, fall back to paper_url
      if (d.doi_url) {
        links.push('<a href="' + escHtml(normalizeUrl(d.doi_url)) + '" target="_blank" rel="noopener">📄 Paper</a>');
      } else if (d.paper_url) {
        links.push('<a href="' + escHtml(normalizeUrl(d.paper_url)) + '" target="_blank" rel="noopener">📄 Paper</a>');
      }
      // Artifact URLs (unified list)
      var artUrlList = artUrls;
      if (artUrlList.length === 1) {
        var isGH = artUrlList[0].indexOf('github.com') !== -1;
        var lbl = isGH ? '💻 GitHub' : '📦 Artifact';
        var avail1 = availabilityTag(artUrlList[0]);
        links.push('<a href="' + escHtml(artUrlList[0]) + '" target="_blank" rel="noopener">' + lbl + '</a>' + avail1);
      } else {
        artUrlList.forEach(function(u, i) {
          if (u) {
            var isGH = u.indexOf('github.com') !== -1;
            var lbl = isGH ? '💻 GitHub' : '📦 Artifact';
            if (artUrlList.length > 1) lbl += ' #' + (i+1);
            var availN = availabilityTag(u);
            links.push('<a href="' + escHtml(u) + '" target="_blank" rel="noopener">' + lbl + '</a>' + availN);
          }
        });
      }
      if (d.appendix_url) links.push('<a href="' + escHtml(normalizeUrl(d.appendix_url)) + '" target="_blank" rel="noopener">📋 Appendix</a>');
      // ArtiFinder-discovered links: not manually verified, no badges.
      var afUrls = (d.artifinder_urls || []).map(normalizeUrl);
      afUrls.forEach(function(u) {
        if (!u) return;
        var isGH = u.indexOf('github.com') !== -1;
        var lbl = isGH ? '💻 GitHub' : '📦 Artifact';
        links.push('<a class="artifinder-link" href="' + escHtml(u) + '" target="_blank" rel="noopener">' + lbl + '</a>' + artifinderTag());
      });
      var linksLine = links.length > 0 ? links.join(' &middot; ') : '';

      entry.innerHTML =
        '<div class="rdb-result-title">' + titleHtml + '</div>' +
        (authorsLine ? '<div class="rdb-result-authors">' + authorsLine + '</div>' : '') +
        '<div class="rdb-result-meta">' + metaLine + '</div>' +
        (linksLine ? '<div class="rdb-result-links">' + linksLine + '</div>' : '');

      list.appendChild(entry);
    });

    list.classList.remove('rdb-hidden');
    var profileCount = document.getElementById('profileCards').querySelectorAll('.profile-card').length;
    var totalResults = filtered.length + profileCount;
    status.textContent = totalResults + ' result' + (totalResults !== 1 ? 's' : '');
    pagination.classList.toggle('rdb-hidden', maxPage <= 1);
    document.getElementById('pageInfo').textContent = 'Page ' + currentPage + ' of ' + maxPage;
    document.getElementById('prevBtn').disabled = currentPage <= 1;
    document.getElementById('nextBtn').disabled = currentPage >= maxPage;
  }

  window.downloadResults = function() {
    var exportData = filtered.map(function(d) {
      var e = {title: d.title, conference: d.conference, category: d.category, year: d.year, badges: d.badges, authors: d.authors, affiliations: d.affiliations};
      if (d.doi_url) e.doi_url = d.doi_url;
      if (d.artifact_urls && d.artifact_urls.length) e.artifact_urls = d.artifact_urls;
      if (d.artifinder_urls && d.artifinder_urls.length) e.artifinder_urls = d.artifinder_urls;
      if (d.paper_url) e.paper_url = d.paper_url;
      if (d.appendix_url) e.appendix_url = d.appendix_url;
      if (d.award) e.award = d.award;
      return e;
    });
    var blob = new Blob([JSON.stringify(exportData, null, 2)], {type: 'application/json'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'artifacts_search_results.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  function updateUrl() {
    var params = new URLSearchParams();
    var q = document.getElementById('searchBox').value.trim();
    var year = document.getElementById('yearFilter').value;
    var venue = document.getElementById('venueFilter').value;
    var areaChecks = document.querySelectorAll('.areaCheck');
    var selAreas = [];
    areaChecks.forEach(function(cb) { if (cb.checked) selAreas.push(cb.value); });
    var area = selAreas.length === 1 ? selAreas[0] : '';
    if (q) params.set('q', q);
    if (year) params.set('year', year);
    if (venue) params.set('venue', venue);
    if (area) params.set('area', area);
    var qs = params.toString();
    var newUrl = window.location.pathname + (qs ? '?' + qs : '');
    history.replaceState(null, '', newUrl);
  }

  window.shareSearch = function() {
    var url = window.location.href;
    var btn = document.getElementById('shareBtn');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function() {
        btn.title = 'Copied!';
        setTimeout(function() { btn.title = 'Copy search link'; }, ReproDB.COPIED_FLASH_MS);
      });
    } else {
      var ta = document.createElement('textarea');
      ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      btn.title = 'Copied!';
      setTimeout(function() { btn.title = 'Copy search link'; }, ReproDB.COPIED_FLASH_MS);
    }
  };

  function updateSearchIcon() {
    var hasText = document.getElementById('searchBox').value.length > 0;
    document.getElementById('searchIcon').classList.toggle('rdb-hidden', hasText);
    document.getElementById('clearIcon').classList.toggle('rdb-hidden', !hasText);
  }

  window.clearSearch = function() {
    var box = document.getElementById('searchBox');
    box.value = '';
    box.focus();
    updateSearchIcon();
    doSearch();
  };

  function getInitials(name) {
    var parts = (name || '').split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
    return (name || '?')[0].toUpperCase();
  }

  function renderProfileCards(query, terms) {
    var container = document.getElementById('profileCards');
    if (!terms || terms.length === 0 || query.trim().length < 2) {
      container.classList.add('rdb-hidden');
      container.innerHTML = '';
      return;
    }

    // Score: lower = better. Name-starts-with beats name-contains beats affiliation-only.
    // Uses pre-computed _normName / _normAffil fields for speed.
    function scoreMatch(normName, normAffil) {
      var nameStarts = terms.every(function(t) {
        return normName.split(' ').some(function(w) { return w.indexOf(t) === 0; });
      });
      if (nameStarts) return 0;
      var nameContains = terms.every(function(t) { return normName.indexOf(t) !== -1; });
      if (nameContains) return 1;
      if (normAffil) {
        var fullText = normName + ' ' + normAffil;
        var fullMatch = terms.every(function(t) { return fullText.indexOf(t) !== -1; });
        if (fullMatch) {
          var anyNameHit = terms.some(function(t) { return normName.indexOf(t) !== -1; });
          if (anyNameHit) return 2;
        }
      }
      return -1; // no match
    }

    var candidates = [];
    authorProfiles.forEach(function(p) {
      var s = scoreMatch(p._normName || '', p._normAffil || '');
      if (s >= 0) candidates.push({ type: 'author', data: p, score: s });
    });
    institutionData.forEach(function(inst) {
      var s = scoreMatch(inst._normName || '', '');
      if (s >= 0) candidates.push({ type: 'institution', data: inst, score: s });
    });

    candidates.sort(function(a, b) { return a.score - b.score; });
    candidates = candidates.slice(0, 3);

    if (candidates.length === 0) {
      container.classList.add('rdb-hidden');
      container.innerHTML = '';
      return;
    }

    var html = '<div class="profile-cards-row">';
    candidates.forEach(function(c) {
      if (c.type === 'institution') {
        var inst = c.data;
        var url = baseUrl + '/profile.html?name=' + encodeURIComponent(inst.affiliation) + '&type=institution';
        var caps = (inst.affiliation || '').replace(/[^A-Z]/g, '');
        var initials = caps.length > 0 ? caps.slice(0, 4) : (inst.affiliation || '?')[0].toUpperCase();
        var starsHtml = ReproDBProfile.chairStarsCardInstitution(inst.chair_count);
        html += '<a class="profile-card" href="' + url + '">' +
          '<div class="avatar inst-avatar">' + escHtml(initials) + '</div>' +
          '<div class="card-info">' +
            '<div class="card-name">' + escHtml(inst.affiliation) + '</div>' +
            '<div class="card-detail">' + (inst.author_count || 0) + ' researchers</div>' +
          '</div>' +
          (starsHtml ? '<div class="card-stars">' + starsHtml + '</div>' : '') +
          '</a>';
      } else {
        var p = c.data;
        var cleanN = (p.name || '').replace(/\s+\d{4}$/, '').replace(/\t/g, ' ');
        var url = baseUrl + '/profile.html?name=' + encodeURIComponent(p.name) + (p.author_id != null ? '&id=' + p.author_id : '');
        var starsHtml = ReproDBProfile.chairStarsCard(p.chair_count);
        html += '<a class="profile-card" href="' + url + '">' +
          '<div class="avatar author-avatar">' + escHtml(getInitials(cleanN)) + '</div>' +
          '<div class="card-info">' +
            '<div class="card-name">' + escHtml(cleanN) + '</div>' +
            '<div class="card-detail">' + escHtml(p.affiliation || '') + '</div>' +
          '</div>' +
          (starsHtml ? '<div class="card-stars">' + starsHtml + '</div>' : '') +
          '</a>';
      }
    });
    html += '</div>';
    container.innerHTML = html;
    container.classList.remove('rdb-hidden');
  }

  function availabilityTag(url) {
    if (!availabilityLoaded || !url) return '';
    var normalUrl = url.replace(/\/+$/, '');
    if (urlAccessible[normalUrl] === false) {
      var tip = 'URL may be unavailable (last checked ' + (availabilityCheckedAt || 'recently') + ')';
      return ' <span class="avail-warn">\u26a0 may be unavailable<span class="avail-tip">' + escHtml(tip) + '</span></span>';
    }
    return '';
  }

  function artifinderTag() {
    var logo = baseUrl + '/assets/images/artifinder-logo.svg';
    var tip = 'Found automatically by ArtiFinder — not manually verified by an artifact evaluation committee.';
    return ' <span class="artifinder-tag"><img class="artifinder-logo" src="' + escHtml(logo) +
      '" alt="" aria-hidden="true"> Artifinder<span class="avail-tip">' + escHtml(tip) + '</span></span>';
  }

  /* ── Deferred loaders — fetch after page load to avoid blocking ── */

  function loadProfiles() {
    var p1 = fetch(cfg.authorProfiles)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        authorProfiles = data || [];
        authorProfiles.forEach(function(p) {
          p._normName = normalizeText(p.name);
          p._normAffil = normalizeText(p.affiliation || '');
        });
      })
      .catch(function() { authorProfiles = []; });

    var p2 = fetch(cfg.institutions)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        institutionData = (data || []).filter(function(inst) {
          var a = (inst.affiliation || '').toLowerCase();
          return a && a !== 'unknown' && !a.startsWith('_');
        });
        institutionData.forEach(function(inst) {
          inst._normName = normalizeText(inst.affiliation);
        });
      })
      .catch(function() { institutionData = []; });

    Promise.all([p1, p2]).then(function() {
      // Re-render profile cards if the user is already searching
      if (filtered.length > 0 || document.getElementById('searchBox').value.trim().length >= 2) {
        var raw = document.getElementById('searchBox').value.trim();
        var cleaned = stripMagicKeywords(raw);
        var terms = normalizeText(cleaned).split(/\s+/).filter(function(t) { return t.length > 0; });
        renderProfileCards(raw, terms);
      }
    });
  }

  function loadAvailability() {
    fetch(cfg.availability)
      .then(function(r) { return r.json(); })
      .then(function(avail) {
        availabilityCheckedAt = (avail.summary && avail.summary.checked_at) ? avail.summary.checked_at.replace(/ UTC$/, '') : '';
        (avail.records || []).forEach(function(rec) {
          var u = (rec.url || '').replace(/\/+$/, '');
          if (u) {
            if (rec.accessible === false) urlAccessible[u] = false;
            else if (urlAccessible[u] === undefined) urlAccessible[u] = true;
          }
        });
        availabilityLoaded = true;
        if (filtered.length > 0) renderResults();
      })
      .catch(function() { /* availability data not critical */ });
  }

  /** Schedule supplemental fetches after page load. */
  function deferLoad(fn) {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(fn);
    } else {
      setTimeout(fn, 1);
    }
  }

  window.addEventListener('load', function() {
    deferLoad(loadProfiles);
    deferLoad(loadAvailability);
  });

  /* ── Primary data load — only search_data.json is fetched eagerly ─ */

  fetch(cfg.searchData)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      allData = data;
      buildSearchIndex(data);
      populateFilters(data);
      document.getElementById('searchStatus').textContent = data.length + ' artifacts';

      // Wire up events
      var debounceTimer;
      document.getElementById('searchBox').addEventListener('input', function() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(doSearch, 350);
        updateSearchIcon();
      });

      // Initialize autoComplete.js suggestions dropdown
      if (typeof autoComplete === 'function') {
        var acInstance = new autoComplete({
          selector: '#searchBox',
          wrapper: false,
          threshold: 3,
          debounce: 250,
          data: {
            src: function(query) {
              var q = normalizeText(query);
              var terms = q.split(/\s+/).filter(function(t) { return t.length > 0; });
              if (terms.length === 0) return Promise.resolve([]);
              var results = allData.filter(function(d) {
                return terms.every(function(t) { return d._search.indexOf(t) !== -1; });
              }).slice(0, 8);
              return Promise.resolve(results);
            },
            keys: ['title']
          },
          searchEngine: function(query, record) {
            // Data is already filtered by src; always return the record
            return record;
          },
          resultsList: {
            maxResults: 8,
            noResults: false,
            tabSelect: true
          },
          resultItem: {
            highlight: true,
            element: function(item, data) {
              var d = data.value;
              item.innerHTML =
                '<div style="line-height:1.3">' +
                  '<span>' + escHtml(d.title) + '</span>' +
                  '<br><span class="rdb-ac-year">' + escHtml(String(d.year)) + '</span>' +
                  '<span class="rdb-ac-venue">' + escHtml(d.conference) + '</span>' +
                '</div>';
            }
          },
          events: {
            input: {
              keydown: function(event) {
                // Let Enter submit the full search when no item is selected
                if (event.key === 'Enter' && !document.querySelector('#autoComplete_list_1 [aria-selected="true"]')) {
                  acInstance.close();
                }
              }
            }
          }
        });
        document.getElementById('searchBox').addEventListener('selection', function(event) {
          var selection = event.detail.selection.value;
          document.getElementById('searchBox').value = selection.title;
          updateSearchIcon();
          doSearch();
        });
      }
      document.getElementById('yearFilter').addEventListener('change', doSearch);
      document.getElementById('venueFilter').addEventListener('change', doSearch);
      document.getElementById('sortSelect').addEventListener('change', applySortFromSelect);
      document.querySelectorAll('.areaCheck').forEach(function(cb) {
        cb.addEventListener('change', doSearch);
      });

      // Check URL params for pre-filled search
      var params = new URLSearchParams(window.location.search);
      var hasParam = false;
      if (params.get('q')) {
        document.getElementById('searchBox').value = params.get('q');
        hasParam = true;
      }
      if (params.get('venue')) {
        document.getElementById('venueFilter').value = params.get('venue');
        hasParam = true;
      }
      if (params.get('year')) {
        document.getElementById('yearFilter').value = params.get('year');
        hasParam = true;
      }
      if (params.get('area')) {
        var areaParam = params.get('area');
        document.querySelectorAll('.areaCheck').forEach(function(cb) {
          cb.checked = (cb.value === areaParam);
        });
        hasParam = true;
      }
      if (hasParam) {
        updateSearchIcon();
        doSearch();
      }
    })
    .catch(function(err) {
      document.getElementById('searchStatus').textContent = 'Error loading artifact data.';
      console.error(err);
    });
})();
