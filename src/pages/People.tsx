import { useEffect, useState, type ChangeEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { useSettings } from '@/hooks/useSettings';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { listPeople, MAX_FAMILY_MEMBERS, MAX_PERSON_PHOTOS, personPhotoUrl, removePerson, savePerson } from '@/services/peopleService';
import type { PersonMemory, PersonRelationship } from '@/types';
import { ListSkeleton } from '@/components/Skeleton';
import { ContentState } from '@/components/ContentState';
import { inspectSupabase } from '@/lib/supabaseDiagnostics';
import { GUEST_PATIENT_ID } from '@/services/guestService';
import { errorLogger } from '@/services/errorLogger';
import { useI18n } from '@/i18n';

const relationships: PersonRelationship[] = ['family', 'friend', 'caregiver', 'clinician', 'other'];
const blank = (): Partial<PersonMemory> => ({ relationship: 'family', name: '', nickname: '', notes: '', photo_paths: [] });

function photoPathsFor(person: Partial<PersonMemory>): string[] {
  if (Array.isArray(person.photo_paths) && person.photo_paths.length > 0) return person.photo_paths.slice(0, MAX_PERSON_PHOTOS);
  return person.photo_path ? [person.photo_path] : [];
}

export function People() {
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const guest = Boolean(settings.guestMode);
  const localStorageMode = guest || !isSupabaseConfigured;
  const patientId = guest ? GUEST_PATIENT_ID : settings.activePatientId;
  const { t } = useI18n();
  const [people, setPeople] = useState<PersonMemory[]>([]);
  const [editing, setEditing] = useState<Partial<PersonMemory> | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [voice, setVoice] = useState<File | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState('');
  const [photoMessage, setPhotoMessage] = useState('');
  const [connection, setConnection] = useState<'missing' | 'unauthenticated' | 'ready' | 'request-error'>(localStorageMode || isSupabaseConfigured ? 'ready' : 'missing');
  const [loading, setLoading] = useState(Boolean(patientId && (localStorageMode || isSupabaseConfigured)));
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      if (!localStorageMode) {
        const diagnostic = await inspectSupabase();
        if (!diagnostic.clientInitialized || !supabase) { setConnection('missing'); return; }
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setConnection('unauthenticated'); return; }
      }
      const next = await listPeople(patientId, localStorageMode);
      setPeople(next);
      const urls = await Promise.all(next.map(async (person) => {
        const paths = photoPathsFor(person);
        const resolved = (await Promise.all(paths.map((path) => personPhotoUrl(path, localStorageMode)))).filter((url): url is string => Boolean(url));
        return [person.id, resolved] as const;
      }));
      setPhotoUrls(Object.fromEntries(urls));
      setConnection('ready');
      setMessage('');
    } catch (error) {
      void errorLogger.captureRequestError(error, { feature: 'people', eventType: 'PEOPLE_LOAD_FAILED', action: 'load_people', metadata: { storageMode: localStorageMode ? 'local' : 'cloud' } });
      setConnection('request-error');
      setMessage(t('people.unableToLoad'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, [patientId, guest]);

  const close = () => {
    if (saving) return;
    setEditing(null);
    setPhotos([]);
    setVoice(null);
    setPhotoMessage('');
  };

  const selectPhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith('image/'));
    setPhotos(selected.slice(0, MAX_PERSON_PHOTOS));
    setPhotoMessage(selected.length > MAX_PERSON_PHOTOS ? t('people.photoLimit') : '');
  };

  const save = async () => {
    if (!patientId || !editing?.name?.trim()) return;
    if (!editing.id && people.length >= MAX_FAMILY_MEMBERS) {
      setMessage(t('people.memberLimit'));
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      await savePerson({ ...editing, patient_id: patientId, name: editing.name.trim() }, photos, voice, localStorageMode);
      close();
      setMessage(t('people.saved'));
      await reload();
    } catch (error) {
      void errorLogger.captureRequestError(error, { feature: 'people', eventType: 'PEOPLE_SAVE_FAILED', action: 'save_person', metadata: { storageMode: localStorageMode ? 'local' : 'cloud' } });
      setMessage(error instanceof Error ? error.message : t('people.unableToSave'));
    } finally {
      setSaving(false);
    }
  };

  const erase = async (person: PersonMemory) => {
    if (!window.confirm(t('people.deleteConfirm', { name: person.name }))) return;
    try {
      await removePerson(person.id, localStorageMode);
      setMessage(t('people.deleted', { name: person.name }));
      await reload();
    } catch (error) {
      void errorLogger.captureRequestError(error, { feature: 'people', eventType: 'PEOPLE_DELETE_FAILED', action: 'delete_person', metadata: { storageMode: localStorageMode ? 'local' : 'cloud' } });
      setMessage(t('people.unableToDelete'));
    }
  };

  const back = location.pathname.startsWith('/caregiver') ? '/caregiver/patient' : '/settings';
  const atLimit = people.length >= MAX_FAMILY_MEMBERS;
  const editingExistingPhotos = editing?.id ? (photoUrls[editing.id] ?? []) : [];

  return (
    <>
      <AppHeader subtitle={t('people.title')} showBack onBack={() => navigate(back)} />
      <main className="page stack">
        <div>
          <h1 className="page-title">{t('people.title')}</h1>
          <p className="page-sub">{t('people.subtitle')}</p>
        </div>
        {connection === 'missing' ? <ContentState title={t('people.noConfig')} detail={t('people.noConfigBody')} tone="amber" /> : connection === 'unauthenticated' ? <ContentState title={t('people.signInRequired')} detail={t('people.signInBody')} tone="amber" /> : connection === 'request-error' ? <ContentState title={t('people.requestFailed')} detail={t('people.requestFailedBody')} tone="amber" /> : !patientId ? <ContentState title={t('people.choosePatient')} detail={t('people.choosePatientBody')} action={{ label: t('people.goChoosePatient'), onClick: () => navigate('/caregiver/patient') }} /> : <>
          <Button size="lg" block icon="plus" disabled={atLimit} onClick={() => setEditing(blank())}>{t('people.add')}</Button>
          {atLimit && <p className="muted people-limit-note">{t('people.memberLimit')}</p>}
          {loading ? <ListSkeleton count={3} /> : people.length === 0 ? <ContentState title={t('people.noMembers')} detail={t('people.noMembersBody')} action={{ label: t('people.add'), onClick: () => setEditing(blank()) }} /> : <div className="people-list">
            {people.map((person) => {
              const urls = photoUrls[person.id] ?? [];
              return <article className="person-row" key={person.id}>
                {urls.length > 0 ? <div className="person-row__photos" aria-label={`${person.name} photos`}>{urls.map((url, index) => <img key={url} src={url} alt={`${person.name} ${index + 1}`} width="76" height="76" loading="lazy" />)}</div> : <div className="person-row__identity"><span className="person-row__avatar" aria-hidden="true">{person.name.charAt(0).toUpperCase()}</span></div>}
                <div className="grow"><strong>{person.name}</strong><div className="muted">{person.nickname ? `${person.nickname} · ` : ''}{person.relationship}</div>{person.notes && <p className="muted">{person.notes}</p>}</div>
                <div className="person-row__actions"><Button variant="ghost" onClick={() => { setEditing(person); setPhotos([]); setVoice(null); setPhotoMessage(''); }}>{t('common.edit')}</Button><Button variant="ghost" onClick={() => void erase(person)}>{t('common.delete')}</Button></div>
              </article>;
            })}
          </div>}
        </>}
        {message && <p className="banner banner--soft" role="status">{message}</p>}
      </main>

      <Sheet open={Boolean(editing)} title={editing?.id ? t('people.edit') : t('people.addTitle')} onClose={close}>
        <div className="stack">
          <div className="field"><label className="field__label" htmlFor="person-name">{t('people.name')}</label><input id="person-name" className="input" value={editing?.name ?? ''} onChange={(event) => setEditing((value) => ({ ...value, name: event.target.value }))} autoFocus /></div>
          <div className="field"><label className="field__label" htmlFor="person-relationship">{t('people.relationship')}</label><select id="person-relationship" className="input" value={editing?.relationship ?? 'family'} onChange={(event) => setEditing((value) => ({ ...value, relationship: event.target.value as PersonRelationship }))}>{relationships.map((relationship) => <option key={relationship} value={relationship}>{relationship}</option>)}</select></div>
          <div className="field"><label className="field__label" htmlFor="person-nickname">{t('people.nickname')}</label><input id="person-nickname" className="input" value={editing?.nickname ?? ''} onChange={(event) => setEditing((value) => ({ ...value, nickname: event.target.value }))} /></div>
          <div className="field"><label className="field__label" htmlFor="person-notes">{t('people.notes')}</label><textarea id="person-notes" className="input" value={editing?.notes ?? ''} onChange={(event) => setEditing((value) => ({ ...value, notes: event.target.value }))} /></div>
          <div className="field">
            <label className="field__label" htmlFor="person-photos">{t('people.photo')}</label>
            <input id="person-photos" type="file" accept="image/*" multiple onChange={selectPhotos} />
            <small className="muted">{photos.length > 0 ? t('people.photosSelected', { count: photos.length }) : t('people.photoHint')}</small>
            {editingExistingPhotos.length > 0 && photos.length === 0 && <div className="person-row__photos person-row__photos--sheet" aria-label="Current photos">{editingExistingPhotos.map((url, index) => <img key={url} src={url} alt={`${editing?.name ?? 'Person'} ${index + 1}`} width="64" height="64" />)}</div>}
            {photoMessage && <p className="banner banner--amber" role="alert">{photoMessage}</p>}
          </div>
          <div className="field"><label className="field__label" htmlFor="person-voice">{t('people.voice')}</label><input id="person-voice" type="file" accept="audio/*" disabled={localStorageMode} onChange={(event) => setVoice(event.target.files?.[0] ?? null)} />{localStorageMode && <small className="muted">{t('people.localMedia')}</small>}</div>
          <div className="sheet-actions"><Button variant="ghost" onClick={close} disabled={saving}>{t('common.cancel')}</Button><Button icon="check" onClick={() => void save()} disabled={saving || !editing?.name?.trim()}>{saving ? t('people.saving') : t('people.save')}</Button></div>
        </div>
      </Sheet>
    </>
  );
}
