---
title: "Profile"
permalink: /profile.html
layout: single
---

{% include profile_common.html %}

<div id="profile-search-hero" class="rdb-search-hero profile-search-hero">
  <div class="rdb-search-hero-inner profile-search-hero-inner">
    <h2 class="rdb-search-tagline profile-search-heading">Find a researcher or institution</h2>
    <div class="rdb-search-box-wrap">
      <input type="text" id="profile-search-box" class="rdb-search-input profile-search-box" placeholder="Search by name, affiliation, or institution…" autocomplete="off">
      <svg class="rdb-search-icon profile-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <ul id="search-results" class="profile-search-results rdb-hidden"></ul>
    </div>
  </div>
</div>

<div id="loading-msg" class="profile-loading">Loading profile data…</div>

<!-- ═══════════════ AUTHOR PROFILE SECTION ═══════════════ -->
<div id="author-profile" class="profile-container rdb-hidden">
  <div class="profile-header">
    <h2 id="prof-name"></h2><span id="share-btn" class="share-btn rdb-hidden" title="Copy link to this profile">&#128279; Share<span class="share-tip">Link copied!</span></span>
    <div class="affil" id="prof-affil"></div>
  </div>

  <div class="rdb-cards" id="score-cards"></div>

  <div id="chart-section" class="rdb-hidden">
    <h3>Contributions Over Time</h3>
    <div class="chart-container"><div id="timelineChart" style="height:300px"></div></div>
  </div>

  <div id="papers-section" class="rdb-hidden">
    <h3>Artifact Papers</h3>
    <div id="papers-table"></div>
  </div>

  <div id="ae-section" class="rdb-hidden">
    <h3>AE Committee Service</h3>
    <div id="ae-summary"></div>
    <div id="ae-table-body"></div>
  </div>

  <div id="citations-section" class="rdb-hidden">
    <h3>Cited Artifacts</h3>
    <p id="citations-summary"></p>
    <div id="citations-table-body"></div>
  </div>

  <div id="author-history-section" class="rdb-hidden">
    <details class="ranking-history-details">
      <summary><h3>Ranking History</h3></summary>
      <div class="chart-container"><div id="authorHistoryChart" style="height:300px"></div></div>
    </details>
  </div>
</div>

<!-- ═══════════════ INSTITUTION PROFILE SECTION ═══════════════ -->
<div id="inst-profile" class="profile-container rdb-hidden">
  <div class="profile-header">
    <h2 id="inst-name"></h2><span id="inst-share-btn" class="share-btn rdb-hidden" title="Copy link to this profile">&#128279; Share<span class="share-tip">Link copied!</span></span>
  </div>

  <div class="rdb-cards" id="inst-score-cards"></div>

  <div id="inst-chart-section" class="rdb-hidden">
    <h3>Contributions Over Time</h3>
    <div class="chart-container"><div id="instTimelineChart" style="height:300px"></div></div>
  </div>

  <div id="inst-contributors-section" class="rdb-hidden">
    <h3>Top Contributors</h3>
    <div id="contributors-table"></div>
  </div>

  <div id="inst-artifacts-section" class="rdb-hidden">
    <h3>Artifact Papers</h3>
    <div id="artifacts-table"></div>
  </div>

  <div id="inst-ae-section" class="rdb-hidden">
    <h3>AE Committee Involvement</h3>
    <div id="ae-summary-text"></div>
    <div id="ae-detail-table"></div>
  </div>

  <div id="inst-history-section" class="rdb-hidden">
    <details class="ranking-history-details">
      <summary><h3>Ranking History</h3></summary>
      <div class="chart-container"><div id="instHistoryChart" style="height:300px"></div></div>
    </details>
  </div>
</div>

<div id="profile-data-urls" class="rdb-hidden"
  data-base-url='{{ "" | relative_url }}'
  data-author-profiles='{{ "/assets/data/author_profiles.json" | relative_url }}'
  data-cited-artifacts='{{ "/assets/data/cited_artifacts_by_author.json" | relative_url }}'
  data-author-history='{{ "/assets/data/ranking_history.json" | relative_url }}'
  data-artifacts='{{ "/assets/data/artifacts.json" | relative_url }}'
  data-papers='{{ "/assets/data/papers.json" | relative_url }}'
  data-availability='{{ "/assets/data/artifact_availability.json" | relative_url }}'
  data-institutions='{{ "/assets/data/institution_rankings.json" | relative_url }}'
  data-inst-history='{{ "/assets/data/institution_ranking_history.json" | relative_url }}'
  data-artifinder-authors='{{ "/assets/data/artifinder_authors.json" | relative_url }}'
></div>
<script src="{{ '/assets/js/reprodb-profile-page.js' | relative_url }}"></script>
