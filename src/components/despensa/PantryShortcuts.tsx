import type { ChangeEvent } from "react";
import { Camera, ShoppingBasket } from "lucide-react";
import { plural } from "../../lib/format";

const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

/**
 * Dois atalhos logo abaixo do "Use primeiro" (conceito 06): a lista de compras (numa folha, com o
 * que falta comprar no selo) e "Adicionar foto" (abre a galeria; a foto cai na folha de adicionar).
 */
export function PantryShortcuts({
  pending,
  isPhotoDisabled,
  onShopping,
  onPhoto,
}: {
  /** Itens da lista ainda não comprados. */
  pending: number;
  isPhotoDisabled: boolean;
  onShopping: () => void;
  onPhoto: (file: File) => void;
}) {
  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onPhoto(file);
  };
  return (
    <div className="pantry-shortcuts">
      <button type="button" className="pantry-shortcut" onClick={onShopping}>
        <ShoppingBasket size={20} aria-hidden="true" />
        <span className="pantry-shortcut-text">Lista de compras</span>
        {pending > 0 && (
          <>
            <span className="pantry-shortcut-badge" aria-hidden="true">
              {pending}
            </span>
            <span className="sr-only">{`, ${plural(pending, "item a comprar", "itens a comprar")}`}</span>
          </>
        )}
      </button>
      <label className="pantry-shortcut is-photo">
        <Camera size={20} aria-hidden="true" />
        <span className="pantry-shortcut-text">Adicionar foto</span>
        <input
          type="file"
          aria-label="Adicionar foto"
          accept={PHOTO_ACCEPT}
          disabled={isPhotoDisabled}
          onChange={pick}
        />
      </label>
    </div>
  );
}
