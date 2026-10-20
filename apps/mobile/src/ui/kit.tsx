import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/Theme';
import { articleColour, COLUMN, FONTS, RADIUS, SPACE, TEXT } from '../theme/tokens';

/** The column every screen sits in, so a tablet does not stretch a line of text. */
export function Column({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ width: '100%', maxWidth: COLUMN, alignSelf: 'center' }, style]}>{children}</View>;
}

export function Body({ children, style, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const { palette } = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[{ fontFamily: FONTS.body, fontSize: TEXT.md, color: palette.foreground }, style]}>
      {children}
    </Text>
  );
}

export function Label({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const { palette } = useTheme();
  return (
    <Text style={[{ fontFamily: FONTS.strong, fontSize: TEXT.xs, letterSpacing: 0.6, textTransform: 'uppercase', color: palette.muted }, style]}>
      {children}
    </Text>
  );
}

export function Title({ children, small }: { children: ReactNode; small?: boolean }) {
  const { palette } = useTheme();
  return (
    <Text style={{ fontFamily: FONTS.black, fontSize: small ? TEXT.xl : TEXT['2xl'], color: palette.foreground, letterSpacing: -0.4 }}>
      {children}
    </Text>
  );
}

type ButtonTone = 'main' | 'quiet' | 'danger';

export function Button({
  onPress,
  children,
  tone = 'main',
  disabled,
  loading,
  style,
  accessibilityLabel,
}: {
  onPress: () => void;
  children: ReactNode;
  tone?: ButtonTone;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const { palette } = useTheme();
  const background = tone === 'main' ? palette.buttonBackground : tone === 'danger' ? palette.danger : palette.iconBackground;
  const foreground = tone === 'main' ? palette.buttonForeground : tone === 'danger' ? '#ffffff' : palette.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled || !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: background,
          borderRadius: RADIUS.md,
          paddingHorizontal: SPACE.xl,
          paddingVertical: SPACE.md,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: SPACE.sm,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={foreground} /> : null}
      <Text style={{ fontFamily: FONTS.strong, fontSize: TEXT.md, color: foreground }} numberOfLines={1}>
        {children}
      </Text>
    </Pressable>
  );
}

/** A word's article, in its own colour, or nothing when it has none. */
export function Article({ language, article, style }: { language: 'de' | 'en'; article: string | null | undefined; style?: StyleProp<TextStyle> }) {
  const { palette } = useTheme();
  const colour = articleColour(palette, article);
  if (!article) return null;
  return (
    <Text style={[{ fontFamily: FONTS.strong, color: colour, fontSize: TEXT.md }, style]}>
      {article}
      {language ? ' ' : ' '}
    </Text>
  );
}

/** The five levels of a word, as dots. */
export function LevelDots({ level, max }: { level: number; max: number }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 3 }} accessibilityLabel={`Level ${level} of ${max}`}>
      {Array.from({ length: max }, (_, step) => (
        <View
          key={step}
          style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: step < level ? palette.accent : palette.line }}
        />
      ))}
    </View>
  );
}

export function Separator({ label }: { label?: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, marginVertical: SPACE.lg }}>
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: palette.line }} />
      {label ? <Label>{label}</Label> : null}
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: palette.line }} />
    </View>
  );
}

export const ROW = { flexDirection: 'row' as const, alignItems: 'center' as const };
