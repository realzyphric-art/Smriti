import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PatientProfile, PatientRecord } from '@/types';
import { createProfile, profiles, removeProfile, updateProfile } from '@/services/profileService';
import { listAuthorizedPatients, patientPhotoUrl, updatePatient, uploadPatientPhoto } from '@/services/patientService';
import { useSettings } from '@/hooks/useSettings';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { GUEST_PATIENT_ID } from '@/services/guestService';
import { useI18n } from '@/i18n';
import { ageFromDateOfBirth, dateOfBirthFromAge } from '@/utils/date';

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read the image.'));
    reader.readAsDataURL(file);
  });
}

export function Profiles() {
  const { settings, updateActiveProfile } = useSettings();
  const navigate = useNavigate();
  const { t } = useI18n();
  const cloudMode = Boolean(settings.authenticated && !settings.guestMode);
  const [list, setList] = useState<PatientProfile[]>([]);
  const [cloudList, setCloudList] = useState<PatientRecord[]>([]);
  const [loadingCloud, setLoadingCloud] = useState(cloudMode);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [notes, setNotes] = useState('');
  const [interests, setInterests] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const reloadLocal = () => profiles().then((all) => setList(settings.guestMode ? all.filter((profile) => profile.id === GUEST_PATIENT_ID) : all.filter((profile) => profile.id !== GUEST_PATIENT_ID)));

  useEffect(() => {
    if (cloudMode) {
      setLoadingCloud(true);
      listAuthorizedPatients().then(setCloudList).catch((error) => setMessage(error instanceof Error ? error.message : t('profiles.loadError'))).finally(() => setLoadingCloud(false));
    } else {
      void reloadLocal();
    }
  }, [cloudMode, settings.guestMode]);

  const activeCloudPatient = cloudList.find((patient) => patient.id === settings.activePatientId) ?? cloudList[0];

  useEffect(() => {
    if (!cloudMode || !activeCloudPatient) return;
    setName(activeCloudPatient.name);
    setAge(String(ageFromDateOfBirth(activeCloudPatient.date_of_birth) ?? ''));
    setNotes(activeCloudPatient.notes ?? '');
    setInterests(activeCloudPatient.interests ?? '');
    setPhoto(null);
  }, [cloudMode, activeCloudPatient?.id]);

  const resetForm = () => { setName(''); setAge(''); setNotes(''); setInterests(''); setPhoto(null); setEditingId(null); };
  const validAge = () => {
    const numericAge = age.trim() ? Number(age) : null;
    return numericAge === null || (Number.isInteger(numericAge) && numericAge >= 1 && numericAge <= 120) ? numericAge : undefined;
  };

  const saveCloud = async () => {
    if (!activeCloudPatient || !name.trim()) return;
    const numericAge = validAge();
    if (numericAge === undefined) { setMessage(t('profiles.ageError')); return; }
    try {
      const profilePhotoPath = photo ? await uploadPatientPhoto(activeCloudPatient.id, photo) : activeCloudPatient.profile_photo_path ?? null;
      const updated = await updatePatient(activeCloudPatient.id, {
        name,
        date_of_birth: numericAge === null ? null : dateOfBirthFromAge(numericAge),
        notes,
        interests,
        profile_photo_path: profilePhotoPath,
      });
      const avatarUrl = await patientPhotoUrl(updated.profile_photo_path ?? null);
      setCloudList((current) => current.map((patient) => patient.id === updated.id ? updated : patient));
      updateActiveProfile({ id: updated.id, patientName: updated.name, avatarUrl });
      setPhoto(null);
      setMessage(t('profiles.saved'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('profiles.saveError'));
    }
  };

  const saveLocal = async () => {
    if (!name.trim()) return;
    const numericAge = validAge();
    if (numericAge === undefined) { setMessage(t('profiles.ageError')); return; }
    const profilePhotoUrl = photo ? await fileAsDataUrl(photo) : undefined;
    const details = { dateOfBirth: numericAge === null ? null : dateOfBirthFromAge(numericAge), notes, interests };
    if (editingId) {
      const existing = list.find((profile) => profile.id === editingId);
      if (!existing) return;
      const updated = { ...existing, name: name.trim(), ...details, ...(profilePhotoUrl ? { profilePhotoUrl } : {}) };
      await updateProfile(updated);
      if (settings.activePatientId === updated.id) updateActiveProfile({ patientName: updated.name, avatarUrl: updated.profilePhotoUrl ?? null });
    } else {
      const created = await createProfile(name, { ...details, profilePhotoUrl: profilePhotoUrl ?? null });
      updateActiveProfile({ id: created.id, patientName: created.name, avatarUrl: created.profilePhotoUrl ?? null });
    }
    resetForm();
    await reloadLocal();
  };

  const select = (profile: PatientProfile) => updateActiveProfile({ id: profile.id, patientName: profile.name, avatarUrl: profile.profilePhotoUrl ?? null });
  const edit = (profile: PatientProfile) => { setEditingId(profile.id); setName(profile.name); setAge(String(ageFromDateOfBirth(profile.dateOfBirth) ?? '')); setNotes(profile.notes ?? ''); setInterests(profile.interests ?? ''); setPhoto(null); };
  const erase = async (profile: PatientProfile) => { if (!window.confirm(t('profiles.deleteConfirm', { name: profile.name }))) return; await removeProfile(profile.id); if (settings.activePatientId === profile.id) updateActiveProfile({ id: 'local-profile', patientName: '', avatarUrl: null }); void reloadLocal(); };

  const photoField = <div className="field"><label className="field__label" htmlFor="profile-photo">Patient profile photo</label><input id="profile-photo" className="input" type="file" accept="image/*" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} /><small className="muted">This photo appears in the top-right profile circle.</small></div>;

  return <>
    <AppHeader subtitle={t('profiles.title')} showBack onBack={() => navigate('/settings')} />
    <main className="page stack">
      <h1 className="page-title">{cloudMode ? t('profiles.cloudTitle') : t('profiles.title')}</h1>
      <p className="muted">{cloudMode ? t('profiles.cloudSubtitle') : t('profiles.subtitle')}</p>
      {cloudMode ? <>
        {loadingCloud ? <div className="card muted">{t('profiles.loading')}</div> : activeCloudPatient ? <div className="card stack-sm">
          <label className="field__label" htmlFor="profile-name">{t('profiles.newName')}</label><input id="profile-name" className="input" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
          <div className="grid-2"><div><label className="field__label" htmlFor="profile-age">{t('profiles.age')}</label><input id="profile-age" className="input" value={age} onChange={(event) => setAge(event.target.value.replace(/\D/g, '').slice(0, 3))} type="number" min="1" max="120" inputMode="numeric" placeholder={t('profiles.ageOptional')} /></div><div><label className="field__label" htmlFor="profile-interests">{t('profiles.interests')}</label><input id="profile-interests" className="input" value={interests} onChange={(event) => setInterests(event.target.value)} placeholder={t('profiles.interestsPlaceholder')} /></div></div>
          <label className="field__label" htmlFor="profile-notes">{t('profiles.notes')}</label><textarea id="profile-notes" className="input" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t('profiles.notesPlaceholder')} />
          {photoField}
          <small className="muted">{t('profiles.ageHint')}</small><Button block onClick={() => void saveCloud()}>{t('profiles.save')}</Button>
        </div> : <div className="card muted">{t('profiles.empty')}</div>}
        {message && <p className="muted" role="status">{message}</p>}
      </> : <>
        <div className="card stack-sm"><label className="field__label" htmlFor="profile-name">{t('profiles.newName')}</label><input id="profile-name" className="input" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
          <div className="grid-2"><div><label className="field__label" htmlFor="profile-age">{t('profiles.age')}</label><input id="profile-age" className="input" value={age} onChange={(event) => setAge(event.target.value.replace(/\D/g, '').slice(0, 3))} type="number" min="1" max="120" inputMode="numeric" placeholder={t('profiles.ageOptional')} /></div><div><label className="field__label" htmlFor="profile-interests">{t('profiles.interests')}</label><input id="profile-interests" className="input" value={interests} onChange={(event) => setInterests(event.target.value)} placeholder={t('profiles.interestsPlaceholder')} /></div></div>
          <label className="field__label" htmlFor="profile-notes">{t('profiles.notes')}</label><textarea id="profile-notes" className="input" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t('profiles.notesPlaceholder')} />
          {photoField}
          <small className="muted">{t('profiles.ageHint')}</small><div className="row"><Button block onClick={() => void saveLocal()}>{editingId ? t('profiles.save') : t('profiles.add')}</Button>{editingId && <Button variant="ghost" onClick={resetForm}>{t('profiles.cancel')}</Button>}</div>
        </div>
        {list.length === 0 && <div className="card muted">{t('profiles.empty')}</div>}
        {list.map((profile) => <div className="card row-between" key={profile.id}><div><strong>{profile.name}</strong><div className="muted">{profile.id === settings.activePatientId ? t('profiles.active') : t('profiles.selectHint')}{ageFromDateOfBirth(profile.dateOfBirth) !== null ? ` · ${t('profiles.ageValue', { n: ageFromDateOfBirth(profile.dateOfBirth) ?? 0 })}` : ''}</div>{profile.interests && <div className="muted">{t('profiles.interests')}: {profile.interests}</div>}{profile.notes && <div className="muted">{profile.notes}</div>}</div><div className="row" style={{ gap: '0.4rem' }}><Button variant="ghost" onClick={() => select(profile)}>{t('profiles.select')}</Button><Button variant="ghost" onClick={() => edit(profile)}>{t('profiles.edit')}</Button><Button variant="ghost" onClick={() => void erase(profile)}>{t('profiles.delete')}</Button></div></div>)}
      </>}
    </main>
  </>;
}
