/** Local calendar date, intentionally never UTC/ISO based. */
export function localDateKey(date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Stores an age entered in the UI as a stable date-of-birth value. */
export function dateOfBirthFromAge(age: number, now = new Date()): string {
  const date = new Date(now.getFullYear() - age, now.getMonth(), now.getDate());
  return localDateKey(date);
}

export function ageFromDateOfBirth(dateOfBirth?: string | null, now = new Date()): number | null {
  if (!dateOfBirth) return null;
  const birth = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(birth.getTime()) || birth > now) return null;
  let age = now.getFullYear() - birth.getFullYear();
  const birthdayPassed = now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!birthdayPassed) age -= 1;
  return age;
}
