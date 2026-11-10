import { useState } from 'react';
import { FlatList, type ImageStyle, StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { CatchPhoto } from '@/components/CatchPhoto';
import type { CatchPhotoRef } from '@/features/catches/model';
import { colors, motion, radius, space } from '@/theme';

/**
 * A catch's photos, swiped sideways one at a time, with page dots under them when there's more than one.
 * One photo (or none) renders as a single CatchPhoto, so the detail screen looks the same as before.
 */
export function PhotoPager({ photos, style }: { photos: CatchPhotoRef[]; style?: ImageStyle }) {
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const reduceMotion = useReducedMotion();

  if (photos.length <= 1) {
    return <CatchPhoto photoPath={photos[0]?.path} photoUrl={photos[0]?.url} style={style} iconSize={48} />;
  }
  return (
    <View style={{ gap: space.sm }}>
      <View style={[styles.frame, style as object]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <FlatList
            data={photos}
            keyExtractor={(p) => p.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            renderItem={({ item, index }) => (
              <View accessible accessibilityLabel={`Photo ${index + 1} of ${photos.length}`}>
                <CatchPhoto photoPath={item.path} photoUrl={item.url} style={{ width, height: '100%' }} iconSize={48} />
              </View>
            )}
          />
        )}
      </View>
      <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {photos.map((p, i) => (
          <Animated.View
            key={p.id}
            style={[styles.dot, { transitionDuration: reduceMotion ? 0 : motion.fast }, i === page && styles.dotActive]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', borderRadius: radius.lg, backgroundColor: colors.surfaceAlt },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: space.xs },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.borderStrong,
    transitionProperty: ['width', 'backgroundColor'],
    transitionTimingFunction: 'ease-out',
  },
  dotActive: { width: 16, backgroundColor: colors.primary },
});
