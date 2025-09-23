
import { Game, Player, Coach, Tournament, TeamStats } from '../types';

export const mockCurrentGame: Game = {
  id: '1',
  homeTeam: 'HC Forward',
  awayTeam: 'HC Dynamo',
  homeScore: 2,
  awayScore: 1,
  date: '2024-01-15',
  time: '19:30',
  venue: 'Forward Arena',
  status: 'live',
  tournament: 'Championship League',
};

export const mockUpcomingGames: Game[] = [
  {
    id: '2',
    homeTeam: 'HC Spartak',
    awayTeam: 'HC Forward',
    date: '2024-01-18',
    time: '20:00',
    venue: 'Spartak Ice Palace',
    status: 'upcoming',
    tournament: 'Championship League',
  },
  {
    id: '3',
    homeTeam: 'HC Forward',
    awayTeam: 'HC CSKA',
    date: '2024-01-22',
    time: '19:30',
    venue: 'Forward Arena',
    status: 'upcoming',
    tournament: 'Championship League',
  },
  {
    id: '4',
    homeTeam: 'HC Torpedo',
    awayTeam: 'HC Forward',
    date: '2024-01-25',
    time: '18:00',
    venue: 'Torpedo Stadium',
    status: 'upcoming',
    tournament: 'Championship League',
  },
];

export const mockGameArchive: Game[] = [
  {
    id: '5',
    homeTeam: 'HC Forward',
    awayTeam: 'HC Lokomotiv',
    homeScore: 3,
    awayScore: 2,
    date: '2024-01-10',
    time: '19:30',
    venue: 'Forward Arena',
    status: 'finished',
    tournament: 'Championship League',
  },
  {
    id: '6',
    homeTeam: 'HC Metallurg',
    awayTeam: 'HC Forward',
    homeScore: 1,
    awayScore: 4,
    date: '2024-01-05',
    time: '20:00',
    venue: 'Metallurg Arena',
    status: 'finished',
    tournament: 'Championship League',
  },
  {
    id: '7',
    homeTeam: 'HC Forward',
    awayTeam: 'HC Avangard',
    homeScore: 2,
    awayScore: 2,
    date: '2024-01-01',
    time: '15:00',
    venue: 'Forward Arena',
    status: 'finished',
    tournament: 'New Year Cup',
  },
];

export const mockPlayers: Player[] = [
  {
    id: '1',
    name: 'Alexander Petrov',
    position: 'Forward',
    number: 10,
    age: 28,
    height: '185 cm',
    weight: '82 kg',
    nationality: 'Russia',
  },
  {
    id: '2',
    name: 'Dmitry Volkov',
    position: 'Defenseman',
    number: 5,
    age: 31,
    height: '190 cm',
    weight: '88 kg',
    nationality: 'Russia',
  },
  {
    id: '3',
    name: 'Igor Smirnov',
    position: 'Goaltender',
    number: 1,
    age: 26,
    height: '188 cm',
    weight: '85 kg',
    nationality: 'Russia',
  },
  {
    id: '4',
    name: 'Pavel Kozlov',
    position: 'Forward',
    number: 17,
    age: 24,
    height: '180 cm',
    weight: '78 kg',
    nationality: 'Russia',
  },
  {
    id: '5',
    name: 'Sergey Morozov',
    position: 'Defenseman',
    number: 3,
    age: 29,
    height: '192 cm',
    weight: '90 kg',
    nationality: 'Russia',
  },
];

export const mockCoaches: Coach[] = [
  {
    id: '1',
    name: 'Viktor Tikhonov',
    role: 'Head Coach',
    experience: '15 years',
  },
  {
    id: '2',
    name: 'Alexei Kasatonov',
    role: 'Assistant Coach',
    experience: '8 years',
  },
  {
    id: '3',
    name: 'Vladislav Tretiak',
    role: 'Goaltending Coach',
    experience: '12 years',
  },
];

export const mockTournaments: Tournament[] = [
  {
    id: '1',
    name: 'Championship League',
    season: '2023-2024',
    status: 'active',
    teams: 16,
    games: 240,
  },
  {
    id: '2',
    name: 'Cup of Russia',
    season: '2023-2024',
    status: 'active',
    teams: 32,
    games: 64,
  },
  {
    id: '3',
    name: 'Continental Cup',
    season: '2023-2024',
    status: 'upcoming',
    teams: 8,
    games: 28,
  },
];

export const mockTeamStats: TeamStats = {
  wins: 18,
  losses: 8,
  draws: 4,
  goalsFor: 92,
  goalsAgainst: 67,
  points: 58,
  position: 3,
};
