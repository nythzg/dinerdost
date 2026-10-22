"use client";
import { useEffect, useId, useRef, useState } from "react";
import { request, type Row } from "@/lib/client";

export function CustomerFields({
  outletId,
  name,
  phone,
  onChange,
  labels = ["Customer name", "Customer phone"],
  known,
  required = false,
  readOnlyName = false,
}: {
  outletId?: string;
  name: string;
  phone: string;
  onChange: (name: string, phone: string) => void;
  labels?: string[];
  known?: Row[];
  required?: boolean;
  readOnlyName?: boolean;
}) {
  const [query, setQuery] = useState(""),
    [matches, setMatches] = useState<Row[]>([]),
    [active, setActive] = useState(-1);
  const listId = useId(),
    container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setMatches([]);
    setActive(-1);
    if (query.trim().length < 2) return;
    if (known !== undefined) {
      const normalized = query.toLowerCase().replace(/\s+/g, "");
      setMatches(
        known.filter(
          (i) =>
            (!readOnlyName || i.name === name) &&
            (i.name.toLowerCase().replace(/\s+/g, "") + " " + i.phone).includes(
              normalized,
            ),
        ),
      );
      return;
    }
    if (!outletId) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      void request(
        `/api/customers/search?outlet=${outletId}&q=${encodeURIComponent(query)}`,
        { signal: abort.signal },
      )
        .then((reply) => setMatches(reply.items))
        .catch(() => {});
    }, 180);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, outletId, known, readOnlyName, name]);
  const choose = (customer: Row) => {
    onChange(customer.name, customer.phone);
    setQuery("");
    setMatches([]);
  };
  const keyboard = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setMatches([]);
      return;
    }
    if (!matches.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) =>
        index < 0
          ? event.key === "ArrowDown"
            ? 0
            : matches.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : matches.length - 1)) %
            matches.length,
      );
    }
    if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      choose(matches[active]);
    }
  };
  return (
    <div
      className="customer-lookup"
      ref={container}
      onBlur={(event) => {
        if (!container.current?.contains(event.relatedTarget as Node))
          setMatches([]);
      }}
    >
      <div className="pos-customer-fields">
        <label>
          {labels[0]}
          <input
            aria-label={labels[0]}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={!!matches.length}
            aria-controls={listId}
            aria-activedescendant={
              active >= 0 ? `${listId}-${active}` : undefined
            }
            autoComplete="off"
            maxLength={120}
            required={required}
            readOnly={readOnlyName}
            value={name}
            onKeyDown={keyboard}
            onChange={(event) => {
              onChange(event.target.value, phone);
              setQuery(event.target.value);
            }}
          />
        </label>
        <label>
          {labels[1]}
          <input
            aria-label={labels[1]}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={!!matches.length}
            aria-controls={listId}
            aria-activedescendant={
              active >= 0 ? `${listId}-${active}` : undefined
            }
            type="tel"
            readOnly={readOnlyName}
            autoComplete="off"
            maxLength={25}
            required={required}
            value={phone}
            onKeyDown={keyboard}
            onChange={(event) => {
              onChange(name, event.target.value);
              setQuery(event.target.value);
            }}
          />
        </label>
      </div>
      {!!matches.length && (
        <div
          role="listbox"
          aria-label="Registered customers"
          id={listId}
          className="customer-matches"
        >
          {matches.map((customer, index) => (
            <button
              type="button"
              role="option"
              aria-selected={active === index}
              id={`${listId}-${index}`}
              key={customer.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(customer)}
            >
              <strong>{customer.name}</strong>
              <span>{customer.phone}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
