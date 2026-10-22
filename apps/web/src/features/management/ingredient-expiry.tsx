import { businessDate } from "@dinerdost/core";
import { date, type Row } from "@/lib/client";
import { T } from "@/lib/staff-language";

export function IngredientExpiry({
  ingredientId,
  batches,
}: {
  ingredientId: string;
  batches: Row[];
}) {
  const remaining = batches.filter(
    (b) => b.ingredient_id === ingredientId && Number(b.on_hand) > 0,
  );
  if (!remaining.length)
    return (
      <span className="muted">
        <T>No stock</T>
      </span>
    );
  const known = remaining
    .filter((b) => b.expires_at || b.expires_on)
    .sort((a, b) => {
      const day = (batch: Row) =>
        batch.expires_at
          ? businessDate(new Date(batch.expires_at))
          : String(batch.expires_on).slice(0, 10);
      return (
        day(a).localeCompare(day(b)) ||
        String(a.expires_at ?? "").localeCompare(String(b.expires_at ?? ""))
      );
    });
  const first = known[0],
    unknown = remaining.length - known.length;
  return (
    <div className="ingredient-expiry">
      {first ? (
        <>
          <span>
            {first.expires_at
              ? date(first.expires_at)
              : String(first.expires_on).slice(0, 10)}
          </span>
          <small>
            <T>
              {first.expires_at
                ? "Nearest batch expiry"
                : "Nearest date · time unknown"}
            </T>
          </small>
        </>
      ) : (
        <span>
          <T>Not recorded</T>
        </span>
      )}
      {unknown > 0 && first && (
        <small>
          <T>Also has unrecorded expiry</T>
        </small>
      )}
    </div>
  );
}
