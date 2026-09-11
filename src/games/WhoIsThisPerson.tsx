import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { useI18n } from '@/i18n';
import { useSettings } from '@/hooks/useSettings';
import { isSupabaseConfigured } from '@/lib/supabase';
import { GUEST_PATIENT_ID } from '@/services/guestService';
import { listPeople, personPhotoPaths, personPhotoUrl } from '@/services/peopleService';
import { storageService } from '@/services/storageService';
import type { PersonMemory } from '@/types';
import { shuffle, type GameOutcome } from '@/utils/helpers';

interface Props {
  level: number;
  patientId: string;
  onComplete: (outcome: GameOutcome) => void;
}

const PHOTO_CURSOR_KEY = 'mc:who-is-this-photo-cursor';

export function WhoIsThisPerson({ level, patientId, onComplete }: Props) {
  const { t } = useI18n();
  const { settings } = useSettings();
  const [people, setPeople] = useState<PersonMemory[]>([]);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [message, setMessage] = useState(t('familiar.loading'));
  const started = useRef(Date.now());
  const localStorageMode = settings.guestMode || !isSupabaseConfigured;
  const actualPatientId = settings.guestMode ? GUEST_PATIENT_ID : patientId;

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const entries = shuffle(await listPeople(actualPatientId, localStorageMode));
        const selectedPhotos: Record<string, string> = {};
        for (const person of entries) {
          const urls = (
            await Promise.all(
              personPhotoPaths(person).map(async (path) => {
                try {
                  return await personPhotoUrl(path, localStorageMode);
                } catch {
                  return null;
                }
              }),
            )
          ).filter((url): url is string => Boolean(url));
          if (urls.length > 0) {
            const key = `${PHOTO_CURSOR_KEY}:${actualPatientId}:${person.id}`;
            const cursor = storageService.get<number>(key, 0) % urls.length;
            selectedPhotos[person.id] = urls[cursor];
            storageService.set(key, (cursor + 1) % urls.length);
          }
        }
        if (!live) return;
        setPeople(entries);
        setPhotos(selectedPhotos);
        setMessage(entries.length ? t('familiar.question') : t('familiar.noPeople'));
      } catch {
        if (live) setMessage(t('familiar.unavailable'));
      }
    })();
    return () => {
      live = false;
    };
  }, [actualPatientId, localStorageMode, t]);

  const target = people[index];
  const options = useMemo(
    () =>
      target
        ? shuffle([
            target,
            ...people
              .filter((person) => person.id !== target.id)
              .slice(0, Math.max(1, Math.min(3, level + 1))),
          ]).slice(0, Math.min(4, people.length))
        : [],
    [target, people, level],
  );

  const answer = (person: PersonMemory) => {
    if (!target) return;
    const isCorrect = person.id === target.id;
    const nextCorrect = correct + (isCorrect ? 1 : 0);
    const nextMistakes = mistakes + (isCorrect ? 0 : 1);
    setCorrect(nextCorrect);
    setMistakes(nextMistakes);
    const next = index + 1;
    if (next >= Math.min(people.length, Math.max(3, level + 1))) {
      const attempts = next;
      onComplete({
        score: Math.round((nextCorrect / attempts) * 100),
        accuracy: Math.round((nextCorrect / attempts) * 100),
        attempts,
        mistakes: nextMistakes,
        responseTimeMs: Date.now() - started.current,
        durationSec: Math.round((Date.now() - started.current) / 1000),
        metrics: { people_shown: attempts, correct_answers: nextCorrect },
      });
    } else {
      setIndex(next);
      setMessage(
        isCorrect
          ? t('familiar.correctNext')
          : t('familiar.incorrectNext', { name: target.name }),
      );
    }
  };

  if (!target) {
    return (
      <div className="stack">
        <p className="text-muted">{message}</p>
        <Button block onClick={() => window.history.back()}>
          {t('familiar.goToPeople')}
        </Button>
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <p className="text-muted">{message}</p>
      <div className="card text-center stack">
        {photos[target.id] ? (
          <img
            src={photos[target.id]}
            alt={t('familiar.avatarAlt')}
            style={{
              width: 'min(100%, 19rem)',
              aspectRatio: '1',
              objectFit: 'cover',
              borderRadius: 'var(--radius-lg)',
              margin: '0 auto',
            }}
          />
        ) : (
          <div
            role="img"
            aria-label={t('familiar.avatarAlt')}
            style={{
              width: 'min(100%, 19rem)',
              aspectRatio: '1',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--secondary-container)',
              color: 'var(--secondary-dark)',
              fontSize: '5rem',
              fontWeight: 800,
            }}
          >
            {target.name.charAt(0).toUpperCase()}
          </div>
        )}
        <h2>{t('familiar.question')}</h2>
      </div>
      <div className="stack-sm">
        {options.map((person) => (
          <Button
            key={person.id}
            block
            size="lg"
            variant="secondary"
            onClick={() => answer(person)}
          >
            {person.name}
            {person.nickname ? ` (${person.nickname})` : ''}
          </Button>
        ))}
      </div>
    </div>
  );
}
