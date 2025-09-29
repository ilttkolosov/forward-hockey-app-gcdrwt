
import { Player } from '../types';

export function getShortName(fullName: string): string {
  const parts = fullName.trim().split(' ');
  if (parts.length >= 2) {
    return `${parts[0]} ${parts[1]}`;
  }
  return fullName;
}

export function calculateAge(birthDate: string): number {
  try {
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    
    return age;
  } catch (error) {
    console.error('Error calculating age:', error);
    return 0;
  }
}

export function formatPlayerBirthDate(birthDate: string): string {
  try {
    const date = new Date(birthDate);
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch (error) {
    console.error('Error formatting birth date:', error);
    return birthDate;
  }
}

export function getPositionTabName(position: string): string {
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
}

export function getCaptainBadgeText(captainStatus: string): string {
  switch (captainStatus) {
    case 'К':
      return 'Капитан';
    case 'А':
      return 'Ассистент';
    default:
      return '';
  }
}

export function getHandednessText(handedness: string): string {
  switch (handedness) {
    case 'Левый':
      return 'Левый';
    case 'Правый':
      return 'Правый';
    default:
      return handedness || 'Не указано';
  }
}

export function getPlayersByPosition(players: Player[], position: string): Player[] {
  return players
    .filter(player => player.position === position)
    .sort((a, b) => a.number - b.number);
}

export function searchPlayersByQuery(players: Player[], query: string): Player[] {
  if (!query.trim()) {
    return players;
  }
  
  const searchTerm = query.toLowerCase().trim();
  
  return players.filter(player => 
    player.name.toLowerCase().includes(searchTerm) ||
    player.fullName?.toLowerCase().includes(searchTerm) ||
    player.position.toLowerCase().includes(searchTerm) ||
    player.number.toString().includes(searchTerm)
  );
}

export function getPlayerPositions(players: Player[]): string[] {
  const positions = [...new Set(players.map(player => player.position))];
  
  // Sort positions in a specific order
  const positionOrder = ['Вратарь', 'Защитник', 'Нападающий'];
  return positions.sort((a, b) => {
    const indexA = positionOrder.indexOf(a);
    const indexB = positionOrder.indexOf(b);
    
    if (indexA === -1 && indexB === -1) return a.localeCompare(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    
    return indexA - indexB;
  });
}

export function getPlayerStats(player: Player): Array<{ label: string; value: string }> {
  const stats = [];
  
  if (player.age) {
    stats.push({ label: 'Возраст', value: `${player.age} лет` });
  }
  
  if (player.height) {
    stats.push({ label: 'Рост', value: `${player.height} см` });
  }
  
  if (player.weight) {
    stats.push({ label: 'Вес', value: `${player.weight} кг` });
  }
  
  if (player.handedness) {
    stats.push({ label: 'Хват', value: getHandednessText(player.handedness) });
  }
  
  if (player.nationality) {
    stats.push({ label: 'Национальность', value: player.nationality });
  }
  
  return stats;
}
