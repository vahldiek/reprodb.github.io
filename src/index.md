---
title: ""
skip_chartjs: true
---

<link rel="stylesheet" href="{{ '/assets/css/reprodb-search-hero.css' | relative_url }}">

<div id="search-hero" class="rdb-search-hero">
  <div class="rdb-search-hero-inner">
    <p class="rdb-search-tagline">
      Research artifacts and artifact evaluation drive reproducibility and scientific impact. <strong>ReproDB</strong> aggregates and surfaces artifact evaluation outcomes across major <a href="{{ '/security/' | relative_url }}">security</a> and <a href="{{ '/systems/' | relative_url }}">systems</a> conferences, and also includes automatically discovered artifact links from <a href="{{ '/methodology/artifinder.html' | relative_url }}">ArtiFinder</a>. The site recognizes the contributions of both artifact authors and artifact evaluation service.
    </p>
    <div id="search-container">
      <div class="rdb-search-box-wrap">
        <input id="searchBox" class="rdb-search-input" type="text"
          placeholder="Search artifacts by title, author, affiliation, or venue…"
          autocomplete="off">
        <svg id="searchIcon" class="rdb-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <svg id="clearIcon" class="rdb-search-clear rdb-hidden" onclick="clearSearch()" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </div>
      <div id="filters">
        <select id="yearFilter">
          <option value="">All Years</option>
        </select>
        <select id="venueFilter">
          <option value="">All Venues</option>
        </select>
        <span class="rdb-area-checks">
          <label><input type="checkbox" class="areaCheck" value="systems" checked> Systems</label>
          <label><input type="checkbox" class="areaCheck" value="security" checked> Security</label>
        </span>
        <span id="searchStatus" class="rdb-search-status">Loading…</span>
        <select id="sortSelect">
          <option value="year-desc">Year ↓</option>
          <option value="year-asc">Year ↑</option>
          <option value="title-asc">Title A–Z</option>
          <option value="title-desc">Title Z–A</option>
          <option value="venue-asc">Venue A–Z</option>
          <option value="venue-desc">Venue Z–A</option>
        </select>
        <span id="actionBtns" class="rdb-action-btns">
          <button id="downloadBtn" class="rdb-icon-btn" onclick="downloadResults()" title="Download results as JSON">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <button id="shareBtn" class="rdb-icon-btn" onclick="shareSearch()" title="Copy search link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          </button>
          <a id="searchHelpLink" class="rdb-help-link" href="{{ '/methodology/search-keywords.html' | relative_url }}" title="Search keywords" aria-label="Search keywords help">
            <i class="fas fa-hashtag" aria-hidden="true"></i>
          </a>
        </span>
      </div>
    </div>
  </div>
</div>

<div id="profileCards" class="rdb-hidden"></div>

<div id="results-container">
  <div id="resultsList" class="rdb-hidden"></div>
  <div id="noResults" class="rdb-hidden">No artifacts found matching your search.</div>
</div>

<div id="pagination" class="rdb-hidden">
  <button id="prevBtn" onclick="changePage(-1)">← Prev</button>
  <span id="pageInfo"></span>
  <button id="nextBtn" onclick="changePage(1)">Next →</button>
</div>

<div id="search-data-urls"
  data-base-url='{{ "" | relative_url }}'
  data-availability='{{ "/assets/data/artifact_availability.json" | relative_url }}'
  data-author-profiles='{{ "/assets/data/author_profiles.json" | relative_url }}'
  data-institutions='{{ "/assets/data/institution_rankings.json" | relative_url }}'
  data-search-data='{{ "/assets/data/search_data.json" | relative_url }}'
></div>
<script src="{{ '/assets/js/reprodb-profile.js' | relative_url }}"></script>
<script src="{{ '/assets/js/reprodb-search.js' | relative_url }}"></script>

