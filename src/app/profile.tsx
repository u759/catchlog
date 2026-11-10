import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Check, LogOut, Pencil, Ruler, UserPlus, Users, X } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { Button, Chip, Field, Section } from '@/components/ui';
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
import { colors, radius, space, type } from '@/theme';

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
      .catch((e: Error) => Alert.alert('Could not save name', e.message));

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
        onPress: () => removeFriend(f.id).catch((e: Error) => Alert.alert('Error', e.message)),
      },
    ]);
  };

  const onAdd = () =>
    addFriend.mutate(code, {
      onSuccess: (msg) => {
        setCode('');
        Alert.alert('Friends', msg);
      },
      onError: (e) => Alert.alert('Could not add friend', e.message),
    });

  // Signing out wipes this device's local copy; warn if anything hasn't uploaded yet.
  const confirmSignOut = () => {
    if (sync.count === 0) return void signOut();
    Alert.alert(
      'Unsynced changes',
      `${sync.count} change${sync.count > 1 ? 's haven’t' : ' hasn’t'} been uploaded yet. Signing out now will lose ${sync.count > 1 ? 'them' : 'it'}. Connect to the internet first to keep ${sync.count > 1 ? 'them' : 'it'}.`,
      [
        { text: 'Stay signed in', style: 'cancel' },
        { text: 'Sign out anyway', style: 'destructive', onPress: () => void signOut() },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Profile" back />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.me}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.surfaceAlt }]} />
          )}
          <View style={{ flex: 1, gap: 2 }}>
            {editingName === null ? (
              <Pressable
                style={styles.nameRow}
                onPress={() => setEditingName(profile?.display_name ?? '')}
                accessibilityLabel="Edit display name">
                <Text style={type.heading}>{profile?.display_name ?? 'Angler'}</Text>
                <Pencil size={14} color={colors.textMuted} />
              </Pressable>
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
                />
                <Pressable onPress={saveName} hitSlop={8} accessibilityLabel="Save name">
                  <Check size={20} color={colors.primary} />
                </Pressable>
                <Pressable onPress={() => setEditingName(null)} hitSlop={8} accessibilityLabel="Cancel">
                  <X size={20} color={colors.textMuted} />
                </Pressable>
              </View>
            )}
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
            <Chip label="Imperial (in / lbs)" selected={units === 'imperial'} onPress={() => setUnits(userId, 'imperial')} />
            <Chip label="Metric (cm / kg)" selected={units === 'metric'} onPress={() => setUnits(userId, 'metric')} />
          </View>
        </Section>

        <Section title="Friends" icon={Users}>
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
            <Field
              label="Add by friend code"
              placeholder="ABCD2345"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={9}
              value={code}
              onChangeText={setCode}
            />
            <Button
              label="Add"
              icon={UserPlus}
              variant="accent"
              onPress={onAdd}
              loading={addFriend.isPending}
              disabled={cleanFriendCode(code).length !== 8}
              style={{ height: 48, paddingHorizontal: space.lg }}
            />
          </View>

          {friends.length === 0 ? (
            <Text style={type.muted}>No friends yet. Share your code with your fishing buddies.</Text>
          ) : (
            friends.map((f) => (
              <View key={f.id} style={styles.friend}>
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
                    onPress={() => acceptFriend(f.id)}
                    style={{ height: 38, paddingHorizontal: space.md }}
                  />
                )}
                <Pressable
                  onPress={() => confirmRemove(f)}
                  hitSlop={8}
                  style={styles.removeBtn}
                  accessibilityLabel={f.status === 'accepted' ? 'Remove friend' : f.incoming ? 'Decline' : 'Cancel request'}>
                  <X size={18} color={colors.textMuted} />
                </Pressable>
              </View>
            ))
          )}
        </Section>

        <Button label="Sign out" icon={LogOut} variant="ghost" onPress={confirmSignOut} />

        <Pressable onPress={() => router.push('/credits')} style={{ alignSelf: 'center' }}>
          <Text style={[type.muted, { textDecorationLine: 'underline' }]}>Data sources & credits</Text>
        </Pressable>
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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  nameInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
    paddingVertical: 2,
  },
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
