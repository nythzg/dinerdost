"use client";
import { T, useStaffTranslation } from "@/lib/staff-language";
import {interfaceIconShapes} from './interface-icons';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { label } from "@/lib/client";
import {confirmDiscardChanges} from "@/lib/unsaved-changes";
import {PasswordInput} from "./password-input";
const shapes: Record<string, ReactNode> = {
 phone:<path d="M7 3H3v4c0 8 6 14 14 14h4v-4l-5-2-2 2a13 13 0 0 1-7-7l2-2-2-5Z"/>,
 support:<><path d="M4 13v-2a8 8 0 0 1 16 0v6a4 4 0 0 1-4 4h-3"/><rect x="2" y="10" width="5" height="8" rx="2"/><rect x="17" y="10" width="5" height="8" rx="2"/><path d="M10 21h3"/></>,
 mail:<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/></>,
 chat:<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>,
 send:<><path d="m21 3-7 18-4-7-7-4 18-7ZM10 14 21 3"/></>,
 external:<><path d="M14 3h7v7m0-7L10 14M10 3H4v17h17v-6"/></>,
 back:interfaceIconShapes.back,
 filter:interfaceIconShapes.filter,
 sort:interfaceIconShapes.sort,
 'table-four':interfaceIconShapes['table-four'],
 details:interfaceIconShapes.details,
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  empty: (
    <>
      <path d="M4 5h16v14H4zM4 13h5l2 3h2l2-3h5" />
    </>
  ),
  navigation: interfaceIconShapes.navigation,
  dish: (
    <>
      <circle cx="13" cy="12" r="7" />
      <path d="M3 3v5m3-5v5M3 6h3M4.5 8v13" />
    </>
  ),
  gift: <><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13M12 8C4 9 4 1 8 3l4 5Zm0 0c8 1 8-7 4-5l-4 5Z"/></>,
  dessert: <><path d="M5 12h14v8H5zM4 20h16M5 12c0-5 14-5 14 0M12 8V5"/><circle cx="12" cy="3" r="2"/></>,
  cup: (
    <>
      <path d="M4 6h13v10a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V6ZM17 8h2a3 3 0 0 1 0 6h-2M7 2v1M12 2v1" />
    </>
  ),
  overview: (
    <>
      <path d="M4 19h16M5 15l4-5 4 3 6-8" />
      <path d="M15 5h4v4" />
    </>
  ),
  floor: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  orders: (
    <>
      <path d="M6 5h12l2 16H4L6 5Z" />
      <path d="M9 8V5a3 3 0 0 1 6 0v3" />
    </>
  ),
  pos: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M9 21h6M12 17v4" />
    </>
  ),
  kitchen: (
    <>
      <path d="M7 15c-5 0-5-8 0-8a5 5 0 0 1 10 0c5 0 5 8 0 8v6H7v-6Z" />
      <path d="M7 17h10" />
    </>
  ),
  payments: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M7 15h3" />
    </>
  ),
  menu: (
    <>
      <path d="M5 4h14M5 12h14M5 20h14M9 2v4M16 10v4M10 18v4" />
    </>
  ),
  inventory: (
    <>
      <path d="m3 7 9-4 9 4v11l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v11M7 5l9 4" />
    </>
  ),
  customers: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5" />
    </>
  ),
  outlets: (
    <>
      <path d="M4 21V3h12v18M16 10h4v11M8 7h4M8 11h4M8 15h4M3 21h18" />
    </>
  ),
  audit: (
    <>
      <path d="m12 3 9 4v6c0 4-5 7-9 9-4-2-9-5-9-9V7l9-4Z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="m9 3 6 0 1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Z" />
    </>
  ),
  qr: (
    <>
      <path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h3v3h3v3h-6zM12 3v3M3 12h3M12 12h5M12 18v3M21 12v3" />
    </>
  ),
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/></>,
  unlock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0M12 14v3"/></>,
  search: (
    <>
      <circle cx="10" cy="10" r="6" />
      <path d="m15 15 5 5" />
    </>
  ),
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  exchange: <path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4" />,
  split: <path d="M12 21v-7c0-4-6-4-6-8V3m0 0L3 6m3-3 3 3M12 14c0-4 6-4 6-8V3m0 0-3 3m3-3 3 3" />,
  edit: <path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14v6Z" />,
  stairs: <path d="M3 21h5v-5h5v-5h5V6h3M3 3h18" />,
  trash: <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  logout: (
    <>
      <path d="M9 3H4v18h5M9 12h12m-5-5 5 5-5 5" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  leaf: (
    <>
      <path d="M20 3C7 1 2 7 5 15c7 6 17 1 15-12ZM3 21 16 8" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M6 7a7 7 0 0 1 13 2M18 17A7 7 0 0 1 5 15" />
    </>
  ),
  print: (
    <>
      <path d="M7 8V3h10v5M7 17H3V8h18v9h-4M7 14h10v7H7z" />
    </>
  ),
};
export function Icon({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  const original=(name==='report-activity'?shapes.overview:shapes[name])??shapes.orders;
  const artwork=name==='audit'?undefined:name==='report-activity'?interfaceIconShapes.audit:interfaceIconShapes[name];
  return (
    <svg
      className={"icon " + className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {artwork?<><g className="working-preview-icon-art">{artwork}</g><g className="working-original-icon-art">{original}</g></>:original}
    </svg>
  );
}
export function Logo() {
  return (
    <span className="logo">
      <span className="logomark">d</span>
      <span>
        <b>Diner</b> Dost
      </span>
    </span>
  );
}
export function Badge({ value }: { value: unknown }) {
  return (
    <span className={"badge " + String(value ?? "").toLowerCase()}>
      <T>{label(value) || "—"}</T>
    </span>
  );
}
export function Empty({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Icon name="empty" />
      <p>
        <T>{children}</T>
      </p>
      {action}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  className,
}: {
  title: string;
  className?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null),
    titleId = useId();
  const close = useRef(onClose);
  close.current = onClose;
  const requestClose = () => {
    if (ref.current && confirmDiscardChanges(ref.current)) close.current();
  };
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    const node = ref.current!;
    const previousOverflow = document.body.style.overflow;
    const controls = () => Array.from(node.querySelectorAll<HTMLElement>(
      'button,a[href],input,select,textarea,[tabindex]'
    )).filter(element => !element.matches(':disabled,[type="hidden"],[tabindex="-1"]') &&
      !element.closest('[inert]') && element.getClientRects().length > 0);
    const available = controls();
    const initial = available.find(element => element.hasAttribute('data-autofocus')) ??
      available.find(element => element.matches('input,select,textarea')) ?? available[0] ?? node;
    initial.focus();
    function key(event: KeyboardEvent) {
      if (document.querySelector('.swal2-container') ||
          Array.from(document.querySelectorAll('[aria-modal="true"]')).at(-1) !== node) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (confirmDiscardChanges(node)) close.current();
      }
      if (event.key === 'Tab') {
        const available = controls(), first = available[0], last = available.at(-1);
        if (!first) {event.preventDefault(); node.focus();}
        else if (!node.contains(document.activeElement) || document.activeElement === node) {
          event.preventDefault(); (event.shiftKey ? last! : first).focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last!.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
    }
    document.addEventListener('keydown', key);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', key);
      document.body.style.overflow = previousOverflow;
      if (prior?.isConnected) prior.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        className={"modal"+(className?" "+className:"")}
        ref={ref}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby={titleId}
      >
        <div className="modal-header">
          <h2 id={titleId}>
            <T>{title}</T>
          </h2>
          <button
            className="icon-button"
            type="button"
            aria-label="Close dialog"
            onClick={requestClose}
          >
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export type Field = {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  value?: any;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number | string;
  placeholder?: string;
  help?: string;
  autoComplete?: string;
  preserveBlank?: boolean;
};
export function Form({
  fields,
  onSubmit,
  submit = "Save",
  busy = false,
  children,
  before,
  onCancel,
}: {
  fields: Field[];
  onSubmit: (data: Record<string, any>) => void | Promise<void>;
  submit?: string;
  busy?: boolean;
  children?: ReactNode;
  before?: ReactNode;
  onCancel?: () => void;
}) {
  const formId = useId();
  const t = useStaffTranslation();
  function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data: Record<string, any> = {};
    for (const field of fields) {
      const raw = fd.get(field.name);
      data[field.name] =
        field.type === "checkbox"
          ? raw === "on"
          : field.type === "number"
            ? field.preserveBlank && raw === ""
              ? ""
              : Number(raw)
            : String(raw ?? "");
    }
    void onSubmit(data);
  }
  return (
    <form className={"form"+(onCancel?" popup-form"+(fields.length<=4?" popup-form-compact":""):"")} onSubmit={send}>
      {before}
      {fields.map((field) => (
        <div
          className={
            "field " + (field.type === "checkbox" ? "checkbox-field" : "")
          }
          key={field.name}
        >
          <label htmlFor={formId + field.name}>
            <T>{field.label}</T>
          </label>
          {field.type === "select" ? (
            <select
              id={formId + field.name}
              name={field.name}
              required={field.required ?? true}
              defaultValue={field.value ?? ""}
            >
              {!field.value && (
                <option value="">
                  <T>Choose…</T>
                </option>
              )}
              {field.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : field.type === "password" ? (
            <PasswordInput label={t(field.label).toLowerCase()} id={formId+field.name} name={field.name} defaultValue={field.value??""} required={field.required??true} min={field.min} max={field.max} step={field.step} placeholder={field.placeholder?t(field.placeholder):undefined} autoComplete={field.autoComplete??"new-password"} maxLength={128}/>
          ) : field.type === "textarea" ? (
            <textarea
              id={formId + field.name}
              name={field.name}
              defaultValue={field.value ?? ""}
              required={field.required ?? true}
              maxLength={2000}
            />
          ) : (
            <input
              id={formId + field.name}
              name={field.name}
              type={field.type ?? "text"}
              defaultValue={
                field.type === "checkbox" ? undefined : (field.value ?? "")
              }
              defaultChecked={
                field.type === "checkbox" ? !!field.value : undefined
              }
              required={
                field.type === "checkbox" ? false : (field.required ?? true)
              }
              min={field.min}
              max={field.max}
              step={field.step}
              placeholder={field.placeholder ? t(field.placeholder) : undefined}
              autoComplete={
                field.autoComplete ??
                (field.type === "password" ? "new-password" : undefined)
              }
              maxLength={field.type === "password" ? 128 : 500}
            />
          )}{" "}
          {field.help && (
            <small>
              <T>{field.help}</T>
            </small>
          )}
        </div>
      ))}
      {children}
      {onCancel?<div className="popup-form-actions"><button className="button" disabled={busy} type="button" onClick={onCancel}><T>Cancel</T></button><button className="button primary" disabled={busy} type="submit"><T>{busy?"Saving…":submit}</T></button></div>:<button className="button primary" disabled={busy} type="submit">
        <T>{busy ? "Saving…" : submit}</T>
      </button>}
    </form>
  );
}
export function DataTable({
  headers,
  rows,
  empty = "Nothing here yet.",
}: {
  headers: string[];
  rows: ReactNode[][];
  empty?: string;
}) {
  const table = useRef<HTMLTableElement>(null);
  const [visibleHeight, setVisibleHeight] = useState<number>();
  const [page,setPage] = useState(0);
  const pages = Math.ceil(rows.length / 50), currentPage = Math.min(page, Math.max(0,pages - 1));
  const visibleRows = rows.slice(currentPage * 50, (currentPage + 1) * 50);
  useEffect(() => {setPage(0);}, [rows.length]);

  useEffect(() => {
    const node = table.current;
    if (!node || rows.length <= 4) return;
    const measure = () => {
      const fourth = node.tBodies[0]?.rows[3];
      if (fourth)
        setVisibleHeight(
          Math.ceil(
            fourth.getBoundingClientRect().bottom -
              node.getBoundingClientRect().top,
          ),
        );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    for (const row of Array.from(node.tBodies[0].rows).slice(0, 4))
      observer.observe(row);
    return () => observer.disconnect();
  }, [rows, currentPage]);
  if (!rows.length)
    return (
      <div className="data-table-empty">
        <Empty>
          <T>{empty}</T>
        </Empty>
      </div>
    );
  return (
    <>
    <div
      className="table-scroll four-row-table"
      style={rows.length > 4 ? { maxHeight: visibleHeight ?? 360 } : undefined}
      tabIndex={rows.length > 4 ? 0 : undefined}
      role={rows.length > 4 ? "region" : undefined}
      aria-label={rows.length > 4 ? "Scrollable records" : undefined}
    >
      <table ref={table}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i}>
                <T>{h}</T>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {pages > 1 && <nav className="data-table-pages inline-actions" aria-label="Table pages">
      <button type="button" className="button" disabled={currentPage === 0} onClick={() => {setPage(currentPage - 1); table.current?.parentElement?.scrollTo(0,0);}}>Previous page</button>
      <span role="status">{currentPage * 50 + 1}–{Math.min((currentPage + 1) * 50,rows.length)} of {rows.length}</span>
      <button type="button" className="button" disabled={currentPage + 1 >= pages} onClick={() => {setPage(currentPage + 1); table.current?.parentElement?.scrollTo(0,0);}}>Next page</button>
    </nav>}
    </>
  );
}
