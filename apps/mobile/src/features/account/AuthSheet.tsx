import { Text, View } from 'react-native';
import { Cloud, ShieldCheck, Smartphone } from 'lucide-react-native';
import { useTheme } from '../../theme/Theme';
import { FONTS, RADIUS, SPACE, TEXT } from '../../theme/tokens';
import { Body, Button, Label, Title } from '../../ui/kit';
import { Sheet } from '../../ui/Sheet';

function GoogleMark() {
  return (
    <View
      style={{
        width: 26,
        height: 26,
        borderRadius: RADIUS.pill,
        backgroundColor: '#ffffff',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: FONTS.black, fontSize: 15, color: '#4285F4' }}>G</Text>
    </View>
  );
}

/** Asks the person to sign in with Google, the same card Akin shows. */
export function AuthSheet({
  error,
  pending,
  onSignIn,
  onDismiss,
}: {
  error: string | null;
  pending: boolean;
  onSignIn: () => void;
  onDismiss: () => void;
}) {
  const { palette } = useTheme();
  return (
    <Sheet
      eyebrow="Make it yours"
      title="Take your words everywhere."
      onClose={onDismiss}
      footer={
        <Button onPress={onSignIn} loading={pending} style={{ flex: 1 }}>
          <GoogleMark />
          {pending ? 'Heading to Google…' : 'Continue with Google'}
        </Button>
      }
    >
      <View style={{ gap: SPACE.lg }}>
        <Body style={{ color: palette.muted }}>
          Sign in with Google and every word you pick follows you, on this phone and every other device.
        </Body>
        <View style={{ gap: SPACE.md }}>
          {[
            { Icon: Cloud, text: 'Keep your words and pictures on every device' },
            { Icon: Smartphone, text: 'Add a word on your phone, practise it on your laptop' },
            { Icon: ShieldCheck, text: 'Safe even if this phone is lost' },
          ].map(({ Icon, text }) => (
            <View key={text} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: RADIUS.pill,
                  backgroundColor: palette.iconBackground,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon size={17} color={palette.muted} />
              </View>
              <Body style={{ flex: 1, fontSize: TEXT.md }}>{text}</Body>
            </View>
          ))}
        </View>
        {error ? <Body style={{ color: palette.danger }}>{error}</Body> : null}
        <Label style={{ textTransform: 'none', color: palette.faint }}>
          Words you added before signing in come along.
        </Label>
      </View>
    </Sheet>
  );
}

export { Title };
