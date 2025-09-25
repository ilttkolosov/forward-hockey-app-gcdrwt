
import { ApiPlayerResponse, ApiUpcomingEventsResponse, ApiPastEventsResponse, ApiTeam, ApiLeague, ApiSeason, ApiVenue, ApiGameDetails, GameResult } from '../types';

class ApiService {
  private baseUrl = 'https://www.hc-forward.com/wp-json/app/v1';
  private playersUrl = 'https://www.hc-forward.com/wp-json/app/v1/players';

  // Cache for team data to avoid repeated requests
  private teamCache: { [key: string]: ApiTeam } = {};
  private leagueCache: { [key: string]: ApiLeague } = {};
  private seasonCache: { [key: string]: ApiSeason } = {};
  private venueCache: { [key: string]: ApiVenue } = {};
  private gameDetailsCache: { [key: string]: ApiGameDetails } = {};

  async fetchUpcomingEvents(): Promise<ApiUpcomingEventsResponse> {
    try {
      console.log('Fetching upcoming events from new API...');
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
      console.log('Fetching past events from new API...');
      const response = await fetch(`${this.baseUrl}/past-events`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result: ApiPastEventsResponse = await response.json();
      console.log('Past events response:', result);
      console.log('Total past events count:', result.count);
      
      return result;
    } catch (error) {
      console.error('Error fetching past events:', error);
      throw error;
    }
  }

  async fetchGameDetails(gameId: string): Promise<ApiGameDetails | null> {
    // Check cache first
    if (this.gameDetailsCache[gameId]) {
      console.log('Returning cached game details for ID:', gameId);
      return this.gameDetailsCache[gameId];
    }

    try {
      console.log('Fetching detailed game data for ID:', gameId);
      const response = await fetch(`${this.baseUrl}/events/${gameId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const gameDetails: ApiGameDetails = await response.json();
      console.log('Game details fetched:', gameDetails);
      
      // Cache the result
      this.gameDetailsCache[gameId] = gameDetails;
      
      return gameDetails;
    } catch (error) {
      console.error('Error fetching game details:', error);
      return null;
    }
  }

  async fetchTeam(teamId: string): Promise<ApiTeam> {
    // Check cache first
    if (this.teamCache[teamId]) {
      console.log('Returning cached team data for ID:', teamId);
      return this.teamCache[teamId];
    }

    try {
      console.log('Fetching team details for ID:', teamId);
      const response = await fetch(`${this.baseUrl}/teams/${teamId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const team: ApiTeam = await response.json();
      console.log('Team details fetched:', team);
      
      // Cache the result
      this.teamCache[teamId] = team;
      
      return team;
    } catch (error) {
      console.error('Error fetching team details:', error);
      // Return fallback data
      return {
        id: teamId,
        name: `Team ${teamId}`,
        logo_url: ''
      };
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
      console.log('Fetching all players from API endpoint:', this.playersUrl);
      
      const response = await fetch(this.playersUrl);
      
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
          number: player.sp_number
        });
      });
      
      return data;
    } catch (error) {
      console.error('Error fetching players:', error);
      throw error;
    }
  }

  async checkPlayersApiAvailability(): Promise<boolean> {
    try {
      console.log('Checking players API endpoint availability...');
      const response = await fetch(this.playersUrl, { method: 'HEAD' });
      const isAvailable = response.ok;
      console.log('Players API endpoint available:', isAvailable);
      return isAvailable;
    } catch (error) {
      console.error('Error checking players API endpoint availability:', error);
      return false;
    }
  }

  // Helper function to parse "id:name" format
  parseIdNameString(idNameString: string): { id: string; name: string } {
    const parts = idNameString.split(':');
    if (parts.length >= 2) {
      return {
        id: parts[0].trim(),
        name: parts.slice(1).join(':').trim()
      };
    }
    return {
      id: idNameString.trim(),
      name: idNameString.trim()
    };
  }

  // Enhanced function to parse PHP serialized sp_results with proper structure parsing
  parseSpResults(serializedString: string): GameResult[] {
    try {
      console.log('Parsing sp_results PHP serialized data:', serializedString);
      
      if (!serializedString || serializedString.trim() === '') {
        console.log('Empty sp_results string');
        return [];
      }

      const results: GameResult[] = [];
      
      // Parse PHP serialized array structure: a:2:{i:0;a:3:{...}i:1;a:3:{...}}
      // Look for array patterns with team data
      const arrayPattern = /a:\d+:\{([^}]+)\}/g;
      const matches = serializedString.match(arrayPattern);
      
      if (matches) {
        console.log('Found array matches:', matches.length);
        
        // For each array match, extract team data
        matches.forEach((match, index) => {
          console.log(`Processing array ${index}:`, match);
          
          // Extract team ID (first number in the array)
          const teamIdMatch = match.match(/i:(\d+);/);
          const teamId = teamIdMatch ? teamIdMatch[1] : index.toString();
          
          // Extract goals value
          const goalsMatch = match.match(/"goals";i:(\d+);/);
          const goals = goalsMatch ? parseInt(goalsMatch[1]) : 0;
          
          // Extract outcome value
          const outcomeMatch = match.match(/"outcome";s:\d+:"([^"]+)";/);
          const outcome = outcomeMatch ? outcomeMatch[1] as 'win' | 'loss' | 'nich' : 'nich';
          
          console.log(`Team ${teamId}: goals=${goals}, outcome=${outcome}`);
          
          results.push({
            teamId,
            goals,
            outcome,
            first: 0,
            second: 0,
            third: 0
          });
        });
      } else {
        // Fallback: try to parse as simple structure
        console.log('No array matches found, trying fallback parsing');
        
        // Look for team IDs and their data
        const teamDataPattern = /(\d+)[^{]*\{[^}]*"goals";i:(\d+);[^}]*"outcome";s:\d+:"([^"]+)";[^}]*\}/g;
        let match;
        
        while ((match = teamDataPattern.exec(serializedString)) !== null) {
          const [, teamId, goals, outcome] = match;
          console.log(`Fallback parsing - Team ${teamId}: goals=${goals}, outcome=${outcome}`);
          
          results.push({
            teamId: teamId.trim(),
            goals: parseInt(goals),
            outcome: outcome as 'win' | 'loss' | 'nich',
            first: 0,
            second: 0,
            third: 0
          });
        }
        
        // If still no results, try simple score extraction
        if (results.length === 0) {
          const scorePattern = /(\d+)[\s\-:]+(\d+)/;
          const scoreMatch = serializedString.match(scorePattern);
          
          if (scoreMatch) {
            const score1 = parseInt(scoreMatch[1]);
            const score2 = parseInt(scoreMatch[2]);
            
            console.log(`Simple score parsing: ${score1} - ${score2}`);
            
            results.push(
              {
                teamId: '1',
                goals: score1,
                outcome: score1 > score2 ? 'win' : score1 < score2 ? 'loss' : 'nich',
                first: 0,
                second: 0,
                third: 0
              },
              {
                teamId: '2',
                goals: score2,
                outcome: score2 > score1 ? 'win' : score2 < score1 ? 'loss' : 'nich',
                first: 0,
                second: 0,
                third: 0
              }
            );
          }
        }
      }
      
      console.log('Final parsed sp_results:', results);
      return results;
    } catch (error) {
      console.error('Error parsing sp_results:', error);
      return [];
    }
  }

  // Enhanced function to parse detailed results from /events/{id} endpoint
  parseDetailedResults(serializedString: string): GameResult[] {
    try {
      console.log('Parsing detailed results from events endpoint:', serializedString);
      
      if (!serializedString || serializedString.trim() === '') {
        console.log('Empty results string');
        return [];
      }

      const results: GameResult[] = [];
      
      // Parse PHP serialized array with period details
      // Look for team data with first, second, third period information
      const teamPattern = /(\d+)[^{]*\{[^}]*"first";i:(\d+);[^}]*"second";i:(\d+);[^}]*"third";i:(\d+);[^}]*"goals";i:(\d+);[^}]*"outcome";s:\d+:"([^"]+)";[^}]*\}/g;
      
      let match;
      while ((match = teamPattern.exec(serializedString)) !== null) {
        const [, teamId, first, second, third, goals, outcome] = match;
        
        console.log(`Detailed team ${teamId}: P1=${first}, P2=${second}, P3=${third}, Total=${goals}, Outcome=${outcome}`);
        
        results.push({
          teamId: teamId.trim(),
          first: parseInt(first),
          second: parseInt(second),
          third: parseInt(third),
          goals: parseInt(goals),
          outcome: outcome as 'win' | 'loss' | 'nich'
        });
      }
      
      // Fallback: try alternative pattern without period details
      if (results.length === 0) {
        console.log('No detailed results found, trying fallback pattern');
        
        const simplePattern = /(\d+)[^{]*\{[^}]*"goals";i:(\d+);[^}]*"outcome";s:\d+:"([^"]+)";[^}]*\}/g;
        
        while ((match = simplePattern.exec(serializedString)) !== null) {
          const [, teamId, goals, outcome] = match;
          
          console.log(`Simple team ${teamId}: Total=${goals}, Outcome=${outcome}`);
          
          results.push({
            teamId: teamId.trim(),
            first: 0,
            second: 0,
            third: 0,
            goals: parseInt(goals),
            outcome: outcome as 'win' | 'loss' | 'nich'
          });
        }
      }
      
      // Final fallback: use sp_results parsing method
      if (results.length === 0) {
        console.log('Using sp_results parsing as final fallback');
        return this.parseSpResults(serializedString);
      }
      
      console.log('Final parsed detailed results:', results);
      return results;
    } catch (error) {
      console.error('Error parsing detailed results:', error);
      return [];
    }
  }

  // Helper function to parse PHP serialized results (legacy method for backward compatibility)
  parsePhpSerializedResults(serializedString: string): { homeScore?: number; awayScore?: number } {
    try {
      console.log('Parsing PHP serialized results (legacy):', serializedString);
      
      const results = this.parseSpResults(serializedString);
      if (results.length >= 2) {
        return {
          homeScore: results[0].goals,
          awayScore: results[1].goals
        };
      }
      
      // Fallback to simple score pattern
      const scorePattern = /(\d+)[\s\-:]+(\d+)/;
      const match = serializedString.match(scorePattern);
      
      if (match) {
        return {
          homeScore: parseInt(match[1]),
          awayScore: parseInt(match[2])
        };
      }
      
      return {};
    } catch (error) {
      console.error('Error parsing PHP serialized results:', error);
      return {};
    }
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

  // Helper function to format date and time
  formatDateTime(eventDate: string): { date: string; time: string } {
    try {
      const [datePart, timePart] = eventDate.split(' ');
      
      // Format time without seconds
      let formattedTime = '19:00'; // default
      if (timePart) {
        const timeParts = timePart.split(':');
        if (timeParts.length >= 2) {
          formattedTime = `${timeParts[0]}:${timeParts[1]}`;
        }
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
}

export const apiService = new ApiService();
