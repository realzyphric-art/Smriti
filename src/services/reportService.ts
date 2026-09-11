import type { GameSession, GameType, Reminder } from '@/types';
import { GAME_DEFINITIONS } from './gameService';

const DAY_MS = 86_400_000;
const avg = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

interface PeriodMetrics {
  sessions: GameSession[];
  completed: number;
  activeDays: number;
  accuracy: number;
  responseSec: number;
  totalMinutes: number;
  variability: number;
}

export interface WeeklyReportStats {
  current: PeriodMetrics;
  previous: PeriodMetrics;
  accuracyDelta: number | null;
  responseDelta: number | null;
  engagementDelta: number | null;
}

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function dateKey(value: number): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function metricsFor(sessions: GameSession[]): PeriodMetrics {
  const completed = sessions.filter((session) => session.completed);
  const accuracy = avg(completed.map((session) => session.accuracy));
  const variance = completed.length
    ? completed.reduce((sum, session) => sum + Math.pow(session.accuracy - accuracy, 2), 0) / completed.length
    : 0;
  return {
    sessions: completed,
    completed: completed.length,
    activeDays: new Set(completed.map((session) => dateKey(session.timestamp))).size,
    accuracy,
    responseSec: avg(completed.map((session) => session.durationSec)),
    totalMinutes: Math.round(completed.reduce((sum, session) => sum + session.durationSec, 0) / 60),
    variability: Math.round(Math.sqrt(variance)),
  };
}

export function buildWeeklyReportStats(sessions: GameSession[], now = new Date()): WeeklyReportStats {
  const tomorrow = startOfDay(now).getTime() + DAY_MS;
  const currentStart = tomorrow - 7 * DAY_MS;
  const previousStart = currentStart - 7 * DAY_MS;
  const complete = sessions.filter((session) => session.completed);
  const current = metricsFor(complete.filter((session) => session.timestamp >= currentStart && session.timestamp < tomorrow));
  const previous = metricsFor(complete.filter((session) => session.timestamp >= previousStart && session.timestamp < currentStart));
  const hasComparison = previous.completed > 0;
  return {
    current,
    previous,
    accuracyDelta: hasComparison ? current.accuracy - previous.accuracy : null,
    responseDelta: hasComparison ? current.responseSec - previous.responseSec : null,
    engagementDelta: hasComparison ? current.completed - previous.completed : null,
  };
}

function trendLabel(delta: number | null, higherIsBetter = true): string {
  if (delta === null) return 'Baseline - insufficient prior-week data';
  const adjusted = higherIsBetter ? delta : -delta;
  if (adjusted >= 5) return 'Improved';
  if (adjusted <= -5) return 'Reduced';
  return 'Stable';
}

