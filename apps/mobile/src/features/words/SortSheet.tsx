import { Pressable, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { ARROW, WORD_SORTS, type WordSort } from './sort-options';
import { sounds } from '../../platform/sound';
import { useTheme } from '../../theme/Theme';
import { FONTS, SPACE, TEXT } from '../../theme/tokens';
import { Body } from '../../ui/kit';
import { Sheet } from '../../ui/Sheet';

/** Picks how the word list is ordered. */
export function SortSheet({ sort, onChange, onClose }: { sort: WordSort; onChange: (sort: WordSort) => void; onClose: () => void }) {
  const { palette } = useTheme();
  return (
    <Sheet eyebrow="Order" title="Sort words" onClose={onClose} footer={<View style={{ flex: 1 }} />}>
      {WORD_SORTS.map((option) => {
        const Icon = ARROW[option.value];
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (option.value !== sort) sounds.tap();
              onChange(option.value);
              onClose();
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: SPACE.md,
              paddingVertical: SPACE.md,
              paddingHorizontal: SPACE.sm,
              borderRadius: 12,
              backgroundColor: pressed ? palette.iconHover : 'transparent',
            })}
          >
            <Icon size={17} color={palette.muted} />
            <Body style={{ flex: 1, fontFamily: option.value === sort ? FONTS.strong : FONTS.body }}>{option.label}</Body>
            {option.value === sort ? <Check size={17} color={palette.accent} /> : null}
          </Pressable>
        );
      })}
      <Body style={{ color: palette.muted, fontSize: TEXT.sm, marginTop: SPACE.md }}>Remembered on this device.</Body>
    </Sheet>
  );
}
