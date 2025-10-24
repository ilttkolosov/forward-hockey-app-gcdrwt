// components/ProtocolEventCard.tsx
import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import Icon from '../components/Icon';
import { colors } from '../styles/commonStyles';

interface ProtocolEventCardProps {
  event: any;
  teamLogo: string;
  homeTeamLogo: string;
  awayTeamLogo: string;
  onVideoPress: (url: string) => void;
  playerStats: Record<string, any>;
  score: { home: number; away: number };
  isHomeTeam: boolean;
}

const ProtocolEventCard: React.FC<ProtocolEventCardProps> = ({
  event,
  teamLogo,
  homeTeamLogo,
  awayTeamLogo,
  onVideoPress,
  playerStats,
  score,
  isHomeTeam,
}) => {
  const formatPlayerName = (fullName: string): string => {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length < 2) return fullName;
    const [lastName, firstName] = parts;
    return `${firstName} ${lastName}`.trim();
  };

  const renderPlayer = (playerId: string, isPrimary: boolean = false) => {
    const player = playerStats[playerId] || null;
    if (!player) {
      return (
        <Text key={playerId} style={[styles.playerText, isPrimary && styles.primaryPlayer]}>
          #{playerId}
        </Text>
      );
    }
    return (
      <View key={playerId} style={styles.playerRow}>
        <Text style={[styles.playerText, isPrimary && styles.primaryPlayer]}>
          #{player.number || '?'} {formatPlayerName(player.name)}
        </Text>
      </View>
    );
  };

  const renderComment = (comment: string) => {
    if (!comment) return null;
    let displayComment = comment.replace(/<br\s*\/?>/gi, '\n');

    // Обработка комментариев "+1", "-1" в конце строки
    let specialComment = '';
    if (displayComment.includes('+1') || displayComment.includes('+2')) {
      specialComment = 'Реализация большинства';
      displayComment = displayComment.replace(/\s*\+\d+$/, '').trim();
    } else if (displayComment.includes('-1') || displayComment.includes('-2')) {
      specialComment = 'Гол в меньшинстве';
      displayComment = displayComment.replace(/\s*-\d+$/, '').trim();
    }

    // Если есть основной комментарий, выводим его, а потом специальный
    if (displayComment && specialComment) {
      return (
        <>
          <Text style={styles.commentText}>{displayComment}</Text>
          <Text style={[styles.commentText, styles.specialComment]}>{specialComment}</Text>
        </>
      );
    } else if (displayComment) {
      return <Text style={styles.commentText}>{displayComment}</Text>;
    } else if (specialComment) {
      return <Text style={[styles.commentText, styles.specialComment]}>{specialComment}</Text>;
    }

    return null;
  };

  const renderScore = () => {
    const homeScore = score.home;
    const awayScore = score.away;
    return (
      <View style={styles.scoreContainer}>
        {/* <Image source={{ uri: homeTeamLogo }} style={styles.scoreLogo} /> */}
        <Text style={[styles.scoreText, isHomeTeam && styles.scoreTextBold]}>{homeScore}</Text>
        <Text style={styles.scoreSeparator}>:</Text>
        <Text style={[styles.scoreText, !isHomeTeam && styles.scoreTextBold]}>{awayScore}</Text>
        {/* <Image source={{ uri: awayTeamLogo }} style={styles.scoreLogo} /> */}

        {event.url?.trim() && (
            <TouchableOpacity onPress={() => onVideoPress(event.url.trim())} style={styles.videoButton}>
                <Icon name="videocam" size={30} color={colors.primary} />
            </TouchableOpacity>
        )}

      </View>
    );
  };

  // Функция для получения цвета бейджа по типу события
  const getBadgeColor = (type: string): string => {
    switch (type) {
      case 'gk': return colors.accent; // Зеленый для "Ворота защищает"
      case 'p': return colors.error; // Красный для "Удаление"
      case 'g': return colors.primary; // Синий для "Гол!"
      default: return colors.textSecondary; // Серый для прочего (но не выводим)
    }
  };

  // Функция для получения текста бейджа по типу события
  const getBadgeText = (type: string): string => {
    switch (type) {
      case 'gk': return 'Ворота защищает';
      case 'p': return 'Удаление';
      case 'g': return 'Гол!';
      case 'o': return ''; // Не выводим для "Другое"
      default: return '';
    }
  };

  const badgeText = getBadgeText(event.type);
  const badgeColor = getBadgeColor(event.type);

  // Получаем фото игрока
  const primaryPlayerId = event.players?.[0];
  const primaryPlayer = primaryPlayerId ? playerStats[primaryPlayerId] : null;
  const playerPhotoPath = primaryPlayer?.photoPath;

  return (
    <View style={styles.card}>
      {/* Основное содержимое карточки */}
      <View style={styles.content}>
        {/* Время и тип события на одной строке */}
        <View style={styles.eventHeader}>
          {/* Бейдж для типа события */}
          {badgeText && (
            <View style={[styles.badge, { backgroundColor: badgeColor }]}>
              <Text style={styles.badgeText}>{badgeText}</Text>
            </View>
          )}
          {/* Время */}
          <Text style={styles.time}>{event.time}</Text>
        </View>
        {/* Игроки */}
        {event.players && event.players.length > 0 && (
          <View style={styles.playersContainer}>
            {event.players.map((playerId: string, idx: number) => {
              const isPrimary = idx === 0;
              return renderPlayer(playerId, isPrimary);
            })}
          </View>
        )}
        {/* Комментарий */}
        {event.comment && renderComment(event.comment)}
        {/* Счет (только для голов) */}
        {event.type === 'g' && renderScore()}

      </View>
      {/* Контейнер для фото игрока */}
      <View style={styles.photoContainer}>
        {playerPhotoPath && (
          <Image source={{ uri: playerPhotoPath }} style={styles.playerPhoto} />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'stretch', // Важно! Это позволяет контейнерам растягиваться по высоте
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  content: {
    flex: 1,
    padding: 12,
    gap: 8,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  time: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 60,
    alignItems: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  playersContainer: {
    gap: 4,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playerText: {
    fontSize: 12,
    color: colors.text,
  },
  primaryPlayer: {
    fontSize: 16,
    fontWeight: '600',
  },
  commentText: {
    fontSize: 16,
    color: colors.text,
    fontStyle: 'normal',
    fontWeight: '600',
  },
  specialComment: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  scoreLogo: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  scoreText: {
    fontSize: 32,
    fontWeight: '200',
    color: colors.text,
  },
  scoreTextBold: {
    fontWeight: '800',
    color: colors.primary,
  },
  scoreSeparator: {
    fontSize: 32,
    fontWeight: '600',
    color: colors.text,
  },
  photoContainer: {
    width: 80, // Ширина контейнера для фото
    justifyContent: 'center',
    alignItems: 'center',
    borderLeftWidth: 0, // Убираем видимую линию
    paddingVertical: 16,
  },
  playerPhoto: {
    width: 68,
    height: 68,
    borderRadius: 34,
    paddingRight: 6
  },
    videoButton: {
    padding: 4,
  },
});

export default ProtocolEventCard;