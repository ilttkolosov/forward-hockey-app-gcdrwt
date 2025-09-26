
export const getShortName = (fullName: string): string => {
  const parts = fullName.trim().split(' ');
  return parts.length >= 2 ? `${parts[1]} ${parts[0]}` : fullName;
};

export const calculateAge = (dateString: string): number => {
  const birthDate = new Date(dateString.split(' ')[0]);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

export const getPositionDisplayName = (position: string): string => {
  switch (position) {
    case 'Вратарь':
      return 'Вратарь';
    case 'Защитник':
      return 'Защитник';
    case 'Нападающий':
      return 'Нападающий';
    default:
      return position;
  }
};

export const getPositionTabName = (position: string): string => {
  switch (position) {
    case 'Вратарь':
      return 'Вратари';
    case 'Защитник':
      return 'Защитники';
    case 'Нападающий':
      return 'Нападающие';
    default:
      return position;
  }
};

export const getCaptainBadgeText = (ka: string): string | null => {
  switch (ka) {
    case 'К':
      return 'К';
    case 'А':
      return 'А';
    default:
      return null;
  }
};

export const formatPlayerBirthDate = (dateString: string): string => {
  try {
    const date = new Date(dateString.split(' ')[0]);
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } catch (error) {
    return dateString;
  }
};

export const getHandednessText = (handedness: string): string => {
  switch (handedness) {
    case 'Левый':
      return 'Левый хват';
    case 'Правый':
      return 'Правый хват';
    default:
      return handedness || 'Не указан';
  }
};
