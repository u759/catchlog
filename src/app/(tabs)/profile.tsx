import { Image } from 'expo-image';
import { Check, LogOut, Ruler, UserPlus, Users } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { Button, Chip, Field, Section } from '@/components/ui';
import { useAcceptFriend, useAddFriend, useFriends, useProfile, useSetUnits, useUnits } from '@/features/profile/hooks';
import { signOut } from '@/lib/auth';
import { colors, radius, space, type } from '@/theme';

export default function Profile() {
  const { data: profile } = useProfile();
  const units = useUnits();
  const setUnits = useSetUnits();
  const { data: friends = [] } = useFriends();
  const addFriend = useAddFriend();
  const accept = useAcceptFriend();
  const [code, setCode] = useState('');

  const onAdd = () =>
    addFriend.mutate(code, {
      onSuccess: (msg) => {
        setCode('');
        Alert.alert('Friends', msg);
      },
      onError: (e) => Alert.alert('Could not add friend', e.message),
    });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Profile" />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.me}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.surfaceAlt }]} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={type.heading}>{profile?.display_name ?? 'Angler'}</Text>
            <Pressable
              onPress={() =>
                profile && Share.share({ message: `Add me on CatchLog — my friend code is ${profile.friend_code}` })
              }>
              <Text style={type.muted}>
                Friend code <Text style={styles.code}>{profile?.friend_code ?? '······'}</Text> · tap to share
              </Text>
            </Pressable>
          </View>
        </View>

        <Section title="Units" icon={Ruler}>
          <View style={styles.chips}>
            <Chip label="Imperial (in / lbs)" selected={units === 'imperial'} onPress={() => setUnits.mutate('imperial')} />
            <Chip label="Metric (cm / kg)" selected={units === 'metric'} onPress={() => setUnits.mutate('metric')} />
          </View>
        </Section>

        <Section title="Friends" icon={Users}>
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
            <Field
              label="Add by friend code"
              placeholder="ABC123"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              value={code}
              onChangeText={setCode}
            />
            <Button
              label="Add"
              icon={UserPlus}
              variant="accent"
              onPress={onAdd}
              loading={addFriend.isPending}
              disabled={code.trim().length < 6}
              style={{ height: 48, paddingHorizontal: space.lg }}
            />
          </View>

          {friends.length === 0 ? (
            <Text style={type.muted}>No friends yet. Share your code with your fishing buddies.</Text>
          ) : (
            friends.map((f) => (
              <View key={f.other.id} style={styles.friend}>
                {f.other.avatar_url ? (
                  <Image source={{ uri: f.other.avatar_url }} style={styles.friendAvatar} />
                ) : (
                  <View style={[styles.friendAvatar, { backgroundColor: colors.surfaceAlt }]} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { fontWeight: '600' }]}>{f.other.display_name ?? 'Angler'}</Text>
                  <Text style={type.muted}>
                    {f.status === 'accepted' ? 'Friends' : f.incoming ? 'Wants to be friends' : 'Request sent'}
                  </Text>
                </View>
                {f.status === 'pending' && f.incoming && (
                  <Button
                    label="Accept"
                    icon={Check}
                    variant="primary"
                    onPress={() => accept.mutate(f.other.id)}
                    style={{ height: 38, paddingHorizontal: space.md }}
                  />
                )}
              </View>
            ))
          )}
        </Section>

        <Button label="Sign out" icon={LogOut} variant="ghost" onPress={signOut} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  me: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
  },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  code: { fontWeight: '800', color: colors.primary, letterSpacing: 1 },
  chips: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  friend: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  friendAvatar: { width: 40, height: 40, borderRadius: 20 },
});
