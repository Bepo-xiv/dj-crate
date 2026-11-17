// Bibliothèque de démonstration (morceaux fictifs) pour découvrir l'app et pour les tests.
const rows = [
  // titre, artiste, genre, bpm, clé, énergie, durée
  ['Aube Minérale', 'Lune Froide', 'Deep House', 118, '8A', 3, '6:12'],
  ['Velours', 'Lune Froide', 'Deep House', 120, '9A', 4, '5:48'],
  ['Canal Saint-Martin', 'Otto Brume', 'Deep House', 121, '8B', 4, '6:30'],
  ['Quai 14', 'Otto Brume', 'House', 122, '7A', 5, '5:55'],
  ['Soleil Rasant', 'Mira Costa', 'House', 123, '8A', 5, '6:05'],
  ['Piscine Vide', 'Mira Costa', 'House', 124, '9A', 6, '5:40'],
  ['Néon Tiède', 'Kasper Voss', 'House', 124, '10A', 6, '6:18'],
  ['Boulevard', 'Kasper Voss', 'Tech House', 125, '9B', 6, '6:02'],
  ['Mécanique Douce', 'Atelier 9', 'Tech House', 126, '10A', 7, '6:25'],
  ['Cliquetis', 'Atelier 9', 'Tech House', 126, '11A', 7, '5:50'],
  ['Tôle Ondulée', 'Hanna Reiss', 'Tech House', 127, '11B', 7, '6:10'],
  ['Courant Fort', 'Hanna Reiss', 'Techno', 128, '12A', 8, '6:40'],
  ['Acier Bleu', 'Vektor Sud', 'Techno', 128, '11A', 8, '6:33'],
  ['Hangar 7', 'Vektor Sud', 'Techno', 130, '12A', 9, '6:50'],
  ['Stroboscope', 'Nord Nord Est', 'Techno', 130, '1A', 9, '6:15'],
  ['Ligne Haute Tension', 'Nord Nord Est', 'Techno', 132, '2A', 10, '6:05'],
  ['Zénith', 'Elio Marchetti', 'Melodic Techno', 124, '8A', 7, '7:10'],
  ['Parallaxe', 'Elio Marchetti', 'Melodic Techno', 125, '7A', 7, '7:24'],
  ['Marée Basse', 'Sable Noir', 'Melodic Techno', 123, '6A', 6, '6:58'],
  ['Dernier Métro', 'Sable Noir', 'Deep House', 119, '5A', 4, '6:20'],
  ['Demi-Lune', 'Brixton Tide', 'Drum & Bass', 174, '8A', 8, '4:45'],
  ['Pavés Mouillés', 'Brixton Tide', 'Hip-Hop', 87, '9A', 5, '3:40'],
  ['Carrousel', 'Les Cousins', 'Disco', 118, '10B', 6, '5:15'],
  ['Minuit Pile', 'Les Cousins', 'Disco', 120, '11B', 6, '4:58'],
];

export function demoTracks() {
  return rows.map(([title, artist, genre, bpm, key, energy, duration], i) => ({
    id: 'demo-' + (i + 1), title, artist, genre, bpm, key, energy, duration,
    notes: i === 4 ? 'Marche à tous les coups en début de soirée.' : '',
    cues: i === 4 ? [{ time: '0:32', label: 'Entrée du kick' }, { time: '2:08', label: 'Break vocal' }, { time: '4:40', label: 'Sortie, 32 temps' }] : [],
  }));
}
