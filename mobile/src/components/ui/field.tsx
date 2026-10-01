import { useState, type ReactNode } from "react";
import {
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontFamily, fontSize, radius, shadows } from "@/theme/tokens";
import { AppText } from "./text";

type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Rótulo, controle e ajuda ou erro (.field). */
export function Field({ label, hint, error, children, style }: FieldProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={[styles.field, style]}>
      <AppText size={fontSize.sm} weight={600} color={colors.text2}>
        {label}
      </AppText>
      {children}
      {error ? (
        <AppText size={fontSize.xs} color={colors.errorText} accessibilityRole="alert">
          {error}
        </AppText>
      ) : hint ? (
        <AppText size={fontSize.xs} color={colors.muted} lineHeight={19}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

export type TextFieldProps = TextInputProps & { invalid?: boolean };

/** Campo de texto com o foco esmeralda do padrão web. */
export function TextField({
  style,
  multiline,
  invalid = false,
  onFocus,
  onBlur,
  ...rest
}: TextFieldProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [isFocused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      {...rest}
      multiline={multiline}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[
        styles.input,
        multiline && styles.multiline,
        isFocused && styles.focused,
        invalid && styles.invalid,
        style,
      ]}
    />
  );
}

const useStyles = makeStyles((colors) => ({
  field: { gap: 7 },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingVertical: 11,
    paddingHorizontal: 13,
    backgroundColor: colors.surface3,
    color: colors.text,
    fontFamily: fontFamily(400),
    fontSize: fontSize.base,
  },
  multiline: { minHeight: 96, textAlignVertical: "top" },
  focused: {
    borderColor: colors.green500,
    backgroundColor: colors.surface,
    boxShadow: shadows.focus,
  },
  invalid: { borderColor: colors.rose400 },
}));
