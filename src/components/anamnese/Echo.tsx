import { motion } from "motion/react";
import { HeartHandshake } from "lucide-react";

/**
 * Faixa de eco depois de uma resposta-chave (ex.: "O agente vai deixar amendoim fora das
 * sugestões"). A região aria-live fica sempre no DOM para anunciar quando o texto muda.
 */
export function Echo({
  text,
  reducedMotion,
}: {
  text: string | null;
  reducedMotion: boolean;
}) {
  return (
    <p className="anamnese-echo" aria-live="polite">
      {text && (
        <motion.span
          key={text}
          initial={reducedMotion ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.2 }}
        >
          <HeartHandshake size={16} aria-hidden="true" />
          {text}
        </motion.span>
      )}
    </p>
  );
}
