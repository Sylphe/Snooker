/* v4.8 phase1: extracted pure render helpers */

function renderLogRow(l) {
  return `<tr data-log-row-id="${attrText(l.id)}">
    <td>${new Date(l.createdAt).toLocaleDateString()}</td>
    <td>${displayScore(l)}</td>
    <td>${Number(l.normalizedScore || 0).toFixed(2)}</td>
    <td>${escapeHtml(l.performance || "N/A")}</td>
    <td>${escapeHtml(getTargetProfileLabel(l))}</td>
    <td>${formatDurationHuman(l.timeMinutes)}</td>
    <td><button class="secondary" data-action="open-log-edit" data-id="${attrText(l.id)}">Edit</button> <button class="danger" data-action="delete-log" data-id="${attrText(l.id)}">Delete</button></td>
  </tr>`;
}



function renderToday() {
  const today = localDateKey();
  const logs = data.logs.filter(l => sameDate(l, today)).sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (!logs.length) { $("todaySummary").innerHTML = "<p>No training logged today yet.</p>"; return; }

  const totalTime = logs.reduce((a,b) => a + Number(b.timeMinutes || 0), 0);
  const byType = {}, bySession = {};
  logs.forEach(l => {
    byType[l.category || "uncategorized"] = (byType[l.category || "uncategorized"] || 0) + 1;
    bySession[l.sessionId] ||= {name: getPlanName(l), type: l.sessionType || "", logs: []};
    bySession[l.sessionId].logs.push(l);
  });
  const hit = targetHitRate(logs);

  $("todaySummary").innerHTML = `<div class="stats-grid">
    <div class="stat-card"><span>Exercises ${statHelpButton("exercisesCompleted")}</span><div class="value">${logs.length}</div></div>
    <div class="stat-card"><span>Total time ${statHelpButton("totalTrainingTime")}</span><div class="value">${formatDurationHuman(totalTime)}</div></div>
    <div class="stat-card"><span>Target hit rate ${statHelpButton("targetHitRate")}</span><div class="value">${hit === null ? "N/A" : hit.toFixed(1)+"%"}</div></div>
  </div><p>${Object.entries(byType).map(([k,v]) => `<span class="badge">${escapeHtml(k)}: ${v}</span>`).join("")}</p>
  <h3>Today’s exercise mix</h3>${renderCategoryChart(logs)}
  ${Object.values(bySession).map(s => {
    const st = s.logs.reduce((a,b) => a + Number(b.timeMinutes || 0), 0);
    return `<div class="item"><div class="item-title"><strong>${escapeHtml(s.name)}</strong><span class="badge">${s.logs.length} exercises · ${st.toFixed(1)}m</span></div><table class="history-table today-table"><thead><tr><th>Exercise</th><th>Type</th><th>Score</th><th>Performance</th><th>Target version</th><th>Time</th><th>Actions</th></tr></thead><tbody>${s.logs.map(l => renderSessionLogRow(l)).join("")}</tbody></table></div>`;
  }).join("")}`;
}


function renderStats() {
  const period = $("statsPeriodSelect").value || "daily";
  const rid = $("statsRoutineSelect").value;
  const dateKey = $("statsDateSelect").value || localDateKey();
  const range = getPeriodRange(period, dateKey);
  const rollingWindow = Math.max(2, Number($("rollingWindowInput").value || 5));
  const benchmarkWindow = Math.max(3, Number($("benchmarkWindowInput").value || 10));

  let scopedLogs = period === "overall" ? data.logs.slice() : logsInRange(data.logs, range.start, range.end);
  scopedLogs = scopedLogs.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));

  if (statsMode === "overview") {
    $("statsOutput").innerHTML = renderStatsOverview(scopedLogs, rid, period, range, rollingWindow);
    return;
  }

  let html = `<h3>${period === "exercise" ? "Per exercise view" : "Training view"} — ${escapeHtml(range.label)}</h3>`;
  html += renderDateView(scopedLogs);

  if (scopedLogs.length) {
    html += `<h3>Volume chart</h3>${renderVolumeChart(bucketLogs(scopedLogs, period === "overall" ? "monthly" : period), "time", "Training time")}`;
    html += `<h3>Exercise mix</h3>${renderCategoryChart(scopedLogs)}`;
    const alloc = computeAllocation(scopedLogs); html += `<div class="analytics-note"><strong>Allocation:</strong> ${alloc.map(a=>`<span class="badge">${escapeHtml(a.cat)}: ${a.pct.toFixed(1)}%</span>`).join("")}</div>`;
    html += renderAdvancedAnalytics(scopedLogs, rollingWindow, benchmarkWindow);
    html += renderSecondOrderAnalytics(scopedLogs, rid, rollingWindow);
    html += renderPerformanceStability(scopedLogs);
    html += renderFatigueSlope(scopedLogs);
    html += renderDifficultyLadder(scopedLogs);
    html += renderCoachingEngine(scopedLogs);
  }

  if (rid) {
    const exerciseBase = period === "exercise" || period === "overall" ? data.logs : scopedLogs;
    const exerciseLogs = exerciseBase.filter(l => l.routineId === rid).sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
    html += renderExerciseProgression(exerciseLogs, rollingWindow, benchmarkWindow);
  }

  $("statsOutput").innerHTML = html;
}
