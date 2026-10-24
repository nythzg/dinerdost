"use client";
import { T, useStaffTranslation } from "@/lib/staff-language";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./ui";

export type PageSearchItem = { id: string; name: string; icon: string };

export function PageSearch({
  items,
  close,
  navigate,
}: {
  items: PageSearchItem[];
  close: () => void;
  navigate: (path: string) => void;
}) {
  const t = useStaffTranslation();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const listId = useId();
  const activeRef = useRef<HTMLButtonElement>(null);
  const results = items
    .filter((item) =>
      (item.name + " " + t(item.name))
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    )
    .slice(0, 8);
  const choose = (item: PageSearchItem) => {
    close();
    navigate("/app/" + item.id);
  };
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  return (
      <div className="page-search inline-search-content" role="region" aria-label="Page search" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close()}}}>
        <label className="page-search-input">
          <Icon name="search" />
          <input
            autoFocus
            aria-label="Search pages"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              results[selected]
                ? listId + "-" + results[selected].id
                : undefined
            }
            value={query}
            placeholder={t("Find a page")}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setSelected((current) =>
                  results.length
                    ? (current +
                        (e.key === "ArrowDown" ? 1 : -1) +
                        results.length) %
                      results.length
                    : 0,
                );
              }
              if (e.key === "Enter" && results[selected]) {
                e.preventDefault();
                choose(results[selected]);
              }
            }}
          />
          <button type="button" className="icon-button" aria-label="Close page search" onClick={close}><Icon name="close"/></button>
        </label>
        <div
          className="page-search-results"
          role="listbox"
          id={listId}
          aria-label="Pages"
        >
          {results.map((item, index) => (
            <button
              key={item.id}
              id={listId + "-" + item.id}
              ref={index === selected ? activeRef : undefined}
              role="option"
              aria-selected={index === selected}
              className={index === selected ? "is-active" : ""}
              onMouseEnter={() => setSelected(index)}
              onClick={() => choose(item)}
            >
              <Icon name={item.icon} />
              <span>
                <T>{item.name}</T>
              </span>
            </button>
          ))}
          {!results.length && (
            <p className="page-search-empty">No pages found</p>
          )}
        </div>
      </div>
  );
}
