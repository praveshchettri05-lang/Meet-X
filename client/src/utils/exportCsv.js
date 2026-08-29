/**
 * Exports attendance records to a CSV file and triggers download.
 *
 * @param {object} data - { meeting, attendance } from the attendance API
 */
export function exportAttendanceCsv(data) {
  const { meeting, attendance } = data;

  // Build header row
  const headers = [
    'Roll Number',
    'Name',
    'Email',
    'Joined At',
    'Left At',
    'Total Minutes',
    'Attendance %',
    'Status',
    'Pings Sent',
    'Pings Reacted',
    'Attentiveness %',
  ];

  // Build data rows
  const rows = attendance.map((att) => [
    att.rollNumber,
    att.name,
    att.email,
    formatDateTime(att.joinedAt),
    att.leftAt ? formatDateTime(att.leftAt) : 'Still in meeting',
    att.totalMinutes,
    att.percentage + '%',
    att.status.charAt(0).toUpperCase() + att.status.slice(1),
    att.pingsSent,
    att.pingsReacted,
    att.attentivenessRate !== null ? att.attentivenessRate + '%' : 'N/A',
  ]);

  // Add summary row
  rows.push([]);
  rows.push(['MEETING SUMMARY']);
  rows.push(['Title', meeting.title]);
  rows.push(['Room Code', meeting.roomCode]);
  rows.push(['Host', meeting.host]);
  rows.push(['Started At', formatDateTime(meeting.startedAt)]);
  rows.push(['Ended At', meeting.endedAt ? formatDateTime(meeting.endedAt) : 'Ongoing']);
  rows.push(['Duration (minutes)', meeting.durationMinutes]);
  rows.push(['Total Participants', data.summary.total]);
  rows.push(['Good Attendance (≥75%)', data.summary.good]);
  rows.push(['Partial Attendance (50-74%)', data.summary.partial]);
  rows.push(['Poor Attendance (<50%)', data.summary.poor]);
  rows.push(['Average Attendance %', data.summary.averagePercentage + '%']);

  // Combine and escape
  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
    ),
  ].join('\n');

  // Trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute(
    'download',
    `attendance_${meeting.roomCode}_${formatDateForFilename(meeting.startedAt)}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatDateTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function formatDateForFilename(isoString) {
  if (!isoString) return 'unknown';
  const d = new Date(isoString);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
