import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { Field, TextField } from '@/components/field';
import { FormScreen } from '@/components/form-screen';
import { PageHeader } from '@/components/page-header';
import { ThemedText } from '@/components/themed-text';
import { replaceAllSubscriptions } from '@/db/backup';
import { getSubscriptions } from '@/db/subscriptions';
import { BackupError, parseBackup } from '@/lib/backup';
import { setCurrency } from '@/lib/currency';
import { haptic } from '@/lib/haptics';

function count(n: number) {
  return `${n} ${n === 1 ? 'subscription' : 'subscriptions'}`;
}

/** Restores a pasted backup, replacing every subscription after asking. */
export default function RestoreScreen() {
  const db = useSQLiteContext();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const restore = async () => {
    let backup;
    try {
      backup = parseBackup(text);
    } catch (e) {
      setError(e instanceof BackupError ? e.message : "This backup couldn't be read.");
      return;
    }
    setError(null);
    let current: number;
    try {
      current = (await getSubscriptions(db)).length;
    } catch (e) {
      console.error(e);
      setError('Restoring failed, so nothing was changed.');
      return;
    }

    const apply = async () => {
      setRestoring(true);
      try {
        await replaceAllSubscriptions(db, backup.subscriptions);
        setCurrency(backup.currency);
        haptic.success();
        router.back();
      } catch (e) {
        console.error(e);
        setRestoring(false);
        setError('Restoring failed, so nothing was changed.');
      }
    };

    if (current === 0) return apply();
    Alert.alert(
      `Replace ${count(current)}?`,
      `Everything in the app is replaced with the backup's ${count(backup.subscriptions.length)}. This can't be undone.`,
      [
        { text: 'Keep mine', style: 'cancel' },
        { text: 'Replace', style: 'destructive', onPress: apply },
      ]
    );
  };

  return (
    <FormScreen>
      <PageHeader
        title="Restore a backup"
        subtitle="Paste the text from “Export backup”. It replaces everything here, and sets the currency to the backup's."
      />

      <Field label="Backup">
        <TextField
          value={text}
          onChangeText={(value) => {
            setText(value);
            setError(null);
          }}
          placeholder='{"app":"subtracker", …'
          multiline
          autoCorrect={false}
          autoCapitalize="none"
          style={styles.input}
        />
        {error && (
          <ThemedText type="small" themeColor="danger" accessibilityLiveRegion="polite">
            {error}
          </ThemedText>
        )}
      </Field>

      <Button title="Restore" onPress={restore} disabled={text.trim() === ''} loading={restoring} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 160,
    maxHeight: 320,
    textAlignVertical: 'top',
    fontSize: 13,
  },
});
