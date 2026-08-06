import { useEffect, useState } from "react";
import type { MaintenancePhoto } from "../types/maintenance";
import { useLanguage } from "../providers/language.context";

function photoSource(photo: MaintenancePhoto): string | null {
  if (photo.url) return photo.url;
  if (photo.localReference?.startsWith("/") || photo.localReference?.startsWith("http") || photo.localReference?.startsWith("data:") || photo.localReference?.startsWith("blob:")) {
    return photo.localReference;
  }
  return null;
}

function photoLabel(photo: MaintenancePhoto, fallback: string): string {
  return photo.caption ?? photo.localReference ?? photo.url ?? fallback;
}

export function MaintenancePhotoGallery({ photos }: { photos: MaintenancePhoto[] }) {
  const [preview, setPreview] = useState<MaintenancePhoto | null>(null);
  const { translate } = useLanguage();

  useEffect(() => {
    if (!preview) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [preview]);

  if (photos.length === 0) {
    return <p className="maintenance-muted">{translate("noPhotosAttached")}</p>;
  }

  return (
    <>
      <div className="maintenance-photo-grid">
        {photos.map((photo) => {
          const source = photoSource(photo);
          return (
            <button className="maintenance-photo-tile" key={photo.id} onClick={() => setPreview(photo)} type="button">
              {source ? <img alt="" src={source} /> : <span aria-hidden="true" />}
              <strong>{photoLabel(photo, translate("photos"))}</strong>
            </button>
          );
        })}
      </div>

      {preview && (
        <div className="maintenance-photo-preview" role="dialog" aria-modal="true" aria-label={photoLabel(preview, translate("photos"))}>
          <button className="maintenance-photo-preview__scrim" onClick={() => setPreview(null)} type="button" aria-label={translate("dismissPhotoPreview")} />
          <div className="maintenance-photo-preview__frame">
            {photoSource(preview) ? <img alt={photoLabel(preview, translate("photos"))} src={photoSource(preview) ?? ""} /> : null}
            <p>{photoLabel(preview, translate("photos"))}</p>
          </div>
        </div>
      )}
    </>
  );
}
