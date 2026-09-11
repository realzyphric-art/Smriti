import { Outlet } from 'react-router-dom';
import { BottomNavigation } from './BottomNavigation';

export function PatientLayout() {
  return (
    <>
      <Outlet />
      <BottomNavigation role="patient" />
    </>
  );
}

export function CaregiverLayout() {
  return (
    <>
      <Outlet />
      <BottomNavigation role="caregiver" />
    </>
  );
}
