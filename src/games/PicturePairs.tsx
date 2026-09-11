import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { useVoice } from '@/hooks/useVoice';
import { useSettings } from '@/hooks/useSettings';
import { pairsConfig } from '@/services/gameService';
import { listPeople, personPhotoPaths, personPhotoUrl } from '@/services/peopleService';
import { OBJECT_POOL, objectLabel } from '@/data/games';
import { isSupabaseConfigured } from '@/lib/supabase';
import { GUEST_PATIENT_ID } from '@/services/guestService';
import { storageService } from '@/services/storageService';
import { shuffle, uid, type GameOutcome } from '@/utils/helpers';
import { Icon } from '@/components/Icon';
import { Button } from '@/components/Button';

interface FamiliarPhoto {
  id: string;
  label: string;
  url: string;
}

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

const PHOTO_CURSOR_KEY = 'mc:picture-pairs-photo-cursor';

export function PicturePairs({ level, onComplete }: Props) {
  const { t } = useI18n();
  const { settings } = useSettings();
  const { say, enabled } = useVoice();
  const cfg = useMemo(() => pairsConfig(level), [level]);
  const patientId = settings.guestMode ? GUEST_PATIENT_ID : settings.activePatientId;
  const localStorageMode = settings.guestMode || !isSupabaseConfigured;

  const [cards, setCards] = useState<Card[]>([]);
  const [phase, setPhase] = useState<'loading' | 'preview' | 'play' | 'done'>('loading');
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [taps, setTaps] = useState(0);
  const [comparisons, setComparisons] = useState(0);
  const [paused, setPaused] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [usingFamiliarPhotos, setUsingFamiliarPhotos] = useState(false);
  const startRef = useRef(Date.now());
  const lockRef = useRef(false);

  const matchedPairs = cards.filter((c) => c.matched).length / 2;

  // Load every saved photo. A different slice is selected on each new round so
  // all uploaded photos rotate through the game instead of always using photo 1.
  useEffect(() => {
    let live = true;
    setPhase('loading');
    setCards([]);
    setOpenIds([]);
    setUsingFamiliarPhotos(false);

    const loadDeck = async () => {
      const familiarPhotos: FamiliarPhoto[] = [];
      if (patientId) {
        try {
          const people = await listPeople(patientId, localStorageMode);
          for (const person of people) {
            const paths = personPhotoPaths(person);
            const resolved = await Promise.all(
              paths.map(async (path, index) => {
                try {
                  const url = await personPhotoUrl(path, localStorageMode);
                  return url
                    ? { id: `${person.id}-${index}-${path}`, label: person.name, url }
                    : null;
                } catch {
                  return null;
                }
              }),
            );
            familiarPhotos.push(
              ...resolved.filter((photo): photo is FamiliarPhoto => Boolean(photo)),
            );
          }
        } catch {
          // Keep the game playable if the cloud is temporarily unavailable.
        }
      }

      if (!live) return;
      if (familiarPhotos.length > 0) {
        setCards(buildPhotoDeck(familiarPhotos, cfg.pairs, patientId ?? 'default'));
        setUsingFamiliarPhotos(true);
      } else {
        setCards(buildObjectDeck(cfg.pairs, settings.language));
      }
      setPhase('preview');
    };

    void loadDeck();
    return () => {
      live = false;
    };
  }, [cfg.pairs, localStorageMode, patientId, settings.language]);

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

  const finish = useCallback(
    (comps: number) => {
      const score = Math.max(
        0,
        Math.min(100, Math.round((cfg.pairs / Math.max(comps, cfg.pairs)) * 100)),
      );
      const durationSec = Math.round((Date.now() - startRef.current) / 1000);
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
    [cfg.pairs, onComplete, t],
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
      <div className="game-stats">
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
              : usingFamiliarPhotos
                ? t('pairs.familiarHint')
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

function buildPhotoDeck(photos: FamiliarPhoto[], pairs: number, patientId: string): Card[] {
  const cursorKey = `${PHOTO_CURSOR_KEY}:${patientId}`;
  const cursor = storageService.get<number>(cursorKey, 0);
  const count = Math.min(pairs, photos.length);
  const chosen = Array.from({ length: count }, (_, index) => photos[(cursor + index) % photos.length]);
  storageService.set(cursorKey, (cursor + count) % photos.length);

  const deck: Card[] = [];
  for (const photo of chosen) {
    for (let copy = 0; copy < 2; copy += 1) {
      deck.push({
        id: uid('photo_'),
        matchKey: photo.id,
        imageUrl: photo.url,
        label: photo.label,
        matched: false,
        open: false,
        justMatched: false,
      });
    }
  }
  return shuffle(deck);
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
