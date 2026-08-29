import { useState, useEffect } from 'react';
import { exportAttendanceCsv } from '../utils/exportCsv';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * Attendance dashboard — shows live or post-meeting attendance.
 * Used both inside the meeting sidebar and on the /attendance/:roomCode page.
 *
 * @param {string}  roomCode
 * @param {object}  firebaseUser - Firebase user for token
 * @param {boolean} isLive - true = inside meeting (compact), false = full page
 */
export default function AttendanceDashboard({ roomCode, firebaseUser, isLive = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState(null);

  async function fetchAttendance() {
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`${API_URL}/api/attendance/${roomCode}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to load attendance');
      }
      const json = await res.json();
      setData(json);
      setLastRefresh(new Date());
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAttendance();
    // Auto-refresh every 30 seconds when live
    if (isLive) {
      const interval = setInterval(fetchAttendance, 30000);
      return () => clearInterval(interval);
    }
  }, [roomCode]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-6 h-6 border-2 border-meet-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-meet-red text-sm">
        <p>⚠️ {error}</p>
        <button onClick={fetchAttendance} className="btn-secondary mt-2 text-xs !py-1.5 !px-3">
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { meeting, attendance, summary } = data;

  function formatTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  const StatusBadge = ({ status }) => {
    const cls = {
      good: 'badge-good',
      partial: 'badge-partial',
      poor: 'badge-poor',
    }[status] || 'badge-poor';
    return (
      <span className={cls}>
        {status === 'good' ? '✅ Good' : status === 'partial' ? '⚠️ Partial' : '❌ Poor'}
      </span>
    );
  };

  return (
    <div className={`flex flex-col ${isLive ? 'h-full' : 'min-h-screen bg-meet-light'}`}>
      {/* Header */}
      <div className={`${isLive ? 'px-4 py-3 border-b border-gray-200' : 'bg-white px-6 py-4 border-b border-gray-200'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className={`font-semibold text-meet-dark ${isLive ? 'text-base' : 'text-xl'}`}>
              📋 Attendance Report
            </h3>
            {!isLive && (
              <p className="text-sm text-meet-gray mt-0.5">
                {meeting.title} · {formatTime(meeting.startedAt)}
                {meeting.isOngoing && (
                  <span className="ml-2 bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full animate-pulse">
                    LIVE
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isLive && (
              <button
                onClick={fetchAttendance}
                title="Refresh"
                className="text-meet-gray hover:text-meet-blue transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}
            {!isLive && (
              <button
                onClick={() => exportAttendanceCsv(data)}
                className="btn-primary flex items-center gap-2 text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export CSV
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className={`grid grid-cols-2 gap-2 ${isLive ? 'p-3' : 'p-4 sm:grid-cols-4'}`}>
        {[
          { label: 'Total', value: summary.total, color: 'text-meet-dark' },
          { label: 'Good ≥75%', value: summary.good, color: 'text-meet-green' },
          { label: 'Partial', value: summary.partial, color: 'text-yellow-600' },
          { label: 'Poor <50%', value: summary.poor, color: 'text-meet-red' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-lg p-3 text-center shadow-sm">
            <div className={`text-xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-meet-gray mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Average */}
      <div className={`${isLive ? 'px-3 pb-2' : 'px-4 pb-3'}`}>
        <div className="bg-meet-blue/10 rounded-lg px-3 py-2 text-center">
          <span className="text-meet-blue font-semibold text-lg">{summary.averagePercentage}%</span>
          <span className="text-meet-gray text-sm ml-2">average attendance</span>
        </div>
      </div>

      {/* Attendance table */}
      <div className="flex-1 overflow-y-auto">
        {isLive ? (
          /* Compact list for sidebar */
          <div className="px-3 pb-3 space-y-2">
            {attendance.map((att) => (
              <div key={att.userId} className="bg-white rounded-lg p-2.5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-meet-dark truncate">{att.name}</p>
                    <p className="text-xs text-meet-gray">{att.rollNumber}</p>
                  </div>
                  <StatusBadge status={att.status} />
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-meet-gray">
                  <span>Joined: {formatTime(att.joinedAt)}</span>
                  <span>•</span>
                  <span className="font-semibold text-meet-blue">{att.percentage}%</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Full table for standalone page */
          <div className="p-4 overflow-x-auto">
            <table className="w-full bg-white rounded-xl shadow-sm overflow-hidden min-w-[640px]">
              <thead className="bg-gray-50">
                <tr>
                  {['Roll No', 'Name', 'Joined', 'Left', 'Duration', 'Attendance', 'Pings', 'Status'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-meet-gray px-4 py-3 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {attendance.map((att) => (
                  <tr key={att.userId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-mono text-meet-gray">{att.rollNumber}</td>
                    <td className="px-4 py-3 text-sm font-medium text-meet-dark">{att.name}</td>
                    <td className="px-4 py-3 text-sm text-meet-gray">{formatTime(att.joinedAt)}</td>
                    <td className="px-4 py-3 text-sm text-meet-gray">
                      {att.leftAt ? formatTime(att.leftAt) : (
                        <span className="text-meet-green font-medium">In meeting</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-meet-gray">{att.totalMinutes} min</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-1.5 min-w-[60px]">
                          <div
                            className={`h-1.5 rounded-full ${
                              att.percentage >= 75 ? 'bg-meet-green' :
                              att.percentage >= 50 ? 'bg-yellow-400' : 'bg-meet-red'
                            }`}
                            style={{ width: `${att.percentage}%` }}
                          />
                        </div>
                        <span className="text-sm font-semibold text-meet-dark w-10 text-right">
                          {att.percentage}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-meet-gray">
                      {att.pingsSent > 0 ? (
                        <span>
                          {att.pingsReacted}/{att.pingsSent}
                          {att.attentivenessRate !== null && (
                            <span className="ml-1 text-xs text-meet-gray">({att.attentivenessRate}%)</span>
                          )}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={att.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Last refresh */}
      {isLive && lastRefresh && (
        <div className="px-4 py-2 border-t border-gray-100 text-xs text-meet-gray text-center">
          Last updated: {formatTime(lastRefresh)} · Auto-refreshes every 30s
        </div>
      )}
    </div>
  );
}
