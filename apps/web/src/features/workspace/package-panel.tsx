"use client";
import { useDesk } from "./context";
export function PackageButton() {
  const { data, modal } = useDesk();
  return (
    <button
      className="button small package-trigger"
      aria-label="View packages"
      onClick={() =>
        modal(
          "Packages",
          <div className="package-panel">
            {["Trial", "Bronze", "Silver", "Gold", "Platinum"].map((name) => (
              <article key={name}>
                <h3>{name}</h3>
                <span>Details pending</span>
                <button className="button small" disabled>
                  Not configured
                </button>
              </article>
            ))}
            <small>
              Prices, trial duration and features will be configured later.
            </small>
          </div>,
        )
      }
    >
      {data.restaurant.is_demo ? "Demo" : "Packages"}
    </button>
  );
}