export async function buildCaregiverReport({ patientName, sessions, reminders }: { patientName: string; sessions: GameSession[]; reminders: Reminder[] }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 44;
  const contentWidth = pageWidth - margin * 2;
  let y = 54;
  const stats = buildWeeklyReportStats(sessions);
  const current = stats.current;
  const sorted = [...current.sessions].sort((a, b) => a.timestamp - b.timestamp);

  const newPage = () => { doc.addPage(); y = 52; };
  const ensure = (height: number) => { if (y + height > pageHeight - 48) newPage(); };
  const text = (value: string, size = 10, bold = false, color: [number, number, number] = [42, 52, 48]) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(value, contentWidth);
    ensure(lines.length * (size + 4) + 10);
    doc.text(lines, margin, y);
    y += lines.length * (size + 4) + 8;
  };
  const heading = (value: string) => { ensure(32); y += 5; text(value, 14, true, [20, 92, 59]); };
  const metricBox = (x: number, width: number, label: string, value: string, detail: string) => {
    doc.setFillColor(241, 248, 244); doc.setDrawColor(188, 218, 201); doc.roundedRect(x, y, width, 70, 7, 7, 'FD');
    doc.setTextColor(20, 92, 59); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(value, x + 12, y + 23);
    doc.setTextColor(42, 52, 48); doc.setFontSize(9); doc.text(label, x + 12, y + 40);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(94, 107, 101); doc.setFontSize(8); doc.text(doc.splitTextToSize(detail, width - 24), x + 12, y + 54);
  };

  doc.setFillColor(27, 107, 69); doc.rect(0, 0, pageWidth, 30, 'F');
  text('Smriti - Weekly Patient Activity Report', 20, true, [20, 92, 59]);
  text(`Patient: ${patientName}`, 13, true);
  text(`Reporting period: ${new Date(Date.now() - 6 * DAY_MS).toLocaleDateString()} to ${new Date().toLocaleDateString()}`);
  text('Clinical context: This report summarizes performance during structured cognitive activities. It supports observation and care discussions, but it is not a diagnostic test and does not establish cognitive decline or improvement.', 9, false, [86, 97, 92]);

  heading('Weekly clinical-style summary');
  ensure(82);
  const gap = 8; const boxWidth = (contentWidth - gap * 2) / 3;
  metricBox(margin, boxWidth, 'Cognitive task accuracy', `${current.accuracy}%`, trendLabel(stats.accuracyDelta));
  metricBox(margin + boxWidth + gap, boxWidth, 'Mean response latency', `${current.responseSec}s`, trendLabel(stats.responseDelta, false));
  metricBox(margin + (boxWidth + gap) * 2, boxWidth, 'Engagement frequency', `${current.completed}`, `${current.activeDays} active days`);
  y += 84;

  const deltaText = (value: number | null, suffix: string) => value === null ? 'no comparison available' : `${value > 0 ? '+' : ''}${value}${suffix} versus previous week`;
  text(`Week-over-week comparison: accuracy ${deltaText(stats.accuracyDelta, ' percentage points')}; response latency ${deltaText(stats.responseDelta, ' seconds')}; completed sessions ${deltaText(stats.engagementDelta, '')}.`, 10);
  text(`Performance consistency: standard deviation ${current.variability} points. Lower variability indicates more consistent task scores; day-to-day variation may also reflect fatigue, sleep, mood, medication timing, pain, distractions, or device familiarity.`, 9);

  heading('Daily performance graph');
  ensure(190);
  const chartX = margin + 28; const chartY = y + 8; const chartW = contentWidth - 40; const chartH = 118;
  doc.setDrawColor(210, 220, 215); doc.setLineWidth(0.6);
  [0, 25, 50, 75, 100].forEach((tick) => {
    const lineY = chartY + chartH - (tick / 100) * chartH;
    doc.line(chartX, lineY, chartX + chartW, lineY);
    doc.setFontSize(7); doc.setTextColor(100, 110, 105); doc.text(String(tick), chartX - 22, lineY + 2);
  });
  const days = Array.from({ length: 7 }, (_, index) => startOfDay(new Date(Date.now() - (6 - index) * DAY_MS)));
  const barGap = 7; const barW = (chartW - barGap * 8) / 7;
  days.forEach((day, index) => {
    const key = dateKey(day.getTime()); const entries = sorted.filter((session) => dateKey(session.timestamp) === key); const value = avg(entries.map((entry) => entry.accuracy));
    const height = (value / 100) * chartH; const x = chartX + barGap + index * (barW + barGap);
    doc.setFillColor(entries.length ? 52 : 211, entries.length ? 143 : 220, entries.length ? 94 : 215); doc.roundedRect(x, chartY + chartH - height, barW, Math.max(height, 2), 2, 2, 'F');
    doc.setFontSize(7); doc.setTextColor(70, 80, 75); doc.text(day.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3), x + barW / 2, chartY + chartH + 13, { align: 'center' });
    doc.text(entries.length ? `${value}%` : '-', x + barW / 2, chartY + chartH - height - 5, { align: 'center' });
  });
  y = chartY + chartH + 30;
  text('Bars show mean task accuracy for each day. A missing bar means no completed session.', 8, false, [86, 97, 92]);

  heading('Performance by cognitive task');
  const byGame = Object.entries(current.sessions.reduce<Record<string, GameSession[]>>((groups, session) => { (groups[session.gameType] ??= []).push(session); return groups; }, {}));
  if (!byGame.length) text('No completed activities were recorded during this reporting period.');
  byGame.forEach(([game, entries]) => {
    ensure(44); const value = avg(entries.map((entry) => entry.accuracy)); const title = GAME_DEFINITIONS[game as GameType]?.title ?? game;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(42, 52, 48); doc.text(`${title} - ${value}%`, margin, y);
    doc.setFillColor(231, 238, 234); doc.roundedRect(margin, y + 7, contentWidth, 9, 4, 4, 'F');
    doc.setFillColor(238, 157, 58); doc.roundedRect(margin, y + 7, contentWidth * clamp(value / 100, 0, 1), 9, 4, 4, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(86, 97, 92); doc.text(`${entries.length} sessions | mean duration ${avg(entries.map((entry) => entry.durationSec))}s | highest level ${Math.max(...entries.map((entry) => entry.level))}`, margin, y + 29);
    y += 42;
  });

  ensure(112);
  heading('Functional observations');
  const accuracyTrend = trendLabel(stats.accuracyDelta);
  const latencyTrend = trendLabel(stats.responseDelta, false);
  text(`Task accuracy was ${accuracyTrend.toLowerCase()} and response latency was ${latencyTrend.toLowerCase()} compared with the preceding seven-day period. Engagement totaled ${current.totalMinutes} minutes across ${current.completed} completed sessions.`);
  text('Suggested review points for a caregiver or clinician: attention to instructions, visual recognition, working memory, sequencing, task persistence, error correction, and the relationship between response speed and accuracy. Interpret results alongside daily functioning and the patient\'s usual baseline.', 9);

  heading('Reminder adherence snapshot');
  const completedReminders = reminders.filter((reminder) => reminder.completed).length;
  const adherence = reminders.length ? Math.round((completedReminders / reminders.length) * 100) : 0;
  text(reminders.length ? `${completedReminders} of ${reminders.length} active reminders are marked complete (${adherence}%). This is a task-adherence measure, not confirmation that medication or treatment was taken as prescribed.` : 'No reminder records were available for this report.');

  heading('When to seek professional review');
  text('Consider discussing a persistent multi-week reduction, a marked change from the person\'s usual baseline, or new difficulty with everyday activities with a qualified healthcare professional. Urgent or sudden confusion should be assessed promptly through appropriate medical services.', 9);

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page); doc.setDrawColor(220, 227, 223); doc.line(margin, pageHeight - 31, pageWidth - margin, pageHeight - 31);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(105, 115, 110);
    doc.text('Smriti activity monitoring report - not a medical diagnosis', margin, pageHeight - 17);
    doc.text(`Page ${page} of ${pages}`, pageWidth - margin, pageHeight - 17, { align: 'right' });
  }

  return doc;
}

export async function downloadCaregiverReport(input: { patientName: string; sessions: GameSession[]; reminders: Reminder[] }) {
  const doc = await buildCaregiverReport(input);
  doc.save(`${input.patientName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-weekly-activity-report.pdf`);
}
