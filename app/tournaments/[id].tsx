// app/tournaments/[id].tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors } from '../../styles/commonStyles';
import { fetchTournamentTable, TournamentTable } from '../../services/tournamentsApi';

export default function TournamentDetailScreen({ route }) {
  const { id } = route.params;
  const [table, setTable] = useState<TournamentTable[]>([]);
  const [leagueId, setLeagueId] = useState<number>(0);
  const [seasonId, setSeasonId] = useState<number>(0);

  useEffect(() => {
    loadTable();
  }, []);

  const loadTable = async () => {
    const data = await fetchTournamentTable(id);
    setTable(data.data);
    setLeagueId(data.league_id);
    setSeasonId(data.season_id);
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Детали турнира</Text>
      <Text style={styles.subtitle}>Лига: {leagueId}, Сезон: {seasonId}</Text>

      <View style={styles.tableHeader}>
        <Text style={[styles.headerCell, styles.position]}>Поз.</Text>
        <Text style={[styles.headerCell, styles.team]}>Команда</Text>
        <Text style={[styles.headerCell, styles.games]}>И</Text>
        <Text style={[styles.headerCell, styles.wins]}>В</Text>
        <Text style={[styles.headerCell, styles.losses]}>П</Text>
        <Text style={[styles.headerCell, styles.points]}>О</Text>
        <Text style={[styles.headerCell, styles.goalsFor]}>Заб</Text>
        <Text style={[styles.headerCell, styles.goalsAgainst]}>Проп</Text>
        <Text style={[styles.headerCell, styles.diff]}>+/-</Text>
        <Text style={[styles.headerCell, styles.coefficient]}>Kf</Text>
      </View>

      {table.map((row, index) => (
        <View
          key={row.team_id}
          style={[
            styles.tableRow,
            index % 2 === 0 ? styles.evenRow : styles.oddRow
          ]}
        >
          <Text style={[styles.cell, styles.position]}>{row.position}</Text>
          <Text style={[styles.cell, styles.team]}>{row.team_name}</Text>
          <Text style={[styles.cell, styles.games]}>{row.games}</Text>
          <Text style={[styles.cell, styles.wins]}>{row.wins}</Text>
          <Text style={[styles.cell, styles.losses]}>{row.losses}</Text>
          <Text style={[styles.cell, styles.points]}>{row.points_2x}</Text>
          <Text style={[styles.cell, styles.goalsFor]}>{row.goals_for}</Text>
          <Text style={[styles.cell, styles.goalsAgainst]}>{row.goals_against}</Text>
          <Text style={[styles.cell, styles.diff]}>{row.goal_diff}</Text>
          <Text style={[styles.cell, styles.coefficient]}>{row.coefficient}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.text,
    marginBottom: 16,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    paddingBottom: 8,
    marginBottom: 8,
  },
  headerCell: {
    textAlign: 'center',
    fontWeight: 'bold',
    color: colors.text,
  },
  position: {
    width: 50,
  },
  team: {
    flex: 1,
    textAlign: 'left',
    paddingLeft: 8,
  },
  games: {
    width: 40,
  },
  wins: {
    width: 40,
  },
  losses: {
    width: 40,
  },
  points: {
    width: 40,
  },
  goalsFor: {
    width: 50,
  },
  goalsAgainst: {
    width: 50,
  },
  diff: {
    width: 50,
  },
  coefficient: {
    width: 50,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  evenRow: {
    backgroundColor: '#f9f9f9',
  },
  oddRow: {
    backgroundColor: '#fff',
  },
  cell: {
    textAlign: 'center',
    color: colors.text,
  },
});