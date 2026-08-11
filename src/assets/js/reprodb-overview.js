/**
 * reprodb-overview.js — Chart logic for the Systems vs. Security overview page.
 *
 * Depends on: ECharts 5 (loaded globally via head/custom.html)
 *
 * Reads inline JSON data from a <script id="overview-data" type="application/json">
 * element injected by the Jekyll template.
 */
(function() {
  'use strict';

  var SYS_COLOR  = ReproDB.COLORS.systems;
  var SEC_COLOR  = ReproDB.COLORS.security;
  var BADGE_COLORS = ReproDB.COLORS.badges;

  document.addEventListener('DOMContentLoaded', function() {
    var dataEl = document.getElementById('overview-data');
    if (!dataEl) return;
    var D;
    try { D = JSON.parse(dataEl.textContent); } catch(e) { return; }

    /* Extend artifact years with committee-coverage years (e.g. AE committees
       announced before artifact submissions are collected). */
    var _yrSet = {};
    (D.years || []).forEach(function(y) { _yrSet[y] = true; });
    (D.committeeYears || []).forEach(function(y) { _yrSet[y] = true; });
    var years = Object.keys(_yrSet).sort();
    /* Align artifact count arrays with the extended year list */
    var _artYrMap = {};
    (D.years || []).forEach(function(y, i) {
      _artYrMap[y] = { sys: (D.sysCounts || [])[i] || 0, sec: (D.secCounts || [])[i] || 0, tot: (D.totCounts || [])[i] || 0 };
    });
    var sysCounts = years.map(function(y) { return _artYrMap[y] ? _artYrMap[y].sys : 0; });
    var secCounts = years.map(function(y) { return _artYrMap[y] ? _artYrMap[y].sec : 0; });
    var totCounts = years.map(function(y) { return _artYrMap[y] ? _artYrMap[y].tot : 0; });

    /* ===== 1. Artifact Growth Chart ===== */
    var growthEl = document.getElementById('artifactGrowthChart');
    if (growthEl) {
      var chart = ReproDB.initEChart(growthEl);
      chart.setOption({
        tooltip: { trigger: 'axis' },
        legend: { bottom: 0, data: ['Systems', 'Security', 'Total'] },
        grid: { containLabel: true, left: 40, right: 20, bottom: 50, top: 40 },
        xAxis: { type: 'category', data: years },
        yAxis: { type: 'value', name: 'Artifacts', min: 0 },
        series: [
          { name: 'Systems', type: 'bar', stack: 'artifacts', data: sysCounts, itemStyle: { color: SYS_COLOR } },
          { name: 'Security', type: 'bar', stack: 'artifacts', data: secCounts, itemStyle: { color: SEC_COLOR } },
          { name: 'Total', type: 'line', data: totCounts, itemStyle: { color: ReproDB.themeColors().totalLine }, lineStyle: { width: 2 }, symbolSize: 6, z: 10 }
        ]
      });
      ReproDB.registerEChart(chart);
    }

    /* ===== 2. Badge Distribution (per area, over time) ===== */
    var sysYearBadges = {};
    var secYearBadges = {};
    years.forEach(function(y) {
      sysYearBadges[y] = { total: 0, available: 0, functional: 0, reproducible: 0, reusable: 0 };
      secYearBadges[y] = { total: 0, available: 0, functional: 0, reproducible: 0, reusable: 0 };
    });

    (D.conferences || []).forEach(function(conf) {
      var cat = conf.category;
      var ydata = conf.years_data;
      if (!ydata) return;
      ydata.forEach(function(yd) {
        var y = String(yd.year);
        var bucket = (cat === 'systems') ? sysYearBadges : secYearBadges;
        if (!bucket[y]) return;
        var t = yd.total, a = yd.available, f = yd.functional, r = yd.reproducible, u = yd.reusable;
        bucket[y].total += t;
        var isEvalOnly = (cat === 'security' && a === 0 && r === 0 && u === 0 && f === t && f > 0);
        if (!isEvalOnly) {
          bucket[y].available += a;
          bucket[y].functional += f;
          bucket[y].reproducible += r;
          bucket[y].reusable += u;
        }
      });
    });

    function badgeRateSeries(yearBadges, badge) {
      return years.map(function(y) {
        var b = yearBadges[y];
        if (b.total <= 0) return null;
        if (badge === 'evaluated') {
          var maxBadge = Math.max(b.available, b.functional, b.reproducible, b.reusable);
          var evalOnly = b.total - maxBadge;
          return evalOnly > 0 ? Math.round(evalOnly / b.total * 100) : 0;
        }
        return Math.round(b[badge] / b.total * 100);
      });
    }

    function makeBadgeChart(elId, yearBadges, badges) {
      var el = document.getElementById(elId);
      if (!el) return;
      var chart = ReproDB.initEChart(el);
      chart.setOption({
        tooltip: { trigger: 'axis' },
        legend: { bottom: 0, data: badges.map(function(b) { return b === 'evaluated' ? 'Evaluated (no badge)' : b.charAt(0).toUpperCase() + b.slice(1); }) },
        grid: { containLabel: true, left: 40, right: 20, bottom: 50, top: 20 },
        xAxis: { type: 'category', data: years },
        yAxis: { type: 'value', name: '% of Artifacts', min: 0, max: 100 },
        series: badges.map(function(badge) {
          var lbl = badge === 'evaluated' ? 'Evaluated (no badge)' : badge.charAt(0).toUpperCase() + badge.slice(1);
          var opts = { name: lbl, type: 'line', data: badgeRateSeries(yearBadges, badge), itemStyle: { color: BADGE_COLORS[badge] }, smooth: 0.2, connectNulls: true, symbolSize: 4 };
          if (badge === 'evaluated') opts.lineStyle = { type: 'dashed' };
          return opts;
        })
      });
      ReproDB.registerEChart(chart);
    }

    makeBadgeChart('badgeChartSys', sysYearBadges, ['available', 'functional', 'reproducible', 'reusable']);
    makeBadgeChart('badgeChartSec', secYearBadges, ['evaluated', 'available', 'functional', 'reproducible', 'reusable']);

    /* Badge rate comparison overlay */
    var compareEl = document.getElementById('badgeRateCompareChart');
    if (compareEl) {
      var cChart = ReproDB.initEChart(compareEl);
      cChart.setOption({
        tooltip: { trigger: 'axis' },
        legend: { bottom: 0, type: 'scroll' },
        grid: { containLabel: true, left: 40, right: 20, bottom: 60, top: 20 },
        xAxis: { type: 'category', data: years },
        yAxis: { type: 'value', name: '% of AE Artifacts', min: 0, max: 100 },
        series: [
          { name: 'Systems \u2014 Available %', type: 'line', data: badgeRateSeries(sysYearBadges, 'available'), itemStyle: { color: SYS_COLOR }, lineStyle: { type: 'dashed', width: 2 }, smooth: 0.2, connectNulls: true, symbolSize: 4 },
          { name: 'Security \u2014 Available %', type: 'line', data: badgeRateSeries(secYearBadges, 'available'), itemStyle: { color: SEC_COLOR }, lineStyle: { type: 'dashed', width: 2 }, smooth: 0.2, connectNulls: true, symbolSize: 4 },
          { name: 'Systems \u2014 Functional %', type: 'line', data: badgeRateSeries(sysYearBadges, 'functional'), itemStyle: { color: SYS_COLOR }, lineStyle: { type: [5, 5], width: 2 }, smooth: 0.2, connectNulls: true, symbolSize: 4 },
          { name: 'Security \u2014 Functional %', type: 'line', data: badgeRateSeries(secYearBadges, 'functional'), itemStyle: { color: SEC_COLOR }, lineStyle: { type: [5, 5], width: 2 }, smooth: 0.2, connectNulls: true, symbolSize: 4 },
          { name: 'Systems \u2014 Reproduced %', type: 'line', data: badgeRateSeries(sysYearBadges, 'reproducible'), itemStyle: { color: SYS_COLOR }, lineStyle: { width: 3 }, smooth: 0.2, connectNulls: true, symbolSize: 4 },
          { name: 'Security \u2014 Reproduced %', type: 'line', data: badgeRateSeries(secYearBadges, 'reproducible'), itemStyle: { color: SEC_COLOR }, lineStyle: { width: 3 }, smooth: 0.2, connectNulls: true, symbolSize: 4 }
        ]
      });
      ReproDB.registerEChart(cChart);
    }

    /* ===== 3. AE Participation Rates ===== */
    function makeCombinedParticipationChart(sysData, secData) {
      var el = document.getElementById('partRateChartCombined');
      if (!el) return;
      var yrSet = {};
      /* Extend x-axis to cover all artifact/committee years, not just participation years */
      years.forEach(function(y) { yrSet[y] = true; });
      if (sysData && sysData.years) sysData.years.forEach(function(y) { yrSet[y] = true; });
      if (secData && secData.years) secData.years.forEach(function(y) { yrSet[y] = true; });
      var yrs = Object.keys(yrSet).sort();

      function alignData(areaData) {
        if (!areaData || !areaData.years) return yrs.map(function() { return null; });
        var map = {};
        areaData.years.forEach(function(y, i) { map[String(y)] = i; });
        return yrs.map(function(y) { return map[y] !== undefined ? areaData.participation_pct[map[y]] : null; });
      }

      var chart = ReproDB.initEChart(el);
      chart.setOption({
        title: { text: 'AE Participation \u2014 % of All Accepted Papers', left: 'center', textStyle: { fontSize: 14 } },
        tooltip: { trigger: 'axis' },
        legend: { bottom: 0 },
        grid: { containLabel: true, left: 40, right: 20, bottom: 50, top: 50 },
        xAxis: { type: 'category', data: yrs },
        yAxis: { type: 'value', name: '%', min: 0, max: 100 },
        series: [
          { name: 'Systems \u2014 AE Participation', type: 'line', data: alignData(sysData), itemStyle: { color: SYS_COLOR }, lineStyle: { width: 3 }, smooth: 0.2, connectNulls: true, symbolSize: 5 },
          { name: 'Security \u2014 AE Participation', type: 'line', data: alignData(secData), itemStyle: { color: SEC_COLOR }, lineStyle: { width: 3 }, smooth: 0.2, connectNulls: true, symbolSize: 5 }
        ]
      });
      ReproDB.registerEChart(chart);
    }

    if (D.participationUrl) {
      ReproDB.fetchJSON(D.participationUrl)
        .then(function(data) {
          if (data.by_area) makeCombinedParticipationChart(data.by_area.systems, data.by_area.security);
        })
        .catch(function(e) { console.error('Failed to load participation data:', e); });
    }

    /* ===== 4. Top Institutions by Area ===== */
    function makeInstBar(elId, data, title, color) {
      var el = document.getElementById(elId);
      if (!el) return;
      data.sort(function(a, b) { return (b.combined_score || 0) - (a.combined_score || 0); });
      var top = data.slice(0, 10);
      var labels = top.map(function(e) { var n = e.affiliation || ''; return n.length > 30 ? n.substring(0, 28) + '\u2026' : n; });
      labels.reverse();
      var artData = top.map(function(e) { return e.artifact_score || 0; }).reverse();
      var aeData = top.map(function(e) { return e.ae_score || 0; }).reverse();

      var chart = ReproDB.initEChart(el);
      chart.setOption({
        title: { text: title + ' \u2014 Top 10 by Combined Score', left: 'center', textStyle: { fontSize: 13 } },
        tooltip: { trigger: 'axis' },
        legend: { show: false },
        grid: { containLabel: true, left: 40, right: 20, bottom: 50, top: 50 },
        xAxis: { type: 'value', name: 'Score', nameLocation: 'center', nameGap: 25 },
        yAxis: { type: 'category', data: labels },
        series: [
          { name: 'Artifact Score', type: 'bar', stack: 'total', data: artData, itemStyle: { color: color } },
          { name: 'AE Service Score', type: 'bar', stack: 'total', data: aeData, itemStyle: { color: 'rgba(150,150,150,0.5)' } }
        ]
      });
      ReproDB.registerEChart(chart);
    }

    function lerpColor(ratio) {
      var sR = 41, sG = 128, sB = 185;
      var eR = 192, eG = 57, eB = 43;
      var r = Math.round(eR + (sR - eR) * ratio);
      var g = Math.round(eG + (sG - eG) * ratio);
      var b = Math.round(eB + (sB - eB) * ratio);
      return 'rgb(' + r + ',' + g + ',' + b + ')';
    }

    function makeInstScatter(sysData, secData) {
      var el = document.getElementById('instScatterChart');
      if (!el) return;
      var minScore = 50;

      var instMap = {};
      function addToMap(data, area) {
        data.forEach(function(e) {
          var name = e.affiliation;
          if (!instMap[name]) instMap[name] = { affiliation: name, sys_artifact: 0, sys_ae: 0, sys_combined: 0, sec_artifact: 0, sec_ae: 0, sec_combined: 0 };
          instMap[name][area + '_artifact']  += (e.artifact_score  || 0);
          instMap[name][area + '_ae']        += (e.ae_score        || 0);
          instMap[name][area + '_combined']  += (e.combined_score  || 0);
        });
      }
      addToMap(sysData, 'sys');
      addToMap(secData, 'sec');

      var scatterData = [];
      Object.keys(instMap).forEach(function(name) {
        var inst = instMap[name];
        var totalCombined = inst.sys_combined + inst.sec_combined;
        if (totalCombined < minScore) return;
        var sysRatio = totalCombined > 0 ? inst.sys_combined / totalCombined : 0.5;
        scatterData.push({
          value: [inst.sys_artifact + inst.sec_artifact, inst.sys_ae + inst.sec_ae],
          symbolSize: Math.max(6, Math.sqrt(totalCombined) * 1.6),
          itemStyle: { color: lerpColor(sysRatio) },
          label: name,
          sysRatio: sysRatio
        });
      });

      var chart = ReproDB.initEChart(el);
      chart.setOption({
        title: { text: 'Institutional Ecosystem: Artifact Creation vs. AE Service', left: 'center', textStyle: { fontSize: 13 } },
        tooltip: { formatter: function(p) {
          var d = p.data;
          var pct = Math.round(d.sysRatio * 100);
          return d.label + '<br/>Artifacts: ' + d.value[0] + '<br/>AE: ' + d.value[1] + '<br/>' + pct + '% systems';
        } },
        grid: { containLabel: true, left: 40, right: 20, bottom: 50, top: 50 },
        xAxis: { type: 'value', name: 'Artifact Score', min: 0, nameLocation: 'center', nameGap: 25 },
        yAxis: { type: 'value', name: 'AE Service Score', min: 0 },
        series: [{ type: 'scatter', data: scatterData }]
      });
      ReproDB.registerEChart(chart);

      /* Draw gradient legend */
      var legendCanvas = document.getElementById('instScatterLegend');
      if (legendCanvas) {
        var lw = 200, lh = 12;
        legendCanvas.width = lw * 2;
        legendCanvas.height = lh * 2;
        legendCanvas.style.width = lw + 'px';
        legendCanvas.style.height = lh + 'px';
        var lctx = legendCanvas.getContext('2d');
        lctx.scale(2, 2);
        for (var i = 0; i < lw; i++) {
          lctx.fillStyle = lerpColor(i / (lw - 1));
          lctx.fillRect(i, 0, 1, lh);
        }
      }
    }

    if (D.sysInstUrl && D.secInstUrl) {
      Promise.all([
        ReproDB.fetchJSON(D.sysInstUrl),
        ReproDB.fetchJSON(D.secInstUrl)
      ]).then(function(results) {
        var sysInst = results[0], secInst = results[1];
        makeInstBar('instChartSys', sysInst, 'Systems', SYS_COLOR);
        makeInstBar('instChartSec', secInst, 'Security', SEC_COLOR);
        makeInstScatter(sysInst, secInst);
      }).catch(function(e) { console.error('Failed to load institution data:', e); });
    }

    /* ===== 5. Conference Timeline Heatmap (ECharts) ===== */
    var hmEl = document.getElementById('timelineHeatmap');
    if (hmEl && D.conferences) {
      var confs = D.conferences.slice().sort(function(a, b) {
        if (a.category !== b.category) return a.category === 'systems' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      var confNames = confs.map(function(c) { return c.name; });
      var confCategories = confs.map(function(c) { return c.category; });
      var rawHeatData = [];
      var maxVal = 0;

      confs.forEach(function(c, ci) {
        var yrs = {};
        if (c.years_data) c.years_data.forEach(function(yd) { yrs[yd.year] = yd.total; });
        years.forEach(function(y, yi) {
          var v = yrs[y] || 0;
          rawHeatData.push({ x: yi, y: ci, v: v, cat: confCategories[ci] });
          if (v > maxVal) maxVal = v;
        });
      });

      function cellColor(v, category) {
        var dark = ReproDB.isDark();
        if (v === 0) return dark ? 'rgba(50,55,65,0.5)' : 'rgba(220,220,220,0.3)';
        var t = v / maxVal;
        if (category === 'security') {
          if (dark) {
            var r = Math.round(80 + 140 * t);
            var g = Math.round(20 + 20 * t);
            var b = Math.round(20 + 15 * t);
            return 'rgb(' + r + ',' + g + ',' + b + ')';
          }
          return 'rgba(192,57,43,' + (0.15 + t * 0.7) + ')';
        }
        if (dark) {
          var r2 = Math.round(20 + 20 * t);
          var g2 = Math.round(50 + 70 * t);
          var b2 = Math.round(80 + 130 * t);
          return 'rgb(' + r2 + ',' + g2 + ',' + b2 + ')';
        }
        return 'rgba(41,128,185,' + (0.15 + t * 0.7) + ')';
      }

      function labelColor(v) {
        var dark = ReproDB.isDark();
        var tc = ReproDB.themeColors();
        var t = maxVal > 0 ? v / maxVal : 0;
        var textThreshold = dark ? 0.25 : 0.6;
        return (v > 0 && t > textThreshold) ? '#fff' : tc.text;
      }

      function buildHeatData() {
        return rawHeatData.map(function(d) {
          return { value: [d.x, d.y, d.v], itemStyle: { color: cellColor(d.v, d.cat) }, label: { color: labelColor(d.v) } };
        });
      }

      var hmChart = ReproDB.initEChart(hmEl);

      function setHeatmapOption() {
        var dark = ReproDB.isDark();
        var tc = ReproDB.themeColors();
        hmChart.setOption({
          tooltip: { formatter: function(p) { return confNames[p.value[1]] + ' (' + years[p.value[0]] + '): ' + p.value[2] + ' artifacts'; } },
          grid: { containLabel: true, left: 20, right: 20, bottom: 80, top: 30 },
          xAxis: { type: 'category', data: years, splitArea: { show: false } },
          yAxis: { type: 'category', data: confNames, splitArea: { show: false }, inverse: true },
          graphic: [
            /* Systems gradient legend */
            { type: 'rect', left: 'center', bottom: 28, shape: { width: 120, height: 12 }, z: 100,
              style: { fill: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                { offset: 0, color: dark ? 'rgba(50,55,65,0.5)' : 'rgba(220,220,220,0.3)' },
                { offset: 1, color: dark ? 'rgb(40,120,210)' : 'rgba(41,128,185,0.85)' }
              ]) }
            },
            { type: 'text', left: 'center', bottom: 42, z: 100,
              style: { text: 'Systems', fill: tc.text, fontSize: 11, textAlign: 'center' } },
            /* Security gradient legend */
            { type: 'rect', left: 'center', bottom: 4, shape: { width: 120, height: 12 }, z: 100,
              style: { fill: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                { offset: 0, color: dark ? 'rgba(50,55,65,0.5)' : 'rgba(220,220,220,0.3)' },
                { offset: 1, color: dark ? 'rgb(220,40,35)' : 'rgba(192,57,43,0.85)' }
              ]) }
            },
            { type: 'text', left: 'center', bottom: 18, z: 100,
              style: { text: 'Security', fill: tc.text, fontSize: 11, textAlign: 'center' } }
          ],
          series: [{
            type: 'heatmap', data: buildHeatData(), label: { show: true, fontSize: 10,
              formatter: function(p) { return p.value[2] > 0 ? p.value[2] : ''; }
            },
            itemStyle: {
              borderColor: dark ? '#333' : '#fff', borderWidth: 1
            }
          }]
        });
      }

      setHeatmapOption();
      ReproDB.registerEChart(hmChart);
      ReproDB.onThemeChange(setHeatmapOption);
    }
  });
})();
