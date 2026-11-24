import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageHeader } from '@/components/page-header';
import { ScrollView } from '@/components/scroll-view';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { POLICY_UPDATED, PRIVACY_POLICY } from '@/lib/privacy-policy';

export default function PrivacyPolicyScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.four }]}>
      <PageHeader title="Privacy policy" subtitle={`Last updated ${POLICY_UPDATED}`} />
      {PRIVACY_POLICY.map((section) => (
        <View key={section.heading} style={styles.section}>
          <ThemedText type="smallBold" accessibilityRole="header">
            {section.heading}
          </ThemedText>
          {section.paragraphs?.map((paragraph) => (
            <ThemedText key={paragraph}>{paragraph}</ThemedText>
          ))}
          {section.bullets?.map((bullet) => (
            <View key={bullet} style={styles.bullet}>
              <ThemedText>•</ThemedText>
              <ThemedText style={styles.bulletText}>{bullet}</ThemedText>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.screen,
    paddingTop: Spacing.three,
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  bullet: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  bulletText: {
    flex: 1,
  },
});
