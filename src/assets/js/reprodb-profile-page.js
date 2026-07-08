/**
 * reprodb-profile-page.js — Unified profile page (author + institution).
 * Uses Tabulator for all tables, ECharts for charts.
 */
(function() {
  var P = ReproDBProfile;
  var escHtml = P.escHtml, cleanName = P.cleanName, badgeHtml = P.badgeHtml, card = P.card;
  var cfg = document.getElementById('profile-data-urls').dataset;
  var baseUrl = cfg.baseUrl || '';

  // State
  var allProfiles = [], profileMap = {}, idMap = {};
  var citedArtifactsMap = {}, artifactUrlMap = {}, artifactByPaperId = {}, paperIndex = {};
  var artifinderByPaperId = {}, artifinderByTitle = {}, artifinderByAuthor = {};
  var authorRankHistory = [], urlAccessible = {}, availCheckedAt = '';
  var allInstitutions = [], instMap = {}, instHistory = [];

  function institutionStars(chairCount) {
    var chairs = Number(chairCount) || 0;
    if (chairs <= 0) return '';
    var stars = Math.max(1, Math.floor(chairs / 2));
    return '<span class="chair-stars profile-name-stars" aria-label="' + stars + ' stars from ' + chairs + ' chair roles">' + Array(stars + 1).join('\u2605') + '</span>';
  }

  /** Assign dense ranks to an array of objects sorted by scoreField desc. */
  function assignDenseRanks(items, scoreField) {
    var sorted = items.slice().sort(function(a, b) {
      return (b[scoreField] || 0) - (a[scoreField] || 0);
    });
    var rank = 1;
    for (var i = 0; i < sorted.length; i++) {
      if (i > 0 && (sorted[i][scoreField] || 0) < (sorted[i - 1][scoreField] || 0)) rank++;
      sorted[i]._denseRank = rank;
    }
  }

  /** Recompute dense ranks within each snapshot of a history array (in place). */
  function fixHistoryRanks(snapshots) {
    for (var s = 0; s < snapshots.length; s++) {
      var entries = snapshots[s].entries;
      if (!entries) continue;
      var arr = [];
      for (var name in entries) {
        if (entries.hasOwnProperty(name)) arr.push({ name: name, data: entries[name] });
      }
      arr.sort(function(a, b) { return (b.data.score || 0) - (a.data.score || 0); });
      var rank = 1;
      for (var i = 0; i < arr.length; i++) {
        if (i > 0 && (arr[i].data.score || 0) < (arr[i - 1].data.score || 0)) rank++;
        arr[i].data.rank = rank;
      }
    }
  }

  function hideAll() {
    document.getElementById('author-profile').classList.add('rdb-hidden');
    document.getElementById('inst-profile').classList.add('rdb-hidden');
  }

  function normalizeUrl(u) {
    if (u && !u.match(/^https?:\/\//i) && /^10\.\d{4,}\//.test(u)) return 'https://doi.org/' + u;
    return u;
  }

  function normalizeTitle(t) {
    return t.replace(/\.+$/, '').toLowerCase()
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[\u2018\u2019\u2032]/g, "'")
      .replace(/[\u201c\u201d]/g, '"');
  }

  // Normalised author key. MUST produce byte-identical output to
  // _af_author_key() in reprodb-pipeline (src/generators/artifinder/generate_artifinder.py).
  // Shared test vector (keep in sync with the Python docstring + tests):
  //   "Manuel V\u00f6gele"            -> "manuel vogele"
  //   "Anjo Vahldiek-Oberwagner"     -> "anjo vahldiek oberwagner"
  //   "Jane  Q.  Doe"                -> "jane q doe"
  function afAuthorKey(name) {
    return (name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function availTag(url) {
    if (!url) return '';
    var n = url.replace(/\/+$/, '');
    if (urlAccessible[n] === false) {
      return ' <span class="avail-warn">\u26a0 may be unavailable<span class="avail-tip">Last checked ' + escHtml(availCheckedAt || 'recently') + '</span></span>';
    }
    return '';
  }

  function getArtifinderUrls(paper) {
    if (paper.id && artifinderByPaperId[paper.id]) return artifinderByPaperId[paper.id];
    return artifinderByTitle[normalizeTitle(paper.title)] || [];
  }

  // Non-AE ArtiFinder-discovered papers for an author (marked, not scored).
  function getAuthorAfPapers(name) {
    return artifinderByAuthor[afAuthorKey(name)] || [];
  }

  function afMarker() {
    var logo = baseUrl + '/assets/images/artifinder-logo.svg';
    var tip = 'Found by ArtiFinder \u2014 not manually verified by an artifact evaluation committee; excluded from all scores.';
    return ' <span class="artifinder-tag"><img class="artifinder-logo" src="' + escHtml(logo) +
      '" alt="" aria-hidden="true"> Artifinder<span class="avail-tip">' + escHtml(tip) + '</span></span>';
  }

  // Clickable ArtiFinder link (used as a secondary link next to the AE link).
  function afLink(url) {
    var u = normalizeUrl(url || '');
    if (!u) return '';
    var logo = baseUrl + '/assets/images/artifinder-logo.svg';
    var tip = 'Found by ArtiFinder \u2014 not manually verified by an artifact evaluation committee; excluded from all scores.';
    return ' <a class="artifinder-tag" href="' + escHtml(u) + '" target="_blank" rel="noopener"><img class="artifinder-logo" src="' + escHtml(logo) +
      '" alt="" aria-hidden="true"> Artifinder<span class="avail-tip">' + escHtml(tip) + '</span></a>';
  }

  function artifinderTag(paper) {
    return getArtifinderUrls(paper).length ? afMarker() : '';
  }
  // NOTE: artifinderTag kept for potential reuse; profile tables now render a
  // clickable secondary afLink() instead of a bare marker.

  function profLink(name, id) {
    return baseUrl + '/profile.html?name=' + encodeURIComponent(name) + (id != null ? '&id=' + id : '');
  }

  function getPapers(p) {
    if (p.paper_ids && p.paper_ids.length) {
      var out = [];
      for (var i = 0; i < p.paper_ids.length; i++) {
        var pp = paperIndex[p.paper_ids[i]];
        if (pp) out.push(pp);
      }
      return out;
    }
    return (p.papers || []).slice();
  }

  function getArtifactUrl(paper) {
    if (paper.id && artifactByPaperId[paper.id]) return artifactByPaperId[paper.id];
    return artifactUrlMap[normalizeTitle(paper.title)] || '';
  }

  // === AUTHOR ============================================================

  function renderAuthorProfile(p) {
    hideAll();
    document.getElementById('author-profile').classList.remove('rdb-hidden');

    // Header
    var catTag = '';
    if (p.category === 'both') catTag = '<span class="category-tag cat-both">Systems & Security</span>';
    else if (p.category === 'systems') catTag = '<span class="category-tag cat-systems">Systems</span>';
    else if (p.category === 'security') catTag = '<span class="category-tag cat-security">Security</span>';
    var authorStars = p.chair_count ? '<span class="profile-name-stars">' + P.chairDisplayAuthor(p.chair_count) + '</span>' : '';
    document.getElementById('prof-name').innerHTML = escHtml(cleanName(p.name)) + authorStars + catTag;
    var affilEl = document.getElementById('prof-affil');
    if (p.affiliation) {
      affilEl.innerHTML = '<a href="' + baseUrl + '/profile.html?type=institution&name=' + encodeURIComponent(p.affiliation) + '">' + escHtml(p.affiliation) + '</a>';
    } else {
      affilEl.textContent = '';
    }

    // Score cards
    var c = '';
    if (p.combined_score !== undefined) {
      c += card(p.combined_score, 'Combined Score') + card(p.artifact_score || 0, 'Artifact Score') + card(p.ae_score || 0, 'AE Score');
      if (p._denseRank) c += card('#' + p._denseRank, 'Rank');
    }
    c += card(p.artifact_count, 'Artifacts') + card(p.total_papers, 'Total Papers') + card(p.artifact_pct + '%', 'Artifact Rate');
    if (p.ae_memberships) c += card(p.ae_memberships, 'AE Service');
    if (p.chair_count) c += card(p.chair_count, 'Chair Roles');
    document.getElementById('score-cards').innerHTML = c;

    // Papers table (AE artifacts + ArtiFinder-discovered, marked & coloured)
    var papers = getPapers(p);
    var afPapersRaw = getAuthorAfPapers(p.name);
    var aeKeys = {};
    papers.forEach(function(pp) { aeKeys[normalizeTitle(pp.title) + '|' + (pp.year || '')] = true; });
    var afRows = afPapersRaw
      .filter(function(pp) { return !aeKeys[normalizeTitle(pp.title) + '|' + (pp.year || '')]; })
      .map(function(pp) { return { title: pp.title, conference: pp.conference, year: pp.year, badges: [], url: pp.url, _af: true }; });
    var tableData = papers.concat(afRows);
    if (tableData.length) {
      document.getElementById('papers-section').classList.remove('rdb-hidden');
      tableData.sort(function(a, b) { return (b.year || 0) - (a.year || 0); });
      ReproDB.createTable('#papers-table', {
        data: tableData,
        columns: [
          { title: '#', formatter: 'rownum', width: 50, headerSort: false },
          { title: 'Title', field: 'title', formatter: function(cell) {
            var d = cell.getData();
            if (d._af) {
              var au = normalizeUrl(d.url || '');
              var t = au ? '<a class="af-title" href="' + escHtml(au) + '" target="_blank" rel="noopener">' + escHtml(d.title) + '</a>' : '<span class="af-title">' + escHtml(d.title) + '</span>';
              return t + afMarker();
            }
            // AE row: title links to the originally-collected AE artifact URL;
            // any ArtiFinder-discovered link is shown as a secondary marked link.
            var u = getArtifactUrl(d);
            var afUrls = getArtifinderUrls(d);
            var head = u ? '<a href="' + escHtml(u) + '" target="_blank" rel="noopener">' + escHtml(d.title) + '</a>' : escHtml(d.title);
            return head + availTag(u) + (afUrls.length ? afLink(afUrls[0]) : '');
          }, headerSort: false },
          { title: 'Conference', field: 'conference' },
          { title: 'Year', field: 'year', sorter: 'number' },
          { title: 'Badges', field: 'badges', formatter: function(cell) { return badgeHtml(cell.getValue()); }, headerSort: false }
        ]
      });
    } else {
      document.getElementById('papers-section').classList.add('rdb-hidden');
    }

    // AE service
    if (p.ae_memberships && p.ae_memberships > 0) {
      document.getElementById('ae-section').classList.remove('rdb-hidden');
      var confNames = [], seen = {};
      (p.ae_conferences || []).forEach(function(item) {
        var cn = P.parseAEEntry(item).conference;
        if (!seen[cn]) { seen[cn] = true; confNames.push(cn); }
      });
      var sum = '<p><strong>' + p.ae_memberships + '</strong> AE committee membership' + (p.ae_memberships > 1 ? 's' : '');
      if (p.chair_count) sum += ', <strong>' + p.chair_count + '</strong> as chair/co-chair';
      sum += '.</p>';
      if (confNames.length) sum += '<p>Conferences: ' + confNames.map(function(c) { return '<strong>' + escHtml(c) + '</strong>'; }).join(', ') + '</p>';
      document.getElementById('ae-summary').innerHTML = sum;

      if (p.ae_conferences && p.ae_conferences.length) {
        var entries = p.ae_conferences.map(P.parseAEEntry).sort(function(a, b) {
          return (b.year || 0) !== (a.year || 0) ? (b.year || 0) - (a.year || 0) : (a.conference || '').localeCompare(b.conference || '');
        });
        ReproDB.createTable('#ae-table-body', {
          data: entries,
          columns: [
            { title: 'Conference', field: 'conference' },
            { title: 'Year', field: 'year', sorter: 'number' },
            { title: 'Role', field: 'role', formatter: function(cell) { return cell.getValue() === 'chair' ? '\u2605 Chair' : 'Member'; } }
          ]
        });
      }
    } else {
      document.getElementById('ae-section').classList.add('rdb-hidden');
    }

    // Citations
    var ad = citedArtifactsMap[p.name];
    if (ad && ad.cited_artifacts && ad.cited_artifacts.length) {
      document.getElementById('citations-section').classList.remove('rdb-hidden');
      document.getElementById('citations-summary').innerHTML =
        '<strong>' + ad.total_citations + '</strong> total citation' + (ad.total_citations > 1 ? 's' : '') +
        ' to <strong>' + ad.cited_artifacts.length + '</strong> artifact' + (ad.cited_artifacts.length > 1 ? 's' : '') + '.';
      var arts = ad.cited_artifacts.slice().sort(function(a, b) { return (b.citations || 0) - (a.citations || 0); });
      ReproDB.createTable('#citations-table-body', {
        data: arts,
        columns: [
          { title: '#', formatter: 'rownum', width: 50, headerSort: false },
          { title: 'Artifact Title', field: 'title' },
          { title: 'Conference', field: 'conference' },
          { title: 'Year', field: 'year', sorter: 'number' },
          { title: 'Citations', field: 'citations', sorter: 'number', formatter: function(cell) { return '<strong>' + (cell.getValue() || 0) + '</strong>'; } }
        ]
      });
    } else {
      document.getElementById('citations-section').classList.add('rdb-hidden');
    }

    // Timeline chart (ECharts bar)
    renderTimelineChart(p, papers, afRows);
    // History chart (shared helper)
    P.renderHistoryChart('authorHistoryChart', 'author-history-section', authorRankHistory, p.name);
  }

  function renderTimelineChart(p, papers, afPapers) {
    afPapers = afPapers || [];
    var aeYears = p.ae_years || {};
    renderContributionChart('chart-section', 'timelineChart', papers, afPapers, aeYears);
  }

  function renderContributionChart(sectionId, chartId, papers, afPapers, aeYears) {
    papers = papers || [];
    afPapers = afPapers || [];
    aeYears = aeYears || {};

    var yearSet = {};
    papers.forEach(function(pp) { if (pp.year) yearSet[pp.year] = true; });
    afPapers.forEach(function(pp) { if (pp.year) yearSet[pp.year] = true; });
    Object.keys(aeYears).forEach(function(y) { yearSet[y] = true; });
    var years = Object.keys(yearSet).map(Number).sort();
    if (years.length < 1) {
      document.getElementById(sectionId).classList.add('rdb-hidden');
      return;
    }

    var allYears = [];
    for (var y = years[0]; y <= years[years.length - 1]; y++) allYears.push(y);
    var pc = {};
    papers.forEach(function(pp) { if (pp.year) pc[pp.year] = (pc[pp.year] || 0) + 1; });
    var afc = {};
    afPapers.forEach(function(pp) { if (pp.year) afc[pp.year] = (afc[pp.year] || 0) + 1; });

    document.getElementById(sectionId).classList.remove('rdb-hidden');
    var chart = ReproDB.initEChart(chartId);
    var series = [{ name: 'Artifact Papers', type: 'bar', data: allYears.map(function(y) { return pc[y] || 0; }), itemStyle: { color: 'rgba(52,152,219,0.7)' } }];
    if (afPapers.length) {
      series.push({ name: 'ArtiFinder (discovered)', type: 'bar', data: allYears.map(function(y) { return afc[y] || 0; }), itemStyle: { color: 'rgba(74,90,168,0.75)' } });
    }
    if (Object.keys(aeYears).length) {
      series.push({ name: 'AE Committee Service', type: 'bar', data: allYears.map(function(y) { return aeYears[y] || 0; }), itemStyle: { color: 'rgba(46,204,113,0.7)' } });
    }
    chart.setOption({
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, show: series.length > 1 },
      grid: { containLabel: true, left: 40, right: 20, bottom: series.length > 1 ? 40 : 20, top: 10 },
      xAxis: { type: 'category', data: allYears.map(String) },
      yAxis: { type: 'value', minInterval: 1 },
      series: series
    });
    ReproDB.registerEChart(chart);
  }

  // === INSTITUTION =======================================================

  function renderInstProfile(inst) {
    hideAll();
    document.getElementById('inst-profile').classList.remove('rdb-hidden');

    // Header
    var instName = escHtml(inst.affiliation || '');
    var instStars = inst.chair_count ? institutionStars(inst.chair_count) : '';
    document.getElementById('inst-name').innerHTML = instName + instStars;

    var affProfiles = allProfiles.filter(function(p) { return p.affiliation === inst.affiliation; });

    // Score cards
    var c = '';
    c += card(inst.combined_score || 0, 'Combined Score') + card(inst.artifact_score || 0, 'Artifact Score') + card(inst.ae_score || 0, 'AE Score');
    var aeRatio = (inst.ae_ratio == null) ? '\u221e' : inst.ae_ratio;
    c += card(aeRatio, 'A:E Ratio') + card(affProfiles.length, 'Researchers');
    c += card(inst.artifact_count || 0, 'Artifacts') + card(inst.total_papers || 0, 'Total Papers');
    c += card((inst.artifact_pct || 0) + '%', 'Artifact Rate');
    var reproRate = inst.artifact_count > 0 ? Math.round(((inst.badges_reproducible || 0) / inst.artifact_count) * 100) : 0;
    c += card(reproRate + '%', 'Repro Rate') + card(inst.ae_memberships || 0, 'AE Service');
    if (inst.chair_count) c += card(inst.chair_count, 'Chair Roles');
    if (inst._denseRank) {
      c += card('#' + inst._denseRank, 'Rank');
    } else if (instHistory.length >= 2) {
      var curr = instHistory[instHistory.length - 1].entries[inst.affiliation];
      if (curr) c += card('#' + curr.rank, 'Rank');
    }
    document.getElementById('inst-score-cards').innerHTML = c;

    // Contributors table (Tabulator)
    var contribData = affProfiles.map(function(p) {
      return {
        name: p.name, author_id: p.author_id,
        combined_score: p.combined_score || 0, artifact_score: p.artifact_score || 0, ae_score: p.ae_score || 0,
        artifact_count: p.artifact_count || 0, total_papers: p.total_papers || 0,
        ae_memberships: p.ae_memberships || 0, chair_count: p.chair_count || 0
      };
    });
    if (contribData.length) {
      document.getElementById('inst-contributors-section').classList.remove('rdb-hidden');
      ReproDB.createTable('#contributors-table', {
        data: contribData,
        initialSort: [{ column: 'combined_score', dir: 'desc' }],
        columns: [
          { title: '#', formatter: 'rownum', width: 50, headerSort: false },
          { title: 'Researcher', field: 'name', formatter: function(cell) {
            var d = cell.getData();
            return '<a href="' + profLink(d.name, d.author_id) + '">' + escHtml(cleanName(d.name)) + '</a>';
          }},
          { title: 'Score', field: 'combined_score', sorter: 'number', formatter: function(cell) { return '<strong>' + cell.getValue() + '</strong>'; } },
          { title: 'Artifact', field: 'artifact_score', sorter: 'number' },
          { title: 'AE', field: 'ae_score', sorter: 'number' },
          { title: 'Artifacts', field: 'artifact_count', sorter: 'number' },
          { title: 'Papers', field: 'total_papers', sorter: 'number' },
          { title: 'AE Srv', field: 'ae_memberships', sorter: 'number' },
          { title: 'Chair', field: 'chair_count', sorter: 'number', formatter: function(cell) {
            var v = Number(cell.getValue()) || 0;
            if (!v) return '';
            return P.chairDisplayAuthor(v);
          } }
        ]
      });
    } else {
      document.getElementById('inst-contributors-section').classList.add('rdb-hidden');
    }

    // Artifacts table
    var paperMap = {};
    affProfiles.forEach(function(p) {
      getPapers(p).forEach(function(paper) {
        if (!paperMap[paper.title]) {
          paperMap[paper.title] = { title: paper.title, id: paper.id, authors: [], conference: paper.conference, year: paper.year, badges: paper.badges, url: getArtifactUrl(paper), afUrl: (getArtifinderUrls(paper)[0] || '') };
        }
        paperMap[paper.title].authors.push(p.name);
      });
    });
    var artData = Object.values(paperMap).sort(function(a, b) { return (b.year || 0) - (a.year || 0); });
    // Append ArtiFinder-discovered papers of this institution's researchers.
    var afMap = {};
    affProfiles.forEach(function(p) {
      getAuthorAfPapers(p.name).forEach(function(pp) {
        if (paperMap[pp.title]) return;  // already an AE row
        var key = normalizeTitle(pp.title) + '|' + (pp.year || '');
        if (!afMap[key]) {
          afMap[key] = { title: pp.title, conference: pp.conference, year: pp.year, badges: [], url: pp.url, authors: (pp.authors || []).slice(), _af: true };
        }
      });
    });
    artData = artData.concat(Object.values(afMap).sort(function(a, b) { return (b.year || 0) - (a.year || 0); }));
    if (artData.length) {
      document.getElementById('inst-artifacts-section').classList.remove('rdb-hidden');
      ReproDB.createTable('#artifacts-table', {
        data: artData,
        columns: [
          { title: '#', formatter: 'rownum', width: 50, headerSort: false },
          { title: 'Title', field: 'title', formatter: function(cell) {
            var d = cell.getData();
            if (d._af) {
              var au = normalizeUrl(d.url || '');
              var t = au ? '<a class="af-title" href="' + escHtml(au) + '" target="_blank" rel="noopener">' + escHtml(d.title) + '</a>' : '<span class="af-title">' + escHtml(d.title) + '</span>';
              return t + afMarker();
            }
            var head = d.url ? '<a href="' + escHtml(d.url) + '" target="_blank" rel="noopener">' + escHtml(d.title) + '</a>' : escHtml(d.title);
            return head + availTag(d.url) + (d.afUrl ? afLink(d.afUrl) : '');
          }, headerSort: false },
          { title: 'Authors', field: 'authors', formatter: function(cell) {
            return (cell.getValue() || []).map(function(n) { return '<a href="' + profLink(n) + '">' + escHtml(cleanName(n)) + '</a>'; }).join(', ');
          }, headerSort: false },
          { title: 'Conference', field: 'conference' },
          { title: 'Year', field: 'year', sorter: 'number' },
          { title: 'Badges', field: 'badges', formatter: function(cell) { return badgeHtml(cell.getValue()); }, headerSort: false }
        ]
      });
    } else {
      document.getElementById('inst-artifacts-section').classList.add('rdb-hidden');
    }

    // AE involvement table
    var aeData = [], totalAE = 0, totalChairs = 0, aeConfs = {};
    affProfiles.forEach(function(p) {
      (p.ae_conferences || []).forEach(function(entry) {
        var e = P.parseAEEntry(entry);
        aeConfs[e.conference] = true;
        aeData.push({ authorName: p.name, conference: e.conference, year: e.year, role: e.role });
      });
      totalAE += (p.ae_memberships || 0);
      totalChairs += (p.chair_count || 0);
    });
    var instAeYears = {};
    aeData.forEach(function(entry) {
      if (!entry.year) return;
      instAeYears[entry.year] = (instAeYears[entry.year] || 0) + 1;
    });
    renderContributionChart('inst-chart-section', 'instTimelineChart', Object.values(paperMap), Object.values(afMap), instAeYears);
    aeData.sort(function(a, b) { return (b.year || 0) !== (a.year || 0) ? (b.year || 0) - (a.year || 0) : (a.conference || '').localeCompare(b.conference || ''); });
    if (aeData.length) {
      document.getElementById('inst-ae-section').classList.remove('rdb-hidden');
      var aeResCount = affProfiles.filter(function(p) { return p.ae_memberships > 0; }).length;
      var confList = Object.keys(aeConfs).sort();
      var s = '<p><strong>' + totalAE + '</strong> total AE memberships across <strong>' + aeResCount + '</strong> researchers';
      if (totalChairs > 0) s += ', <strong>' + totalChairs + '</strong> chair roles';
      s += '.</p><p>Conferences: ' + confList.map(function(c) { return '<strong>' + escHtml(c) + '</strong>'; }).join(', ') + '</p>';
      document.getElementById('ae-summary-text').innerHTML = s;
      ReproDB.createTable('#ae-detail-table', {
        data: aeData,
        columns: [
          { title: 'Researcher', field: 'authorName', formatter: function(cell) {
            return '<a href="' + profLink(cell.getValue()) + '">' + escHtml(cleanName(cell.getValue())) + '</a>';
          }},
          { title: 'Conference', field: 'conference' },
          { title: 'Year', field: 'year', sorter: 'number' },
          { title: 'Role', field: 'role', formatter: function(cell) { return cell.getValue() === 'chair' ? '\u2605 Chair' : 'Member'; } }
        ]
      });
    } else {
      document.getElementById('inst-ae-section').classList.add('rdb-hidden');
    }

    // History chart (shared helper)
    P.renderHistoryChart('instHistoryChart', 'inst-history-section', instHistory, inst.affiliation);
  }

  // === SEARCH ============================================================

  var search = P.initSearch({
    searchBoxId: 'profile-search-box',
    resultsListId: 'search-results',
    shareBtnId: 'share-btn',
    loadingId: 'loading-msg',
    maxResults: 30,
    filterItems: function(q) {
      var am = allProfiles.filter(function(p) {
        return p.name.toLowerCase().indexOf(q) >= 0 || (p.affiliation && p.affiliation.toLowerCase().indexOf(q) >= 0);
      }).slice(0, 50).map(function(p) { return { type: 'author', data: p }; });
      var im = allInstitutions.filter(function(inst) {
        return (inst.affiliation || '').toLowerCase().indexOf(q) !== -1;
      }).slice(0, 20).map(function(inst) { return { type: 'institution', data: inst }; });
      return im.concat(am);
    },
    renderResult: function(item) {
      if (item.type === 'institution') {
        var inst = item.data;
        return {
          key: 'inst:' + inst.affiliation,
          html: '<span class="sr-type sr-type-inst">Institution</span><strong>' + escHtml(inst.affiliation) + '</strong>' +
                ' <span class="sr-detail">(' + (inst.author_count || 0) + ' researchers, score ' + (inst.combined_score || 0) + ')</span>'
        };
      }
      var p = item.data;
      return {
        key: 'author:' + p.name,
        html: '<span class="sr-type sr-type-author">Author</span><strong>' + escHtml(cleanName(p.name)) + '</strong>' +
              (p.affiliation ? '<br><span class="sr-detail sr-detail-indent">' + escHtml(p.affiliation) + '</span>' : '')
      };
    },
    onSelect: function(key) {
      if (key.indexOf('inst:') === 0) {
        var instName = key.substring(5);
        var inst = instMap[instName];
        if (!inst) return null;
        renderInstProfile(inst);
        var ib = document.getElementById('inst-share-btn');
        if (ib) ib.classList.remove('rdb-hidden');
        return { displayValue: instName, urlParams: { name: instName, type: 'institution' } };
      }
      var authorName = key.substring(7);
      var p = profileMap[authorName];
      if (!p) return null;
      renderAuthorProfile(p);
      var params = {};
      if (p.author_id != null) params.id = p.author_id;
      return { displayValue: cleanName(authorName), urlParams: params };
    },
    resolveFromUrl: function(params) {
      var typeP = params.get('type'), idP = params.get('id'), nameP = params.get('name');
      if (nameP) nameP = nameP.replace(/[\t\n\r]+/g, ' ').replace(/  +/g, ' ').trim();

      if (typeP === 'institution' && nameP) {
        if (instMap[nameP]) return { key: 'inst:' + nameP, displayValue: nameP };
        var m = allInstitutions.find(function(i) { return i.affiliation.toLowerCase() === nameP.toLowerCase(); });
        if (m) return { key: 'inst:' + m.affiliation, displayValue: m.affiliation };
        return { search: nameP };
      }

      var resolved = null;
      if (idP && idMap[parseInt(idP)]) resolved = idMap[parseInt(idP)];
      else if (nameP && profileMap[nameP]) resolved = profileMap[nameP];
      else if (nameP) {
        var lc = nameP.toLowerCase();
        resolved = allProfiles.find(function(p) { return p.name.toLowerCase() === lc || cleanName(p.name).toLowerCase() === lc; });
      }
      if (resolved) return { key: 'author:' + resolved.name, displayValue: cleanName(resolved.name) };

      if (nameP) {
        if (instMap[nameP]) return { key: 'inst:' + nameP, displayValue: nameP };
        var im = allInstitutions.find(function(i) { return i.affiliation.toLowerCase() === nameP.toLowerCase(); });
        if (im) return { key: 'inst:' + im.affiliation, displayValue: im.affiliation };
      }
      if (nameP) return { search: nameP };
      return null;
    }
  });

  // Institution share button
  var instShareBtn = document.getElementById('inst-share-btn');
  if (instShareBtn) {
    instShareBtn.addEventListener('click', function() {
      var url = window.location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function() {
          instShareBtn.classList.add('copied');
          setTimeout(function() { instShareBtn.classList.remove('copied'); }, ReproDB.COPIED_FLASH_MS);
        });
      } else {
        prompt('Copy link:', url);
      }
    });
  }

  // === LOAD DATA =========================================================

  // If URL already specifies a name, immediately move search box to top
  // and show the name — don't wait for data to load.
  (function earlyLayout() {
    var params = new URLSearchParams(window.location.search);
    var nameP = params.get('name');
    if (!nameP) return;
    nameP = nameP.replace(/[\t\n\r]+/g, ' ').replace(/  +/g, ' ').trim();
    if (!nameP) return;
    var box = document.getElementById('profile-search-box');
    if (box) box.value = nameP;
    var hero = document.getElementById('profile-search-hero');
    if (hero) hero.classList.add('has-profile');
  })();

  Promise.all([
    ReproDB.ready,
    fetch(cfg.authorProfiles).then(function(r) { return r.json(); }),
    fetch(cfg.citedArtifacts).then(function(r) { return r.json(); }).catch(function() { return {}; }),
    fetch(cfg.authorHistory).then(function(r) { return r.json(); }).catch(function() { return []; }),
    fetch(cfg.artifacts).then(function(r) { return r.json(); }).catch(function() { return []; }),
    fetch(cfg.papers).then(function(r) { return r.json(); }).catch(function() { return []; }),
    fetch(cfg.availability).then(function(r) { return r.json(); }).catch(function() { return { records: [] }; }),
    fetch(cfg.institutions).then(function(r) { return r.json(); }),
    fetch(cfg.instHistory).then(function(r) { return r.json(); }).catch(function() { return []; }),
    fetch(cfg.artifinderAuthors).then(function(r) { return r.json(); }).catch(function() { return {}; })
  ]).then(function(res) {
    allProfiles = res[1];
    citedArtifactsMap = res[2] || {};
    authorRankHistory = res[3] || [];
    artifinderByAuthor = res[9] || {};
    // Fix historical ranks to use dense ranking
    fixHistoryRanks(authorRankHistory);

    // Build artifact URL map (normalizeTitle for case+unicode-insensitive lookup)
    (res[4] || []).forEach(function(a) {
      var urls = a.artifact_urls || [];
      var u = urls.length ? urls[0] : (a.artifact_url || a.repository_url || '');
      if (a.title && u) artifactUrlMap[normalizeTitle(a.title)] = normalizeUrl(u);
      if (a.paper_id && u) artifactByPaperId[a.paper_id] = normalizeUrl(u);
      var af = (a.artifinder_urls || []).map(normalizeUrl).filter(Boolean);
      if (af.length) {
        if (a.title) artifinderByTitle[normalizeTitle(a.title)] = af;
        if (a.paper_id) artifinderByPaperId[a.paper_id] = af;
      }
    });

    // Build paper index
    (res[5] || []).forEach(function(p) { paperIndex[p.id] = p; });

    // Availability map
    var avail = res[6] || {};
    availCheckedAt = (avail.summary && avail.summary.checked_at) ? avail.summary.checked_at.replace(/ UTC$/, '') : '';
    (avail.records || []).forEach(function(rec) {
      var u = (rec.url || '').replace(/\/+$/, '');
      if (u) { urlAccessible[u] = rec.accessible !== false; }
    });

    // Profile maps
    profileMap = {}; idMap = {};
    for (var i = 0; i < allProfiles.length; i++) {
      profileMap[allProfiles[i].name] = allProfiles[i];
      if (allProfiles[i].author_id != null) idMap[allProfiles[i].author_id] = allProfiles[i];
    }
    // Compute dense ranks for author profiles
    assignDenseRanks(allProfiles, 'combined_score');

    // Institution data
    allInstitutions = res[7].filter(function(inst) {
      var a = (inst.affiliation || '').toLowerCase();
      return a && a !== 'unknown' && !a.startsWith('_');
    });
    instMap = {};
    allInstitutions.forEach(function(inst) { instMap[inst.affiliation] = inst; });
    // Compute dense ranks for institutions
    assignDenseRanks(allInstitutions, 'combined_score');
    instHistory = res[8] || [];
    // Fix historical ranks to use dense ranking
    fixHistoryRanks(instHistory);

    search.activate();
  }).catch(function(err) {
    document.getElementById('loading-msg').textContent = 'Error loading profile data.';
    console.error(err);
  });
})();
