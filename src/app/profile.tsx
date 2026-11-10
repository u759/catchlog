import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Check, LogOut, Pencil, X } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { Button, Field, Group, Row, Section, Segmented } from '@/components/ui';
import {
  acceptFriend,
  cleanFriendCode,
  type Friendship,
  useAddFriend,
  removeFriend,
  setDisplayName,
  setUnits,
  useFriends,
  useProfile,
  useUnits,
} from '@/features/profile/hooks';
import { usePendingUploads, useUserId } from '@/features/catches/hooks';
import { signOut } from '@/lib/auth';
import { colors, space, touch, type } from '@/theme';

export default function Profile() {
  const { data: profile } = useProfile();
  const units = useUnits();
  const userId = useUserId() ?? '';
  const sync = usePendingUploads();
  const friends = useFriends();
  const addFriend = useAddFriend();
  const [code, setCode] = useState('');
  const [editingName, setEditingName] = useState<string | null>(null);

  const saveName = () =>
    editingName !== null &&
    setDisplayName(userId, editingName)
      .then(() => setEditingName(null))
      .catch(() => Alert.alert('Couldn’t save your name', 'Check your connection and try again.'));

  const confirmRemove = (f: Friendship) => {
    const name = f.other.display_name ?? 'this angler';
    const [title, action] =
      f.status === 'accepted'
        ? [`Remove ${name} as a friend?`, 'Remove']
        : f.incoming
          ? [`Decline ${name}’s request?`, 'Decline']
          : [`Cancel your request to ${name}?`, 'Cancel request'];
    Alert.alert(title, undefined, [
      { text: 'Keep', style: 'cancel' },
      {
        text: action,
        style: 'destructive',
        onPress: () => removeFriend(f.id).catch(() => Alert.alert('Couldn’t update friends', 'Check your connection and try again.')),
      },
    ]);
  };

  const onAdd = () =>
    addFriend.mutate(code, {
      onSuccess: (msg) => {
        setCode('');
        Alert.alert('Friend request', msg);
      },
      onError: (e) => Alert.alert('Couldn’t add that friend', e.message),
    });

  // Signing out wipes this device's local copy; warn if anything hasn't uploaded yet.
  const confirmSignOut = () => {
    if (sync.count === 0) return void signOut();
    Alert.alert(
      'Some changes haven’t uploaded',
      `${sync.count} change${sync.count > 1 ? 's haven’t' : ' hasn’t'} been uploaded yet. Signing out now will lose ${sync.count > 1 ? 'them' : 'it'}. Connect to the internet first to keep ${sync.count > 1 ? 'them' : 'it'}.`,
      [
        { text: 'Stay signed in', style: 'cancel' },
        { text: 'Sign out anyway', style: 'destructive', onPress: () => void signOut() },
      ],
    );
  };

  const name = profile?.display_name ?? 'Angler';
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Profile" back />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.me}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} accessibilityLabel="Your photo" />
          ) : (
            <View style={[styles.avatar, styles.initialWrap]}>
              <Text style={[type.title, { color: colors.primary }]}>{name.slice(0, 1).toUpperCase()}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            {editingName === null ? (
              <View style={styles.nameRow}>
                <Text style={[type.title, { flexShrink: 1 }]} numberOfLines={1}>{name}</Text>
                <Pressable onPress={() => setEditingName(profile?.display_name ?? '')} accessibilityRole="button"
                  accessibilityLabel="Edit display name" style={styles.iconButton}>
                  <Pencil size={18} color={colors.textMuted} />
                </Pressable>
              </View>
            ) : (
              <View style={styles.nameRow}>
                <TextInput
                  style={styles.nameInput}
                  value={editingName}
                  onChangeText={setEditingName}
                  autoFocus
                  maxLength={40}
                  returnKeyType="done"
                  onSubmitEditing={saveName}
                  accessibilityLabel="Display name"
                />
                <Pressable onPress={saveName} accessibilityRole="button" accessibilityLabel="Save name" style={styles.iconButton}>
                  <Check size={22} color={colors.primary} />
                </Pressable>
                <Pressable onPress={() => setEditingName(null)} accessibilityRole="button" accessibilityLabel="Cancel"
                  style={styles.iconButton}>
                  <X size={22} color={colors.textMuted} />
                </Pressable>
              </View>
            )}
          </View>
        </View>

        <Group>
          <Row
            label="Your friend code"
            value={profile?.friend_code ?? '········'}
            right={
              <Button label="Share" variant="text" style={{ paddingHorizontal: space.sm }}
                onPress={() => profile && Share.share({ message: `Add me on CatchLog. My friend code is ${profile.friend_code}` })} />
            }
          />
        </Group>

        <Section title="Units">
          <Segmented
            options={[
              { value: 'metric', label: 'Metric (cm, kg)' },
              { value: 'imperial', label: 'Imperial (in, lb)' },
            ]}
            value={units}
            onChange={(u) => setUnits(userId, u)}
          />
        </Section>

        <Section title="Friends">
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
            <Field
              label="Add a friend by code"
              placeholder="8 letters and numbers"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={9}
              value={code}
              onChangeText={setCode}
            />
            <Button
              label="Add"
              variant="primary"
              onPress={onAdd}
              loading={addFriend.isPending}
              disabled={cleanFriendCode(code).length !== 8}
              style={{ minHeight: 48, paddingHorizontal: space.lg }}
            />
          </View>

          {friends.length === 0 ? (
            <Text style={type.secondary}>No friends yet. Share your code to add one.</Text>
          ) : (
            <Group>
              {friends.map((f) => (
                <View key={f.id} style={styles.friend}>
                  {f.other.avatar_url ? (
                    <Image source={{ uri: f.other.avatar_url }} style={styles.friendAvatar} />
                  ) : (
                    <View style={[styles.friendAvatar, styles.initialWrap]}>
                      <Text style={[type.headline, { color: colors.primary }]}>
                        {(f.other.display_name ?? 'A').slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={type.body}>{f.other.display_name ?? 'Angler'}</Text>
                    <Text style={type.secondary}>
                      {f.status === 'accepted' ? 'Friends' : f.incoming ? 'Wants to be friends' : 'Request sent'}
                    </Text>
                  </View>
                  {f.status === 'pending' && f.incoming && (
                    <Button label="Accept" variant="primary" onPress={() => acceptFriend(f.id)}
                      style={{ minHeight: 40, paddingHorizontal: space.md }} />
                  )}
                  <Pressable
                    onPress={() => confirmRemove(f)}
                    style={styles.iconButton}
                    accessibilityRole="button"
                    accessibilityLabel={f.status === 'accepted' ? 'Remove friend' : f.incoming ? 'Decline' : 'Cancel request'}>
                    <X size={20} color={colors.textMuted} />
                  </Pressable>
                </View>
              ))}
            </Group>
          )}
        </Section>

        <Group>
          <Row label="Data sources and credits" onPress={() => router.push('/credits')} />
        </Group>

        <Button label="Sign out" icon={LogOut} variant="danger" onPress={confirmSignOut} style={{ alignSelf: 'flex-start' }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.xl, paddingBottom: space.xxl },
  me: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  initialWrap: { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  friend: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingVertical: space.sm },
  friendAvatar: { width: 40, height: 40, borderRadius: 20 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  nameInput: {
    flex: 1,
    ...type.title,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
    paddingVertical: 2,
  },
  iconButton: { width: touch, height: touch, alignItems: 'center', justifyContent: 'center' },
});
