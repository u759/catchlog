import { Package } from 'lucide-react-native';
import { View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { EmptyState } from '@/components/ui';
import { colors } from '@/theme';

// TODO: decide what the Cooler is — a tackle box (saved lures/line the catch form picks from)
// or today's kept fish vs. bag limits.
export default function Cooler() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Cooler" />
      <EmptyState icon={Package} title="Coming soon" body="Your tackle box and today's keepers will live here." />
    </View>
  );
}
