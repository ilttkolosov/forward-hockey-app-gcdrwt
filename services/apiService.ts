
import { 
  ApiPlayerResponse, 
  ApiUpcomingEventsResponse, 
  ApiPastEventsResponse, 
  ApiTeam, 
  ApiLeague, 
  ApiSeason, 
  ApiVenue,
  ApiGameDetailsResponse
} from '../types';

class ApiService {
  private baseUrl = 'https://www.hc-forward.com/wp-json/app/v1';

  // Cache for team data to avoid repeated requests
  private teamCache: { [key: string]: ApiTeam } = {};
  private leagueCache: { [key: string]: ApiLeague } = {};
  private seasonCache: { [key: string]: ApiSeason } = {};
  private venueCache: { [key: string]: ApiVenue } = {};

  async fetchUpcomingEvents(): Promise<ApiUpcomingEventsResponse> {
    try {
      console.log('Fetching upcoming events from API...');
      const response = await fetch(`${this.baseUrl}/upcoming-events`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result: ApiUpcomingEventsResponse = await response.json();
      console.log('Upcoming events response:', result);
      console.log('Total upcoming events count:', result.count);
      
      return result;
    } catch (error) {
      console.error('Error fetching upcoming events:', error);
      throw error;
    }
  }

  async fetchPastEvents(): Promise<ApiPastEventsResponse> {
    try {
      console.log('=== API Service: Fetching past events ===');
      console.log('URL:', `${this.baseUrl}/past-events`);
      
      const response = await fetch(`${this.baseUrl}/past-events`);
      
      if (!response.ok) {
        console.error(`API Service: HTTP error! status: ${response.status}`);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result: ApiPastEventsResponse = await response.json();
      console.log('API Service: Past events response status:', result.status);
      console.log('API Service: Total past events count:', result.count);
      console.log('API Service: Data array length:', result.data?.length || 0);
      
      // Log the structure of the first few events for debugging
      if (result.data && result.data.length > 0) {
        console.log('=== API Service: First event structure ===');
        const firstEvent = result.data[0];
        console.log('Event ID:', firstEvent.event_id);
        console.log('Event Date:', firstEvent.event_date);
        console.log('Teams string:', firstEvent.teams);
        console.log('Results object:', firstEvent.results);
        console.log('Leagues:', firstEvent.leagues);
        console.log('Venues:', firstEvent.venues);
        console.log('Seasons:', firstEvent.seasons);
        
        if (result.data.length > 1) {
          console.log('=== API Service: Second event structure ===');
          const secondEvent = result.data[1];
          console.log('Event ID:', secondEvent.event_id);
          console.log('Teams string:', secondEvent.teams);
          console.log('Results object:', secondEvent.results);
        }
      } else {
        console.warn('API Service: No events in data array');
      }
      
      return result;
    } catch (error) {
      console.error('API Service: Error fetching past events:', error);
      throw error;
    }
  }

  async fetchGameById(gameId: string): Promise<ApiGameDetailsResponse> {
    try {
      console.log('Fetching game details for ID:', gameId);
      const response = await fetch(`${this.baseUrl}/events/${gameId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result: ApiGameDetailsResponse = await response.json();
      console.log('Game details response:', result);
      
      return result;
    } catch (error) {
      console.error('Error fetching game details:', error);
      throw error;
    }
  }

  async fetchTeam(teamId: string): Promise<ApiTeam> {
    // Check cache first
    if (this.teamCache[teamId]) {
      console.log(`API Service: Returning cached team data for ID: ${teamId} (${this.teamCache[teamId].name})`);
      return this.teamCache[teamId];
    }

    try {
      console.log(`API Service: Fetching team details for ID: ${teamId}`);
      const response = await fetch(`${this.baseUrl}/teams/${teamId}`);
      
      if (!response.ok) {
        console.error(`API Service: Team fetch failed for ID ${teamId}, status: ${response.status}`);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const team: ApiTeam = await response.json();
      console.log(`API Service: Team fetched successfully - ID: ${teamId}, Name: ${team.name}`);
      
      // Cache the result
      this.teamCache[teamId] = team;
      
      return team;
    } catch (error) {
      console.error(`API Service: Error fetching team details for ID ${teamId}:`, error);
      // Return fallback data
      const fallbackTeam = {
        id: teamId,
        name: `Team ${teamId}`,
        logo_url: ''
      };
      console.log(`API Service: Using fallback team data for ID ${teamId}:`, fallbackTeam);
      return fallbackTeam;
    }
  }

  async fetchLeague(leagueId: string): Promise<ApiLeague> {
    // Check cache first
    if (this.leagueCache[leagueId]) {
      console.log('Returning cached league data for ID:', leagueId);
      return this.leagueCache[leagueId];
    }

    try {
      console.log('Fetching league details for ID:', leagueId);
      const response = await fetch(`${this.baseUrl}/leagues/${leagueId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const league: ApiLeague = await response.json();
      console.log('League details fetched:', league);
      
      // Cache the result
      this.leagueCache[leagueId] = league;
      
      return league;
    } catch (error) {
      console.error('Error fetching league details:', error);
      // Return fallback data
      return {
        id: leagueId,
        name: `League ${leagueId}`
      };
    }
  }

  async fetchSeason(seasonId: string): Promise<ApiSeason> {
    // Check cache first
    if (this.seasonCache[seasonId]) {
      console.log('Returning cached season data for ID:', seasonId);
      return this.seasonCache[seasonId];
    }

    try {
      console.log('Fetching season details for ID:', seasonId);
      const response = await fetch(`${this.baseUrl}/seasons/${seasonId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const season: ApiSeason = await response.json();
      console.log('Season details fetched:', season);
      
      // Cache the result
      this.seasonCache[seasonId] = season;
      
      return season;
    } catch (error) {
      console.error('Error fetching season details:', error);
      // Return fallback data
      return {
        id: seasonId,
        name: `Season ${seasonId}`
      };
    }
  }

  async fetchVenue(venueId: string): Promise<ApiVenue> {
    // Check cache first
    if (this.venueCache[venueId]) {
      console.log('Returning cached venue data for ID:', venueId);
      return this.venueCache[venueId];
    }

    try {
      console.log('Fetching venue details for ID:', venueId);
      const response = await fetch(`${this.baseUrl}/venues/${venueId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const venue: ApiVenue = await response.json();
      console.log('Venue details fetched:', venue);
      
      // Cache the result
      this.venueCache[venueId] = venue;
      
      return venue;
    } catch (error) {
      console.error('Error fetching venue details:', error);
      // Return fallback data
      return {
        id: venueId,
        name: `Venue ${venueId}`
      };
    }
  }

  async fetchPlayers(): Promise<ApiPlayerResponse[]> {
    try {
      console.log('Fetching all players from API...');
      
      const response = await fetch(`${this.baseUrl}/players/`);
      
      if (!response.ok) {
        const errorMessage = `Error accessing players API! Status: ${response.status}`;
        console.error(errorMessage);
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      console.log('All player data fetched. Count:', data.length);
      
      if (!Array.isArray(data)) {
        console.error('Received data is not an array:', data);
        throw new Error('Invalid data format from API');
      }
      
      // Log first few players for debugging
      data.slice(0, 3).forEach((player: any, index: number) => {
        console.log(`Player ${index + 1} from API:`, {
          id: player.id,
          name: player.post_title,
          position: player.position,
          number: player.sp_number,
          sp_metrics: player.sp_metrics
        });
      });
      
      return data;
    } catch (error) {
      console.error('Error fetching players:', error);
      throw error;
    }
  }

  async fetchPlayerById(playerId: string): Promise<ApiPlayerResponse> {
    try {
      console.log('Fetching player details for ID:', playerId);
      const response = await fetch(`${this.baseUrl}/players/${playerId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const player: ApiPlayerResponse = await response.json();
      console.log('Player details fetched:', player);
      
      return player;
    } catch (error) {
      console.error('Error fetching player details:', error);
      throw error;
    }
  }

  async checkPlayersApiAvailability(): Promise<boolean> {
    try {
      console.log('Checking players API endpoint availability...');
      const response = await fetch(`${this.baseUrl}/players/`, { method: 'HEAD' });
      const isAvailable = response.ok;
      console.log('Players API endpoint available:', isAvailable);
      return isAvailable;
    } catch (error) {
      console.error('Error checking players API endpoint availability:', error);
      return false;
    }
  }

  // Helper function to parse "id:name" format strings
  parseIdNameString(idNameString: string | null): { id: string | null; name: string | null } {
    if (!idNameString || idNameString.trim() === '' || idNameString === 'null') {
      return { id: null, name: null };
    }

    const colonIndex = idNameString.indexOf(':');
    if (colonIndex === -1) {
      // No colon found, treat entire string as name
      return {
        id: null,
        name: idNameString.trim()
      };
    }

    const id = idNameString.substring(0, colonIndex).trim();
    const name = idNameString.substring(colonIndex + 1).trim();

    return {
      id: id || null,
      name: name || null
    };
  }

  // Helper function to determine game status
  determineGameStatus(eventDate: string, hasResults: boolean): 'upcoming' | 'live' | 'finished' {
    if (hasResults) {
      return 'finished';
    }
    
    const gameDate = new Date(eventDate);
    const now = new Date();
    
    if (gameDate > now) {
      return 'upcoming';
    }
    
    const diffInHours = (now.getTime() - gameDate.getTime()) / (1000 * 60 * 60);
    if (diffInHours >= 0 && diffInHours <= 3) {
      return 'live';
    }
    
    return 'finished';
  }

  // Helper function to format date and time - updated to handle time without seconds
  formatDateTime(eventDate: string): { date: string; time: string } {
    try {
      const [datePart, timePart] = eventDate.split(' ');
      
      // Format time without seconds as specified
      let formattedTime = '19:00'; // default
      if (timePart) {
        const timeParts = timePart.split(':');
        if (timeParts.length >= 2) {
          formattedTime = `${timeParts[0]}:${timeParts[1]}`;
        }
      }
      
      // Don't show time if it's 00:00 (unknown time)
      if (formattedTime === '00:00') {
        formattedTime = '';
      }
      
      return {
        date: datePart || eventDate,
        time: formattedTime
      };
    } catch (error) {
      console.error('Error formatting date/time:', error);
      return {
        date: eventDate,
        time: '19:00'
      };
    }
  }

  // Helper function to get outcome text in Russian
  getOutcomeText(outcome: string): string {
    switch (outcome) {
      case 'win':
        return 'Победа';
      case 'loss':
        return 'Поражение';
      case 'nich':
        return 'Ничья';
      default:
        return outcome;
    }
  }

  // Helper function to get tournament name from Leagues field
  getTournamentName(leaguesString: string): string {
    if (!leaguesString || leaguesString.trim() === '') {
      return 'Товарищеский матч';
    }
    
    const parsed = this.parseIdNameString(leaguesString);
    return parsed.name || 'Товарищеский матч';
  }
}

export const apiService = new ApiService();
