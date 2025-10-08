// app/contexts/TournamentContext.tsx
import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface TournamentItem {
  tournament_ID: string;
  tournament_Name: string;
}

interface TournamentContextType {
  tournamentsNow: TournamentItem[];
  tournamentsPast: TournamentItem[];
  setTournaments: (now: TournamentItem[], past: TournamentItem[]) => void;
}

const TournamentContext = createContext<TournamentContextType | undefined>(undefined);

export const TournamentProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tournamentsNow, setTournamentsNow] = useState<TournamentItem[]>([]);
  const [tournamentsPast, setTournamentsPast] = useState<TournamentItem[]>([]);

  const setTournaments = (now: TournamentItem[], past: TournamentItem[]) => {
    setTournamentsNow(now);
    setTournamentsPast(past);
  };

  return (
    <TournamentContext.Provider value={{ tournamentsNow, tournamentsPast, setTournaments }}>
      {children}
    </TournamentContext.Provider>
  );
};

export const useTournaments = () => {
  const context = useContext(TournamentContext);
  if (!context) {
    throw new Error('useTournaments must be used within a TournamentProvider');
  }
  return context;
};