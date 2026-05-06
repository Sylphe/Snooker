/* v4.14.2 phase1: extracted pure render helpers */

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

