import * as WebBrowser from 'expo-web-browser';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { colors, radius, space, type } from '@/theme';

// Every external data source the app shows, with its licence and attribution.
const SOURCES: { name: string; use: string; licence: string; url: string }[] = [
  { name: 'Wild Species 2020', use: 'Fish species occurring in Canada and their provinces/oceans',
    licence: 'Canadian Endangered Species Conservation Council (2022). Wild Species 2020: The General Status of Species in Canada.',
    url: 'https://www.canada.ca/en/environment-climate-change/services/species-risk-public-registry/general-status/wild-species-2020.html' },
  { name: 'FishBase', use: 'Names, length–weight formulas, max sizes, habitat, diet, spawning, ID features',
    licence: 'Froese, R. & D. Pauly (eds.) FishBase v26.06. CC BY-NC 4.0 (non-commercial).', url: 'https://www.fishbase.se' },
  { name: 'Wikipedia', use: 'Species summaries', licence: 'Text under CC BY-SA 4.0; each summary links to its article.',
    url: 'https://en.wikipedia.org/wiki/Wikipedia:Reusing_Wikipedia_content' },
  { name: 'Wikimedia Commons / Wikidata', use: 'Species photos (credited on each species page)',
    licence: 'Per-file free licences (CC0, CC BY, CC BY-SA, public domain). Wikidata is CC0.', url: 'https://commons.wikimedia.org' },
  { name: 'BC Freshwater Atlas – Lakes', use: 'Lake names and outlines',
    licence: 'Contains information licensed under the Open Government Licence – British Columbia.',
    url: 'https://catalogue.data.gov.bc.ca/dataset/freshwater-atlas-lakes' },
  { name: 'Known BC Fish Observations', use: 'Fish species recorded in each lake',
    licence: 'Contains information licensed under the Open Government Licence – British Columbia.',
    url: 'https://catalogue.data.gov.bc.ca/dataset/known-bc-fish-observations-and-bc-fish-distributions' },
  { name: 'BC Lake Surveys & Bathymetric Maps – Open', use: 'Lake depths and official depth maps (not for navigation)',
    licence: 'Contains information licensed under the Open Government Licence – British Columbia.',
    url: 'https://catalogue.data.gov.bc.ca/dataset/1427d389-cd21-4fe2-8ed9-282d9bdcb7e2' },
  { name: 'OpenFreeMap / OpenStreetMap', use: 'Map tiles', licence: 'OpenFreeMap © OpenMapTiles. Data © OpenStreetMap contributors (ODbL).',
    url: 'https://openfreemap.org' },
  { name: 'Open-Meteo', use: 'Weather at catch time', licence: 'CC BY 4.0. Free tier for non-commercial use.', url: 'https://open-meteo.com' },
  { name: 'Fishial.ai', use: 'Species identification from photos', licence: 'Fishial Recognition API.', url: 'https://fishial.ai' },
];

export default function Credits() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Data sources" back />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }}>
        <Text style={type.muted}>CatchLog is a non-commercial hobby app. These sources make it work offline.</Text>
        {SOURCES.map((s) => (
          <Pressable key={s.name} style={styles.card} onPress={() => WebBrowser.openBrowserAsync(s.url)}>
            <Text style={type.heading}>{s.name}</Text>
            <Text style={type.body}>{s.use}</Text>
            <Text style={type.muted}>{s.licence}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: space.lg, gap: 4 },
});
