import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AUTH_COPY,
  logIn,
  resetPassword,
  signUp,
  type AccountInfo,
} from "@shared/lib/account";
import type { SyncRequest } from "@shared/lib/server-sync";
import { Logo } from "@/components/brand/logo";
import { AppText, Button, Card, Field, SegmentedControl, TextField, type Segment } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius, themeDomainTone } from "@/theme/tokens";

type AuthView = "login" | "signup" | "reset";
const VIEWS: readonly Segment<AuthView>[] = [
  { value: "login", label: AUTH_COPY.login },
  { value: "signup", label: AUTH_COPY.signup },
  { value: "reset", label: "Esqueci", accessibilityLabel: AUTH_COPY.forgot },
];

/**
 * Entrada do WebFit online no app (mesmas regras do web): entrar, criar conta com convite ou trocar a senha
 * com o código de redefinição. O token da sessão volta para `onSignedIn`, que o guarda no aparelho.
 */
export function AuthScreen({
  request,
  onSignedIn,
  notice,
}: {
  request: SyncRequest;
  onSignedIn: (account: AccountInfo, token: string) => Promise<void>;
  notice?: string;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState(notice ?? "");

  const choose = (next: AuthView) => {
    setView(next);
    setError("");
    setInfo("");
    setPassword("");
    setCode("");
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      if (view === "reset") {
        await resetPassword(request, code, password);
        choose("login");
        setInfo(AUTH_COPY.resetDone);
        return;
      }
      const result =
        view === "login"
          ? await logIn(request, email, password, "app")
          : await signUp(request, { invite: code, email, password, name }, "app");
      if (!result.token) throw new Error("O servidor não abriu a sessão. Tente de novo.");
      await onSignedIn(result.account, result.token);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Não foi possível concluir agora.");
    } finally {
      setBusy(false);
    }
  };

  const submitLabel = view === "login" ? AUTH_COPY.login : view === "signup" ? AUTH_COPY.signup : "Trocar a senha";
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 48 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logo}>
          <Logo />
        </View>
        <View style={styles.intro}>
          <AppText heading size={fontSize.xl} weight={700} accessibilityRole="header" style={styles.center}>
            {AUTH_COPY.title}
          </AppText>
          <AppText size={fontSize.sm} color={colors.text2} lineHeight={20} style={styles.center}>
            {AUTH_COPY.subtitle}
          </AppText>
        </View>
        <Card style={styles.card}>
          <SegmentedControl label="Como você quer entrar" segments={VIEWS} value={view} onChange={choose} size="sm" />
          {view !== "login" && (
            <Field
              label={view === "signup" ? AUTH_COPY.invite : AUTH_COPY.resetCode}
              hint={view === "signup" ? AUTH_COPY.inviteHint : AUTH_COPY.resetHint}
            >
              <TextField
                value={code}
                onChangeText={setCode}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                accessibilityLabel={view === "signup" ? AUTH_COPY.invite : AUTH_COPY.resetCode}
              />
            </Field>
          )}
          {view === "signup" && (
            <Field label={AUTH_COPY.name}>
              <TextField value={name} onChangeText={setName} autoComplete="given-name" accessibilityLabel={AUTH_COPY.name} />
            </Field>
          )}
          {view !== "reset" && (
            <Field label={AUTH_COPY.email}>
              <TextField
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                accessibilityLabel={AUTH_COPY.email}
              />
            </Field>
          )}
          <Field
            label={view === "reset" ? AUTH_COPY.newPassword : AUTH_COPY.password}
            hint={view === "login" ? undefined : AUTH_COPY.passwordHint}
          >
            <TextField
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={view === "login" ? "current-password" : "new-password"}
              textContentType={view === "login" ? "password" : "newPassword"}
              accessibilityLabel={view === "reset" ? AUTH_COPY.newPassword : AUTH_COPY.password}
              onSubmitEditing={() => void submit()}
            />
          </Field>
          {error ? (
            <View style={styles.error} accessibilityRole="alert">
              <AppText size={fontSize.sm} style={styles.errorText}>
                {error}
              </AppText>
            </View>
          ) : null}
          {info ? (
            <View style={styles.info} accessibilityLiveRegion="polite">
              <AppText size={fontSize.sm} color={colors.green800}>
                {info}
              </AppText>
            </View>
          ) : null}
          <Button label={busy ? "Aguarde…" : submitLabel} wide disabled={busy} onPress={() => void submit()} />
        </Card>
        <AppText size={fontSize.xs} color={colors.muted} lineHeight={18} style={styles.center}>
          Seus dados de saúde ficam no aparelho e na sua conta deste servidor. A IA só recebe seu contexto quando
          você autoriza e pede uma resposta.
        </AppText>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { gap: 18, paddingHorizontal: 16, width: "100%", maxWidth: 460, alignSelf: "center" },
  logo: { alignItems: "center" },
  intro: { gap: 6 },
  center: { textAlign: "center" },
  card: { gap: 16 },
  error: {
    padding: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: themeDomainTone(scheme).attention.border,
    backgroundColor: themeDomainTone(scheme).attention.bg,
  },
  errorText: { color: themeDomainTone(scheme).attention.fg },
  info: { padding: 10, borderRadius: radius.sm, backgroundColor: colors.mint50 },
}));
