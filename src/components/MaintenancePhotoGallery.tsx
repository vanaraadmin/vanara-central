import { useEffect, useState } from "react";
import type { MaintenancePhoto } from "../types/maintenance";

function photoSource(photo: MaintenancePhoto): string | null {
  if (photo.url) return photo.url;
  if (photo.localReference?.startsWith("/") || photo.localReference?.startsWith("http") || photo.localReference?.startsWith("data:") || photo.localReference?.startsWith("blob:")) {
    return photo.localReference;
  }
  return null;
}

function photoLabel(photo: MaintenancePhoto): string {
  return photo.caption ?? photo.localReference ?? photo.url ?? "Maintenance photo";
}

export function MaintenancePhotoGallery({ photos }: { photos: MaintenancePhoto[] }) {
  const [preview, setPreview] = useState<MaintenancePhoto | null>(null);

  useEffect(() => {
    if (!preview) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [preview]);

  if (photos.length === 0) {
    return <p className="maintenance-muted">No photos attached.</p>;
  }

  return (
    <>
      <div className="maintenance-photo-grid">
        {photos.map((photo) => {
          const source = photoSource(photo);
          return (
            <button className="maintenance-photo-tile" key={photo.id} onClick={() => setPreview(photo)} type="button">
              {source ? <img alt="" src={source} /> : <span aria-hidden="true" />}
              <strong>{photoLabel(photo)}</strong>
            </button>
          );
        })}
      </div>

      {preview && (
        <div className="maintenance-photo-preview" role="dialog" aria-modal="true" aria-label={photoLabel(preview)}>
          <button className="maintenance-photo-preview__scrim" onClick={() => setPreview(null)} type="button" aria-label="Dismiss photo preview" />
          <div className="maintenance-photo-preview__frame">
            {photoSource(preview) ? <img alt={photoLabel(preview)} src={photoSource(preview) ?? ""} /> : null}
            <p>{photoLabel(preview)}</p>
          </div>
        </div>
      )}
    </>
  );
}
