export type TrainingType = 'ice' | 'ofp' | 'game';

export interface TrainingTeam {
  id: string;
  name: string;
}

export interface Training {
  id: string;
  uid: string;
  type: TrainingType;
  title: string;
  start_at: string;
  end_at: string;
  timezone: string;
  location: string;
  note: string;
  team: TrainingTeam;
  updated_at: string;
}

export interface TrainingResponse {
  status: 'success';
  data: Training[];
  count: number;
  generated_at?: string;
  timezone?: string;
}

export interface TrainingQuery {
  date_from: string;
  date_to: string;
  team?: string;
}
