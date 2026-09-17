import type { MediaAsset } from "@meditaur/domain";
import { Button } from "@meditaur/ui";

/**
 * Audio files have no editor — a file is its own record — so the card carries
 * one action: `Delete`, armed on the first press like every other destructive
 * button in the library.
 */
export function AudioList({
  mediaAssets,
  armedId,
  deleteNotice = null,
  onDelete,
}: {
  mediaAssets: MediaAsset[];
  /** The card whose delete is armed, if any. */
  armedId: string | null;
  /** What the armed card's delete would take with it. */
  deleteNotice?: string | null;
  onDelete: (asset: MediaAsset) => void;
}) {
  return (
    <section className="flex flex-col gap-4">
      {(["ambient", "alarm"] as const).map((kind) => (
        <div key={kind} className="flex flex-col gap-3">
          <h2 className="text-xl font-medium capitalize">{kind}</h2>
          <div className="flex flex-col gap-2">
            {mediaAssets
              .filter((asset) => asset.kind === kind)
              .map((asset) => (
                <div
                  key={asset.id}
                  className="flex flex-col gap-3 rounded-2xl border border-line bg-surface px-4 py-3"
                >
                  <div>
                    <p className="text-lg text-text">{asset.name}</p>
                    <p className="text-sm text-muted">
                      {Math.max(1, Math.round(asset.durationMs / 1000))}s
                    </p>
                    {armedId === asset.id && deleteNotice ? (
                      <p className="text-sm text-destructive">{deleteNotice}</p>
                    ) : null}
                  </div>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      tier="destructive"
                      armed={armedId === asset.id}
                      aria-label={
                        armedId === asset.id ? `Delete ${asset.name}?` : `Delete ${asset.name}`
                      }
                      onClick={() => onDelete(asset)}
                    >
                      {armedId === asset.id ? `Delete ${asset.name}?` : "Delete"}
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
    </section>
  );
}
