import { useState } from "react";
import { ChevronRight, CircleAlert } from "lucide-react";
import { useApp } from "../../lib/context";
import {
  attentionItems,
  PROFILE_HUB_COPY,
  profileSections,
  type AttentionItem,
} from "../../lib/profile-summary";
import { GROUP_ICON } from "../anamnese/icons";
import { IconTile } from "../IconTile";
import { ProfileSectionSheet } from "./ProfileSectionSheet";

/**
 * "Precisa de atenção" (ANAMNESE-X1): alergias e restrição de líquidos como "não sei" e medição
 * antiga, em âmbar (nunca vermelho), acima do mosaico do perfil de saúde.
 */
export function ProfileAttention() {
  const { state, navigate, openAnamneseSection } = useApp();
  const profile = state.profile;
  if (!profile) return null;
  const attention = attentionItems(profile);
  if (!attention.length) return null;
  const act = (item: AttentionItem) =>
    item.target.kind === "section"
      ? openAnamneseSection(item.target.index)
      : navigate("evolucao");
  return (
    <div
      className="profile-attention"
      role="group"
      aria-labelledby="profile-attention-title"
    >
      <h3 id="profile-attention-title">
        <CircleAlert size={17} aria-hidden="true" />
        {PROFILE_HUB_COPY.attention}
      </h3>
      <ul>
        {attention.map((item) => (
          <li key={item.key}>
            <p>{item.text}</p>
            <button
              type="button"
              className="btn-secondary btn-sm"
              aria-label={item.actionAria}
              onClick={() => act(item)}
            >
              {item.actionLabel}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * As 7 etapas da anamnese em linhas de 56 px (dentro da linha "Anamnese completa" do mosaico): ícone,
 * título e até 3 destaques. Tocar abre as respostas da etapa; "Revisar tudo" abre o fluxo inteiro.
 */
export function ProfileSectionList({ id }: { id: string }) {
  const { state, navigate } = useApp();
  const [open, setOpen] = useState<number | null>(null);
  const profile = state.profile;
  if (!profile) return null;
  const cards = profileSections(profile, state.measurements);
  return (
    <div id={id} className="profile-hub-list">
      <ul className="profile-hub-grid">
        {cards.map((card) => {
          const titleId = `profile-hub-${card.index}-title`;
          const detailsId = `profile-hub-${card.index}-details`;
          return (
            <li key={card.index}>
              <button
                type="button"
                className="profile-hub-card"
                aria-haspopup="dialog"
                aria-labelledby={titleId}
                aria-describedby={detailsId}
                onClick={() => setOpen(card.index)}
              >
                <IconTile tone={card.tone} size="md" icon={GROUP_ICON[card.icon]} />
                <span className="profile-hub-text">
                  <span id={titleId} className="profile-hub-title">
                    {card.title}
                  </span>
                  <span id={detailsId} className="profile-hub-highlights">
                    {card.highlights.map((text) => (
                      <span key={text}>{text}</span>
                    ))}
                  </span>
                </span>
                <ChevronRight
                  className="profile-hub-chevron"
                  size={18}
                  aria-hidden="true"
                />
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="link-btn profile-hub-review"
        onClick={() => navigate("anamnese")}
      >
        {PROFILE_HUB_COPY.reviewAll}
      </button>
      {open !== null && (
        <ProfileSectionSheet index={open} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}
