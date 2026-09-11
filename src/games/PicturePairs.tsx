import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { useVoice } from '@/hooks/useVoice';
import { useSettings } from '@/hooks/useSettings';
import { pairsConfig } from '@/services/gameService';
import { OBJECT_POOL, objectLabel } from '@/data/games';
import { shuffle, uid, type GameOutcome } from '@/utils/helpers';
import { Icon } from '@/components/Icon';
import { Button } from '@/components/Button';

interface Card {
  id: string;
  matchKey: string;
  emoji?: string;
  imageUrl?: string;
  label: string;
  matched: boolean;
  open: boolean;
  justMatched: boolean;
}

interface Props {
  level: number;
  onComplete: (o: GameOutcome) => void;
}

export function PicturePairs({ level, onComplete }: Props) {
  const { t } = useI18n();
  const { settings } = useSettings();
  const { say, enabled } = useVoice();
  const cfg = useMemo(() => pairsConfig(level), [level]);

  const [cards, setCards] = useState<Card[]>([]);
  const [phase, setPhase] = useState<'loading' | 'preview' | 'play' | 'done'>('loading');
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [taps, setTaps] = useState(0);
  const [comparisons, setComparisons] = useState(0);
  const [paused, setPaused] = useState(false);
  const [announce, setAnnounce] = useState('');
  const lockRef = useRef(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  const matchedPairs = cards.filter((c) => c.matched).length / 2;

  useEffect(() => {
    setPhase('loading');
    setCards([]);
    setOpenIds([]);
    setCards(buildObjectDeck(cfg.pairs, settings.language));
    setPhase('preview');
  }, [cfg.pairs, settings.language]);

  // Preview: reveal all briefly, then flip down and begin play.
  useEffect(() => {
    if (phase !== 'preview' || cards.length === 0) return;
    setCards((cs) => cs.map((c) => ({ ...c, open: true })));
    const id = window.setTimeout(() => {
      setCards((cs) => cs.map((c) => ({ ...c, open: false })));
      setPhase('play');
      if (enabled) say(t('pairs.instruction'));
    }, cfg.previewMs);
    return () => window.clearTimeout(id);
  }, [cards.length, cfg.previewMs, enabled, phase, say, t]);

  // Count active play time upward. Pausing also pauses the clock so the
  // recorded response time reflects time spent solving the activity.
  useEffect(() => {
    if (phase === 'preview') setElapsedSec(0);
    if (phase !== 'play' || paused) return;
    const id = window.setInterval(() => setElapsedSec((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(id);
  }, [paused, phase]);

  const finish = useCallback(
    (comps: number) => {
      const score = Math.max(
        0,
        Math.min(100, Math.round((cfg.pairs / Math.max(comps, cfg.pairs)) * 100)),
      );
      const durationSec = Math.max(1, elapsedSec);
      setPhase('done');
      setAnnounce(t('pairs.title') + ' — ' + t('result.greatJob'));
      window.setTimeout(
        () =>
          onComplete({
            score,
            accuracy: score,
            attempts: comps,
            durationSec,
          }),
        900,
      );
    },
    [cfg.pairs, elapsedSec, onComplete, t],
  );

  const handleTap = (card: Card) => {
    if (phase !== 'play' || paused || lockRef.current) return;
    if (card.matched || card.open) return;

    setTaps((n) => n + 1);
    const nextOpen = [...openIds, card.id];
    setCards((cs) =>
      cs.map((c) => (c.id === card.id ? { ...c, open: true } : c)),
    );
    setOpenIds(nextOpen);

    if (nextOpen.length === 2) {
      lockRef.current = true;
      const [a, b] = nextOpen.map((id) => cards.find((c) => c.id === id)!);
      const isMatch = a.matchKey === b.matchKey;
      const comps = comparisons + 1;
      setComparisons(comps);

      if (isMatch) {
        window.setTimeout(() => {
          setCards((cs) =>
            cs.map((c) =>
              nextOpen.includes(c.id)
                ? { ...c, matched: true, justMatched: true }
                : c,
            ),
          );
          setOpenIds([]);
          lockRef.current = false;
          setAnnounce(t('pairs.matched'));
          const done = cards.filter((c) => c.matched).length / 2 + 1;
          window.setTimeout(
            () =>
              setCards((cs) => cs.map((c) => ({ ...c, justMatched: false }))),
            400,
          );
          if (done >= cfg.pairs) finish(comps);
        }, 420);
      } else {
        window.setTimeout(() => {
          setCards((cs) =>
            cs.map((c) =>
              nextOpen.includes(c.id) ? { ...c, open: false } : c,
            ),
          );
          setOpenIds([]);
          lockRef.current = false;
        }, 900);
      }
    }
  };

  const wide = cfg.pairs >= 5;

  return (
    <div className="stack-lg">
      <p className="text-muted">{t('pairs.instruction')}</p>

      {/* Stats */}
      <div className="game-stats game-stats--four">
        <div className="game-stat">
          <div className="game-stat__value">
            {matchedPairs} / {cfg.pairs}
          </div>
          <div className="game-stat__label">{t('pairs.pairsFound')}</div>
        </div>
        <div className="game-stat">
          <div className="game-stat__value">{taps}</div>
          <div className="game-stat__label">{t('pairs.taps')}</div>
        </div>
        <div className="game-stat" role="timer" aria-label={t('pairs.timeElapsed')}>
          <div className="game-stat__value">{formatElapsed(elapsedSec)}</div>
          <div className="game-stat__label">{t('pairs.timeElapsed')}</div>
        </div>
        <button
          type="button"
          className="game-stat"
          onClick={() => setPaused(true)}
          aria-label={t('pairs.pause')}
          disabled={phase === 'done' || phase === 'loading'}
        >
          <div className="game-stat__value" aria-hidden="true">
            <Icon name="pause" size={22} />
          </div>
          <div className="game-stat__label">{t('pairs.pause')}</div>
        </button>
      </div>

      {/* Hint banner */}
      <div className="banner banner--amber">
        <Icon name="sparkle" size={22} />
        <span>
          {phase === 'loading'
            ? t('pairs.loading')
            : phase === 'preview'
              ? t('pairs.preview')
              : t('pairs.hint')}
        </span>
      </div>

      {/* Board */}
      <div className={`pairs-board ${wide ? 'pairs-board--wide' : ''}`}>
        {cards.map((card) => {
          const shown = card.open || card.matched;
          return (
            <button
              key={card.id}
              type="button"
              className={[
                'pair-card',
                card.matched ? 'pair-card--matched' : '',
                card.open && !card.matched ? 'pair-card--open' : '',
                card.justMatched ? 'pop' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => handleTap(card)}
              disabled={phase !== 'play' || card.matched || paused}
              aria-label={
                shown
                  ? `${card.label}${card.matched ? ', ' + t('pairs.matched') : ''}`
                  : t('pairs.tapToTurn')
              }
            >
              {card.matched && (
                <span className="pair-tag pair-tag--matched">
                  <Icon name="check" size={14} strokeWidth={3} /> {t('pairs.matched')}
                </span>
              )}
              {card.open && !card.matched && (
                <span className="pair-tag pair-tag--open">{t('pairs.open')}</span>
              )}
              <span className="pair-card__face" aria-hidden="true">
                {shown && card.imageUrl ? (
                  <img className="pair-card__image" src={card.imageUrl} alt="" />
                ) : shown && card.emoji ? (
                  card.emoji
                ) : (
                  <span className="pair-card__q">❓</span>
                )}
              </span>
              <span className="pair-card__label">
                {shown ? card.label : t('pairs.tapToTurn')}
              </span>
            </button>
          );
        })}
      </div>

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      {/* Pause overlay */}
      {paused && (
        <div className="pause-overlay">
          <div className="card card--pad-lg stack text-center" style={{ maxWidth: 360 }}>
            <span className="medallion medallion--amber medallion--lg" aria-hidden="true">
              ⏸️
            </span>
            <h2>{t('pairs.paused')}</h2>
            <Button variant="primary" size="lg" block icon="play" onClick={() => setPaused(false)}>
              {t('pairs.resume')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function buildObjectDeck(pairs: number, language: Parameters<typeof objectLabel>[1]): Card[] {
  const chosen = shuffle(OBJECT_POOL.map((_, index) => index)).slice(0, pairs);
  const deck: Card[] = [];
  for (const objIndex of chosen) {
    const obj = OBJECT_POOL[objIndex];
    for (let copy = 0; copy < 2; copy += 1) {
      deck.push({
        id: uid('c_'),
        matchKey: `object-${objIndex}`,
        emoji: obj.emoji,
        label: objectLabel(obj, language),
        matched: false,
        open: false,
        justMatched: false,
      });
    }
  }
  return shuffle(deck);
}
