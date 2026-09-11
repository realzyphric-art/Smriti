import type { GameSession, Reminder } from '@/types';
import { GAME_DEFINITIONS } from './gameService';

const avg = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;

export async function downloadCaregiverReport({ patientName, sessions, reminders }: { patientName: string; sessions: GameSession[]; reminders: Reminder[] }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' }); const margin = 44; let y = 52;
  const completed = sessions.filter((session) => session.completed); const score = avg(completed.map((session) => session.score)); const response = avg(completed.map((session) => session.durationSec));
  const byGame = Object.entries(completed.reduce<Record<string, GameSession[]>>((groups, session) => { (groups[session.gameType] ??= []).push(session); return groups; }, {}));
  const byCategory = Object.entries(completed.reduce<Record<string, GameSession[]>>((groups, session) => { const category = GAME_DEFINITIONS[session.gameType].category; (groups[category] ??= []).push(session); return groups; }, {}));
  const add = (text: string, size = 10, bold = false) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); const lines = doc.splitTextToSize(text, 505); if (y + lines.length * (size + 4) > 790) { doc.addPage(); y = 52; } doc.text(lines, margin, y); y += lines.length * (size + 4) + 8; };
  doc.setFillColor(27, 107, 69); doc.rect(0, 0, 595, 28, 'F'); add('Smriti - Patient Activity Report', 20, true); add(`Patient: ${patientName}`, 13, true); add(`Report date: ${new Date().toLocaleDateString()}`); add('This report describes activity and performance trends. It is not a medical diagnosis.', 9);
  add('Activity summary', 14, true); add(`Total completed sessions: ${completed.length}    Average accuracy: ${score}%    Average response time: ${response}s`); add(`Reminder completion today: ${reminders.filter((r) => r.completed).length}/${reminders.length}`);
  add('Performance by game', 14, true); byGame.forEach(([game, entries]) => add(`${GAME_DEFINITIONS[game as keyof typeof GAME_DEFINITIONS]?.title ?? game}: ${entries.length} sessions, ${avg(entries.map((entry) => entry.accuracy))}% accuracy, current level ${entries[0]?.level ?? 1}`));
  add('Performance by cognitive category', 14, true); byCategory.forEach(([category, entries]) => add(`${category}: ${avg(entries.map((entry) => entry.accuracy))}% average accuracy`));
  add('Recent trend', 14, true); const recent = completed.slice(0, 5); const prior = completed.slice(5, 10); const trend = avg(recent.map((entry) => entry.score)) - avg(prior.map((entry) => entry.score)); add(trend >= 5 ? 'Improving: recent activity scores are higher than the preceding sessions.' : trend <= -5 ? 'Needs more practice: recent activity scores are lower than the preceding sessions.' : 'Stable: recent activity scores are broadly steady.');
  add('Difficulty progression', 14, true); add(completed.length ? completed.slice(0, 8).map((entry) => `${GAME_DEFINITIONS[entry.gameType].title}: level ${entry.level}, ${entry.score}%`).join(' | ') : 'No game sessions have been completed yet.');
  doc.save(`${patientName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-activity-report.pdf`);
}
