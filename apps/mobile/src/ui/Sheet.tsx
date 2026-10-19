import { type ReactNode, useEffect, useRef } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/Theme';
import { COLUMN, FONTS, RADIUS, SPACE, TEXT } from '../theme/tokens';
import { Title } from './kit';
import { Label } from './kit';

/**
 * A bottom sheet on phones and a centred card from tablet width up, the same
 * shape the web app uses. Mount it to open it, unmount it to close.
 */
export function Sheet({
  eyebrow,
  title,
  onClose,
  footer,
  children,
}: {
  eyebrow: ReactNode;
  title: string;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const wide = width >= 768;
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(slide, { toValue: 1, useNativeDriver: true, damping: 22, stiffness: 220, mass: 0.7 }).start();
  }, [slide]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.42)', justifyContent: wide ? 'center' : 'flex-end' }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none">
          <Animated.View
            style={{
              backgroundColor: palette.background,
              maxHeight: height * 0.94,
              borderTopLeftRadius: wide ? RADIUS.xl : RADIUS.xl,
              borderTopRightRadius: wide ? RADIUS.xl : RADIUS.xl,
              borderBottomLeftRadius: wide ? RADIUS.xl : 0,
              borderBottomRightRadius: wide ? RADIUS.xl : 0,
              alignSelf: wide ? 'center' : 'stretch',
              width: wide ? Math.min(COLUMN, width - 64) : '100%',
              paddingBottom: insets.bottom,
              transform: [
                {
                  translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }),
                },
              ],
            }}
          >
            <View style={{ alignItems: 'center', paddingTop: SPACE.sm }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: palette.line }} />
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: SPACE.md,
                paddingHorizontal: SPACE.xl,
                paddingTop: SPACE.md,
                paddingBottom: SPACE.sm,
              }}
            >
              <View style={{ flex: 1 }}>
                <Label>{eyebrow}</Label>
                <Title>{title}</Title>
              </View>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={12}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: RADIUS.pill,
                  backgroundColor: palette.iconBackground,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={17} color={palette.foreground} />
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: SPACE.xl, paddingBottom: SPACE.lg }}
            >
              {children}
            </ScrollView>
            <View
              style={{
                flexDirection: 'row',
                gap: SPACE.sm,
                paddingHorizontal: SPACE.xl,
                paddingTop: SPACE.md,
                paddingBottom: SPACE.md,
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: palette.line,
              }}
            >
              {footer}
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/** A page over the app: a lesson, the ready-made lists. */
export function FullScreen({
  children,
  onClose,
  label,
  contentStyle,
}: {
  children: ReactNode;
  onClose: () => void;
  label: string;
  contentStyle?: object;
}) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent presentationStyle="fullScreen">
      <View
        accessibilityLabel={label}
        style={[{ flex: 1, backgroundColor: palette.background, paddingTop: insets.top }, contentStyle]}
      >
        {children}
      </View>
    </Modal>
  );
}

/** A small round button with nothing in it but an icon: the way out of a page. */
export function RoundButton({ onPress, children, label }: { onPress: () => void; children: ReactNode; label: string }) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      style={({ pressed }) => ({
        width: 38,
        height: 38,
        borderRadius: RADIUS.pill,
        backgroundColor: palette.iconBackground,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}

/** A pill with a label and an optional icon, used for the sort menu and lists. */
export function Pill({
  onPress,
  children,
  active,
  style,
}: {
  onPress: () => void;
  children: ReactNode;
  active?: boolean;
  style?: object;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.xs,
          paddingHorizontal: SPACE.md,
          paddingVertical: SPACE.sm,
          borderRadius: RADIUS.pill,
          backgroundColor: active ? palette.selection : palette.iconBackground,
          opacity: pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}>{children}</View>
    </Pressable>
  );
}

export const sheetTextStyle = { fontFamily: FONTS.body, fontSize: TEXT.md };
