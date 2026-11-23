/**
 * The home-screen widget: the monthly total and the next few charges.
 *
 * The layout runs in the widget's own JavaScript runtime, not the app's: the `'widget'` directive
 * turns the function into source text at build time. So it can't use hooks, read the database, or
 * reference anything outside its body except the Expo UI components and modifiers, and it's kept
 * free of TypeScript syntax (the types sit on the variable instead). Everything it shows is
 * worked out in the app (`src/lib/widget-snapshot.ts`) and pushed with `updateSnapshot`.
 *
 * Its name must match the `expo-widgets` entry in `app.json`, which also points `initialLayout` at
 * this file so the widget shows something before the app's first launch.
 */
import { Box, Column, Row, Text } from '@expo/ui/jetpack-compose';
import { background, cornerRadius, fillMaxSize, fillMaxWidth, padding, paddingAll } from '@expo/ui/jetpack-compose/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { JSX } from 'react';

export type UpcomingWidgetCharge = {
  name: string;
  /** "Dec 4", or "Trial ends Dec 4". Absolute dates, since the widget only changes when the app updates it. */
  when: string;
  amount: string;
  isTrialEnd: boolean;
};

export type UpcomingWidgetProps = {
  /** "€84.97", the average per month. */
  monthly: string;
  /** The next charges, soonest first. The widget shows the first three. */
  upcoming: UpcomingWidgetCharge[];
  /** Shown instead of the charges when there are none. */
  emptyText: string;
};

const layout: (props: UpcomingWidgetProps, environment: WidgetEnvironment) => JSX.Element = (props, environment) => {
  'widget';
  // The app's palette (`src/constants/theme.ts`), repeated: nothing outside this function is visible here.
  const colors =
    environment.colorScheme === 'dark'
      ? { background: '#1A1B33', text: '#F1F1FA', secondary: '#A3A5C2', tint: '#8B85FF', trial: '#F2A33A' }
      : { background: '#FFFFFF', text: '#14152B', secondary: '#5E6079', tint: '#4F46E5', trial: '#C2700F' };
  const rows = props.upcoming.slice(0, 3);

  return (
    <Column modifiers={[fillMaxSize(), background(colors.background), cornerRadius(20), paddingAll(14)]}>
      <Box modifiers={[fillMaxWidth(), padding(0, 0, 0, 6)]}>
        <Box modifiers={[fillMaxWidth()]} contentAlignment="bottomStart">
          <Text color={colors.secondary} maxLines={1} style={{ fontSize: 13, fontWeight: '600' }}>
            Next charges
          </Text>
        </Box>
        <Box modifiers={[fillMaxWidth()]} contentAlignment="bottomEnd">
          <Text color={colors.tint} maxLines={1} style={{ fontSize: 15, fontWeight: '800' }}>
            {`${props.monthly} / mo`}
          </Text>
        </Box>
      </Box>

      {rows.length === 0 ? (
        <Text color={colors.secondary} style={{ fontSize: 13 }}>
          {props.emptyText}
        </Text>
      ) : (
        rows.map((row, i) => (
          <Box key={i} modifiers={[fillMaxWidth(), padding(0, 3, 0, 3)]}>
            <Box modifiers={[fillMaxWidth(), padding(0, 0, 150, 0)]} contentAlignment="centerStart">
              <Text color={colors.text} maxLines={1} overflow="ellipsis" style={{ fontSize: 14, fontWeight: '600' }}>
                {row.name}
              </Text>
            </Box>
            <Box modifiers={[fillMaxWidth()]} contentAlignment="centerEnd">
              <Row verticalAlignment="center">
                <Text color={row.isTrialEnd ? colors.trial : colors.secondary} maxLines={1} style={{ fontSize: 13 }}>
                  {row.when}
                </Text>
                <Text color={colors.text} maxLines={1} style={{ fontSize: 14, fontWeight: '700' }} modifiers={[padding(10, 0, 0, 0)]}>
                  {row.amount}
                </Text>
              </Row>
            </Box>
          </Box>
        ))
      )}
    </Column>
  );
};

export default createWidget<UpcomingWidgetProps>('UpcomingWidget', layout, {
  monthly: '—',
  upcoming: [],
  emptyText: 'Open Subtracker to see your next charges.',
});
