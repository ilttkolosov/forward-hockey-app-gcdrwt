
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { ApiGameDetailsResponse, EnrichedGameDetails, ApiTeam } from '../../types';
import { apiService } from '../../services/apiService';
import { colors, commonStyles } from '../../styles/commonStyles';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import Icon from '../../components/Icon';
import { getCachedTeamLogo } from '../../utils/teamLogos';
import { formatDateTimeWithoutSeconds } from '../../utils/dateUtils';

const { width } = Dimensions.get('window');

export default function GameDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [gameDetails, setGameDetails] = useState<EnrichedGameDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [teamsLoading, setTeamsLoading] = useState(false);

  // Enhanced JavaScript code to inject into WebView to completely hide VK page elements
  const injectScript = `
    (function() {
      console.log('=== VK Video Masking Script Started ===');
      
      // More aggressive element hiding function
      function hideElements() {
        console.log('Hiding VK page elements...');
        
        // List of selectors to hide - comprehensive list for VK
        const selectorsToHide = [
          // Headers and navigation
          'header', '.header', '#header',
          '.top_bar', '.TopNavBtn', '.top_nav',
          '.left_menu', '.side_bar', '.sidebar', '#side_bar',
          '.fixed_header', '.page_header', '#page_header',
          '.breadcrumbs', '.nav', '.navigation',
          
          // VK specific elements
          '.mv_info', '.mv_actions', '.mv_description', 
          '.mv_author', '.mv_title', '.mv_related', '.mv_playlist',
          '.video_info', '.video_actions', '.video_description',
          '.video_author', '.video_title', '.video_related',
          
          // Comments and social elements
          '.comments', '.comment', '.social', '.share',
          '.likes', '.views', '.rating',
          
          // Footer and additional content
          '.footer', '#footer', '.page_footer',
          '.content', '.page_wrap', '.page_block',
          
          // VK mobile specific
          '.mobile_header', '.mobile_nav', '.mobile_menu',
          '.vk_header', '.vk_nav', '.vk_menu',
          
          // Generic hiding
          '[class*="header"]', '[class*="nav"]', '[class*="menu"]',
          '[class*="info"]', '[class*="description"]', '[class*="comment"]',
          '[id*="header"]', '[id*="nav"]', '[id*="menu"]'
        ];
        
        // Hide elements by selector
        selectorsToHide.forEach(selector => {
          try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
              if (el && el.style) {
                el.style.display = 'none !important';
                el.style.visibility = 'hidden !important';
                el.style.opacity = '0 !important';
                el.style.height = '0 !important';
                el.style.width = '0 !important';
                el.style.margin = '0 !important';
                el.style.padding = '0 !important';
              }
            });
            if (elements.length > 0) {
              console.log('Hidden elements for selector:', selector, elements.length);
            }
          } catch (e) {
            console.log('Error hiding selector:', selector, e);
          }
        });
        
        // Hide elements by text content (VK specific)
        const textSelectors = ['Показать ещё', 'Комментарии', 'Поделиться', 'Нравится'];
        textSelectors.forEach(text => {
          try {
            const xpath = "//*[contains(text(), '" + text + "')]";
            const result = document.evaluate(xpath, document, null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null);
            for (let i = 0; i < result.snapshotLength; i++) {
              const element = result.snapshotItem(i);
              if (element && element.style) {
                element.style.display = 'none !important';
              }
            }
          } catch (e) {
            console.log('Error hiding by text:', text, e);
          }
        });
      }
      
      // Function to style video for fullscreen
      function styleVideo() {
        console.log('Styling video for fullscreen...');
        
        // Find video element
        const video = document.querySelector('video');
        if (video) {
          console.log('Found video element, applying fullscreen styles');
          
          // Video styles
          video.style.cssText = \`
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            object-fit: contain !important;
            z-index: 9999 !important;
            background: #000 !important;
          \`;
          
          // Find and style video container
          const containers = [
            video.closest('.video_player'),
            video.closest('.videoplayer'), 
            video.closest('.player_wrap'),
            video.closest('.mv_player'),
            video.closest('[class*="player"]'),
            video.closest('[class*="video"]'),
            video.parentElement
          ];
          
          containers.forEach(container => {
            if (container && container !== document.body) {
              container.style.cssText = \`
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                z-index: 9998 !important;
                background: #000 !important;
                margin: 0 !important;
                padding: 0 !important;
              \`;
              console.log('Styled video container');
            }
          });
          
          return true;
        }
        
        console.log('Video element not found');
        return false;
      }
      
      // Function to clean up page structure
      function cleanupPage() {
        console.log('Cleaning up page structure...');
        
        // Remove body margins and set black background
        if (document.body) {
          document.body.style.cssText = \`
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: #000 !important;
            height: 100vh !important;
            width: 100vw !important;
          \`;
        }
        
        // Remove html margins
        if (document.documentElement) {
          document.documentElement.style.cssText = \`
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: #000 !important;
            height: 100vh !important;
            width: 100vw !important;
          \`;
        }
        
        // Add CSS to hide everything except video
        const style = document.createElement('style');
        style.textContent = \`
          * {
            box-sizing: border-box !important;
          }
          
          body > *:not([class*="video"]):not([class*="player"]):not(video):not(style):not(script) {
            display: none !important;
          }
          
          [class*="header"], [class*="nav"], [class*="menu"], 
          [class*="info"], [class*="description"], [class*="comment"],
          [class*="footer"], [class*="sidebar"] {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            height: 0 !important;
            width: 0 !important;
          }
          
          video {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            object-fit: contain !important;
            z-index: 9999 !important;
            background: #000 !important;
          }
        \`;
        document.head.appendChild(style);
        console.log('Added cleanup CSS');
      }
      
      // Main function to apply all changes
      function applyVideoMasking() {
        console.log('Applying video masking...');
        
        hideElements();
        cleanupPage();
        const videoFound = styleVideo();
        
        if (!videoFound) {
          // Try again after a delay if video not found
          setTimeout(() => {
            console.log('Retrying video styling...');
            styleVideo();
          }, 1000);
          
          setTimeout(() => {
            console.log('Final retry for video styling...');
            styleVideo();
          }, 3000);
        }
        
        // Continue hiding elements that might load dynamically
        setTimeout(() => {
          hideElements();
          styleVideo();
        }, 2000);
        
        setTimeout(() => {
          hideElements();
          styleVideo();
        }, 5000);
      }
      
      // Apply changes immediately
      applyVideoMasking();
      
      // Apply changes when DOM is ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyVideoMasking);
      }
      
      // Apply changes when window loads
      window.addEventListener('load', applyVideoMasking);
      
      // Observer to watch for dynamically added elements
      const observer = new MutationObserver(function(mutations) {
        let shouldReapply = false;
        
        mutations.forEach(function(mutation) {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            // Check if any added nodes are not video-related
            mutation.addedNodes.forEach(node => {
              if (node.nodeType === 1) { // Element node
                const element = node;
                const className = element.className || '';
                const tagName = element.tagName || '';
                
                // If it's not a video-related element, hide it
                if (!className.includes('video') && 
                    !className.includes('player') && 
                    tagName !== 'VIDEO') {
                  shouldReapply = true;
                }
              }
            });
          }
        });
        
        if (shouldReapply) {
          setTimeout(() => {
            hideElements();
            styleVideo();
          }, 100);
        }
      });
      
      // Start observing
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      
      console.log('=== VK Video Masking Script Completed ===');
    })();
    true; // Return true to indicate script executed successfully
  `;

  const loadGameData = useCallback(async () => {
    try {
      console.log('Loading game data for ID:', id);
      setLoading(true);
      setError(null);

      // First, fetch the game data
      const apiGameData = await apiService.fetchGameById(id as string);
      console.log('API Game Data:', apiGameData);

      // Then, enrich it with team data
      const enrichedGame = await enrichGameData(apiGameData);
      
      if (!enrichedGame) {
        setError('Не удалось обработать данные игры');
        return;
      }

      setGameDetails(enrichedGame);
    } catch (err) {
      console.error('Error loading game data:', err);
      setError('Не удалось загрузить данные игры');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      loadGameData();
    }
  }, [id, loadGameData]);

  const enrichGameData = async (apiData: ApiGameDetailsResponse): Promise<EnrichedGameDetails | null> => {
    try {
      setTeamsLoading(true);
      
      // Validate teams array
      if (!apiData.teams || !Array.isArray(apiData.teams) || apiData.teams.length < 2) {
        console.error('Invalid teams data:', apiData.teams);
        return null;
      }

      const [homeTeamId, awayTeamId] = apiData.teams;

      // Fetch team data in parallel
      const [homeTeamData, awayTeamData] = await Promise.all([
        fetchTeamSafely(homeTeamId),
        fetchTeamSafely(awayTeamId)
      ]);

      // Cache team logos
      const homeTeamLogo = await getCachedTeamLogo(homeTeamId, homeTeamData.logo_url || '');
      const awayTeamLogo = await getCachedTeamLogo(awayTeamId, awayTeamData.logo_url || '');

      // Format date and time
      const { formattedDate, formattedTime } = formatDateTimeWithoutSeconds(apiData.date);

      // Extract results
      const homeResults = apiData.results?.[homeTeamId];
      const awayResults = apiData.results?.[awayTeamId];

      // Build enriched game object
      const enrichedGame: EnrichedGameDetails = {
        id: apiData.id,
        date: formattedDate,
        time: formattedTime,
        homeTeam: {
          id: homeTeamId,
          name: homeTeamData.name,
          logo: homeTeamLogo,
          goals: parseInt(homeResults?.goals || '0') || 0,
          firstPeriod: homeResults?.first ? parseInt(homeResults.first) : undefined,
          secondPeriod: homeResults?.second ? parseInt(homeResults.second) : undefined,
          thirdPeriod: homeResults?.third ? parseInt(homeResults.third) : undefined,
          outcome: extractOutcome(homeResults?.outcome || [])
        },
        awayTeam: {
          id: awayTeamId,
          name: awayTeamData.name,
          logo: awayTeamLogo,
          goals: parseInt(awayResults?.goals || '0') || 0,
          firstPeriod: awayResults?.first ? parseInt(awayResults.first) : undefined,
          secondPeriod: awayResults?.second ? parseInt(awayResults.second) : undefined,
          thirdPeriod: awayResults?.third ? parseInt(awayResults.third) : undefined,
          outcome: extractOutcome(awayResults?.outcome || [])
        },
        league: extractNameFromArray(apiData.leagues),
        season: extractNameFromArray(apiData.seasons),
        venue: extractNameFromArray(apiData.venues),
        videoUrl: apiData.sp_video
      };

      console.log('Enriched game data:', enrichedGame);
      return enrichedGame;
    } catch (error) {
      console.error('Error enriching game data:', error);
      return null;
    } finally {
      setTeamsLoading(false);
    }
  };

  const fetchTeamSafely = async (teamId: string): Promise<ApiTeam> => {
    try {
      return await apiService.fetchTeam(teamId);
    } catch (error) {
      console.error(`Error fetching team ${teamId}:`, error);
      return {
        id: teamId,
        name: 'Команда не найдена',
        logo_url: ''
      };
    }
  };

  const extractOutcome = (outcome: string | string[]): string => {
    if (Array.isArray(outcome)) {
      return outcome.length > 0 ? outcome[0] : '';
    }
    return outcome || '';
  };

  const extractNameFromArray = (array: { id: string; name: string }[] | []): string | undefined => {
    if (Array.isArray(array) && array.length > 0) {
      return array[0].name;
    }
    return undefined;
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadGameData();
    setRefreshing(false);
  };

  const getOutcomeText = (outcome: string): string => {
    switch (outcome) {
      case 'win':
        return 'Победа';
      case 'loss':
        return 'Поражение';
      case 'nich':
        return 'Ничья';
      default:
        return outcome || '';
    }
  };

  const getOutcomeColor = (outcome: string): string => {
    switch (outcome) {
      case 'win':
        return colors.success;
      case 'loss':
        return colors.error;
      case 'nich':
        return colors.warning;
      default:
        return colors.textSecondary;
    }
  };

  // Helper function to get tournament display name
  const getTournamentDisplayName = (league?: string): { name: string; isFriendly: boolean } => {
    if (!league || league.trim() === '') {
      return { name: 'Товарищеский матч', isFriendly: true };
    }
    return { name: league, isFriendly: false };
  };

  if (loading) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Icon name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>ХК Динамо Форвард 2014</Text>
            <Text style={styles.headerSubtitle}> • </Text>
            <Text style={styles.headerLocation}>Санкт-Петербург</Text>
          </View>
        </View>
        <LoadingSpinner />
      </SafeAreaView>
    );
  }

  if (error || !gameDetails) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Icon name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>ХК Динамо Форвард 2014</Text>
            <Text style={styles.headerSubtitle}> • </Text>
            <Text style={styles.headerLocation}>Санкт-Петербург</Text>
          </View>
        </View>
        <ErrorMessage message={error || 'Матч не найден'} onRetry={loadGameData} />
      </SafeAreaView>
    );
  }

  const tournamentInfo = getTournamentDisplayName(gameDetails.league);

  return (
    <SafeAreaView style={commonStyles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Icon name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>ХК Динамо Форвард 2014</Text>
          <Text style={styles.headerSubtitle}> • </Text>
          <Text style={styles.headerLocation}>Санкт-Петербург</Text>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Video Player - Enhanced with more aggressive JavaScript injection */}
        {gameDetails.videoUrl && (
          <View style={styles.videoContainer}>
            <Text style={styles.sectionTitle}>Видео матча</Text>
            <View style={styles.videoFrame}>
              <WebView
                source={{ uri: gameDetails.videoUrl }}
                style={styles.webview}
                injectedJavaScript={injectScript}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={true}
                scalesPageToFit={true}
                allowsInlineMediaPlayback={true}
                mediaPlaybackRequiresUserAction={false}
                mixedContentMode="compatibility"
                onLoadEnd={() => {
                  console.log('WebView loaded, applying enhanced video masking');
                }}
                onError={(syntheticEvent) => {
                  const { nativeEvent } = syntheticEvent;
                  console.error('WebView error: ', nativeEvent);
                }}
                onHttpError={(syntheticEvent) => {
                  const { nativeEvent } = syntheticEvent;
                  console.error('WebView HTTP error: ', nativeEvent);
                }}
                onMessage={(event) => {
                  console.log('WebView message:', event.nativeEvent.data);
                }}
              />
            </View>
          </View>
        )}

        {/* Main Game Info */}
        <View style={styles.gameInfo}>
          <View style={styles.gameHeader}>
            <Text style={styles.gameDate}>{gameDetails.date} • {gameDetails.time}</Text>
          </View>

          {/* Teams with Logos Above Names */}
          <View style={styles.teamsContainer}>
            {/* Home Team Column */}
            <View style={styles.teamColumn}>
              {gameDetails.homeTeam.logo ? (
                <Image 
                  source={{ uri: gameDetails.homeTeam.logo }} 
                  style={styles.teamLogo}
                  onError={() => console.log('Failed to load home team logo')}
                />
              ) : (
                <View style={styles.teamLogoPlaceholder}>
                  <Icon name="shield" size={32} color={colors.textSecondary} />
                </View>
              )}
              <Text style={styles.teamName} numberOfLines={2}>
                {gameDetails.homeTeam.name}
              </Text>
              {/* Outcome Badge centered under team name */}
              {gameDetails.homeTeam.outcome && (
                <View style={styles.outcomeBadgeContainer}>
                  <View style={[styles.outcomeBadge, { backgroundColor: getOutcomeColor(gameDetails.homeTeam.outcome) }]}>
                    <Text style={styles.outcomeText}>{getOutcomeText(gameDetails.homeTeam.outcome)}</Text>
                  </View>
                </View>
              )}
            </View>

            {/* Score */}
            <View style={styles.scoreContainer}>
              <Text style={styles.score}>
                {gameDetails.homeTeam.goals} : {gameDetails.awayTeam.goals}
              </Text>
            </View>

            {/* Away Team Column */}
            <View style={styles.teamColumn}>
              {gameDetails.awayTeam.logo ? (
                <Image 
                  source={{ uri: gameDetails.awayTeam.logo }} 
                  style={styles.teamLogo}
                  onError={() => console.log('Failed to load away team logo')}
                />
              ) : (
                <View style={styles.teamLogoPlaceholder}>
                  <Icon name="shield" size={32} color={colors.textSecondary} />
                </View>
              )}
              <Text style={styles.teamName} numberOfLines={2}>
                {gameDetails.awayTeam.name}
              </Text>
              {/* Outcome Badge centered under team name */}
              {gameDetails.awayTeam.outcome && (
                <View style={styles.outcomeBadgeContainer}>
                  <View style={[styles.outcomeBadge, { backgroundColor: getOutcomeColor(gameDetails.awayTeam.outcome) }]}>
                    <Text style={styles.outcomeText}>{getOutcomeText(gameDetails.awayTeam.outcome)}</Text>
                  </View>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Period Scores */}
        {(gameDetails.homeTeam.firstPeriod !== undefined || gameDetails.awayTeam.firstPeriod !== undefined) && (
          <View style={styles.periodScores}>
            <Text style={styles.sectionTitle}>Счет по периодам</Text>
            <View style={styles.periodTable}>
              <View style={styles.periodHeader}>
                <Text style={styles.periodHeaderText}>Команда</Text>
                <Text style={styles.periodHeaderText}>1</Text>
                <Text style={styles.periodHeaderText}>2</Text>
                <Text style={styles.periodHeaderText}>3</Text>
                <Text style={styles.periodHeaderText}>Итого</Text>
              </View>
              <View style={styles.periodRow}>
                <Text style={styles.periodTeam}>{gameDetails.homeTeam.name}</Text>
                <Text style={styles.periodScore}>{gameDetails.homeTeam.firstPeriod || 0}</Text>
                <Text style={styles.periodScore}>{gameDetails.homeTeam.secondPeriod || 0}</Text>
                <Text style={styles.periodScore}>{gameDetails.homeTeam.thirdPeriod || 0}</Text>
                <Text style={styles.periodTotal}>{gameDetails.homeTeam.goals}</Text>
              </View>
              <View style={styles.periodRow}>
                <Text style={styles.periodTeam}>{gameDetails.awayTeam.name}</Text>
                <Text style={styles.periodScore}>{gameDetails.awayTeam.firstPeriod || 0}</Text>
                <Text style={styles.periodScore}>{gameDetails.awayTeam.secondPeriod || 0}</Text>
                <Text style={styles.periodScore}>{gameDetails.awayTeam.thirdPeriod || 0}</Text>
                <Text style={styles.periodTotal}>{gameDetails.awayTeam.goals}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Tournament, Arena Info (Season removed as requested) */}
        <View style={styles.gameDetails}>
          <View style={styles.detailItem}>
            {tournamentInfo.isFriendly ? (
              <Icon name="people" size={16} color={colors.textSecondary} />
            ) : (
              <Icon name="trophy" size={16} color={colors.textSecondary} />
            )}
            <Text style={styles.detailText}>Турнир: {tournamentInfo.name}</Text>
          </View>
          {gameDetails.venue && (
            <View style={styles.detailItem}>
              <Icon name="location" size={16} color={colors.textSecondary} />
              <Text style={styles.detailText}>Арена: {gameDetails.venue}</Text>
            </View>
          )}
        </View>

        {teamsLoading && (
          <View style={styles.loadingContainer}>
            <LoadingSpinner />
            <Text style={styles.loadingText}>Загрузка данных команд...</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  backButton: {
    marginRight: 16,
    padding: 4,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: 16,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  headerLocation: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  content: {
    flex: 1,
  },
  videoContainer: {
    padding: 16,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  videoFrame: {
    width: '100%',
    aspectRatio: 16 / 9, // Fixed aspect ratio for video
    backgroundColor: '#000', // Black background for video
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000', // Black background for video
  },
  gameInfo: {
    padding: 20,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  gameHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  gameDate: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  teamsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  teamColumn: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  teamLogo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    marginBottom: 12,
  },
  teamLogoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  teamName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 12,
  },
  scoreContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  score: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.primary,
  },
  outcomeBadgeContainer: {
    alignItems: 'center',
  },
  outcomeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    minWidth: 80,
    alignItems: 'center',
  },
  outcomeText: {
    color: colors.background,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  periodScores: {
    padding: 16,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  periodTable: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  },
  periodHeader: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  periodHeaderText: {
    flex: 1,
    color: colors.background,
    fontWeight: '600',
    textAlign: 'center',
    fontSize: 14,
  },
  periodRow: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  periodTeam: {
    flex: 1,
    color: colors.text,
    fontWeight: '500',
    fontSize: 14,
  },
  periodScore: {
    flex: 1,
    color: colors.text,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '500',
  },
  periodTotal: {
    flex: 1,
    color: colors.primary,
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 14,
  },
  gameDetails: {
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  detailText: {
    fontSize: 14,
    color: colors.text,
    marginLeft: 12,
    fontWeight: '500',
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 12,
  },
});
