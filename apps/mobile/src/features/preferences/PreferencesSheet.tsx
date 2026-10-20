import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { Monitor, Moon, Sun } from 'lucide-react-native';
import type { AccountState } from '../../data/account';
import { useTheme, type ThemeChoice } from '../../theme/Theme';
import { FONTS, RADIUS, SPACE, TEXT } from '../../theme/tokens';
import { Body, Button, Label } from '../../ui/kit';
import { Sheet } from '../../ui/Sheet';

const THEMES: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
];

/** Preferences, and the account it is signed in with. */
export function PreferencesSheet({
  soundsOn,
  onSoundsChange,
  account,
  onSignOut,
  onDeleteAccount,
  onSignIn,
  onDismiss,
}: {
  soundsOn: boolean;
  onSoundsChange: (on: boolean) => void;
  account: AccountState;
  onSignOut: () => Promise<boolean>;
  onDeleteAccount: () => Promise<void>;
  onSignIn: () => void;
  onDismiss: () => void;
}) {
  const { palette, choice: theme, setChoice: onThemeChange } = useTheme();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <Sheet eyebrow="Preferences" title="Make it yours" onClose={onDismiss} footer={<View style={{ flex: 1 }} />}>
      <View style={{ gap: SPACE.xl }}>
        <Body style={{ color: palette.muted }}>Saved on this device.</Body>

        <View style={{ gap: SPACE.sm }}>
          <Label>Theme</Label>
          <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
            {THEMES.map(({ value, label, Icon }) => (
              <Pressable
                key={value}
                onPress={() => onThemeChange(value)}
                accessibilityState={{ selected: theme === value }}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  gap: SPACE.xs,
                  paddingVertical: SPACE.md,
                  borderRadius: RADIUS.md,
                  borderWidth: 1.5,
                  borderColor: theme === value ? palette.accent : palette.line,
                }}
              >
                <Icon size={17} color={theme === value ? palette.accent : palette.muted} />
                <Text style={{ fontFamily: FONTS.strong, fontSize: TEXT.sm, color: palette.foreground }}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
          <View style={{ flex: 1 }}>
            <Body style={{ fontFamily: FONTS.strong }}>Sounds</Body>
            <Body style={{ color: palette.muted, fontSize: TEXT.sm }}>Taps, answers and finished lessons.</Body>
          </View>
          <Switch value={soundsOn} onValueChange={onSoundsChange} />
        </View>

        <View style={{ height: 1, backgroundColor: palette.line }} />

        <View style={{ gap: SPACE.sm }}>
          <Label>Account</Label>
          {account.status === 'signed-in' ? (
            <>
              <Body style={{ color: palette.muted }}>{account.account.email}</Body>
              <Button
                tone="quiet"
                loading={busy}
                disabled={busy}
                onPress={async () => {
                  setBusy(true);
                  await onSignOut().catch(() => false);
                  setBusy(false);
                }}
              >
                Sign out
              </Button>
              {confirming ? (
                <View style={{ gap: SPACE.sm }}>
                  <Body style={{ color: palette.danger }}>
                    This deletes every word, picture and correction in the account. It cannot be undone.
                  </Body>
                  <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
                    <Button tone="quiet" onPress={() => setConfirming(false)} style={{ flex: 1 }}>
                      Keep it
                    </Button>
                    <Button
                      tone="danger"
                      loading={busy}
                      onPress={async () => {
                        setBusy(true);
                        await onDeleteAccount().catch(() => undefined);
                        setBusy(false);
                        setConfirming(false);
                        onDismiss();
                      }}
                      style={{ flex: 1 }}
                    >
                      Delete account
                    </Button>
                  </View>
                </View>
              ) : (
                <Button tone="quiet" onPress={() => setConfirming(true)}>
                  Delete account
                </Button>
              )}
            </>
          ) : (
            <>
              <Body style={{ color: palette.muted }}>Nothing is syncing. Your words live on this device.</Body>
              <Button onPress={onSignIn}>Sign in to sync</Button>
            </>
          )}
        </View>

        <Label style={{ textTransform: 'none', color: palette.faint }}>
          Word suggestions come from Wiktionary, under CC BY-SA.
        </Label>
      </View>
    </Sheet>
  );
}
