import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { selectMyAppRole } from '@/services/authService';
import { useSettings } from '@/hooks/useSettings';
import type { AppRole } from '@/types';

export function ChooseRole() {
  const { settings, update, updateActiveProfile } = useSettings(); const navigate = useNavigate(); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const choose = async (role: AppRole) => { setSaving(true); setError(''); try { const patientId = await selectMyAppRole(role); update({ role, needsRoleSelection: false }); if (role === 'patient' && patientId) updateActiveProfile({ id: patientId, patientName: settings.userName || 'My profile', role: 'patient' }); navigate(role === 'caregiver' ? '/caregiver' : '/home', { replace: true }); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save your role.'); } finally { setSaving(false); } };
  return <><AppHeader /><main className="page page--flow"><div className="card stack-lg text-center"><h1>How will you use Smriti?</h1><p className="text-muted">This helps set up the right experience. A caregiver can only view patients they are authorized to support.</p><Button size="lg" block disabled={saving} onClick={() => void choose('patient')}>I am using it for myself</Button><Button size="lg" block variant="secondary" disabled={saving} onClick={() => void choose('caregiver')}>I am a caregiver or family member</Button>{error && <p className="banner banner--amber" role="alert">{error}</p>}</div></main></>;
}
