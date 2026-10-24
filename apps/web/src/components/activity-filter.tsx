"use client";
import { useEffect, useRef, useState } from "react";
import { businessDate, paymentMethods, paymentMethodNames, type PaymentMethod } from "@dinerdost/core";
import {Icon} from './ui';
import { request, type Row } from "@/lib/client";
import { useDesk } from "@/features/workspace/context";
export function useActivity(kind: string, enabled = true, status?: string) {
  const { data } = useDesk(),
    [filter, setFilter] = useState<Record<string, string>>({}),
    [offset, setOffset] = useState(0),
    [result, setResult] = useState<{
      key: string;
      items: Row[];
      hasMore: boolean;
    }>({ key: "", items: [], hasMore: false }),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const params = new URLSearchParams({
      outletId: data.outletId,
      offset: String(offset),
      ...filter,
      ...(status ? { status } : {}),
    }),
    key = kind + "?" + params.toString();
  useEffect(() => setOffset(0), [status, data.outletId]);
  useEffect(() => {
    setFilter({});
    setOffset(0);
  }, [kind, data.outletId]);
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    setLoading(true);
    void request("/api/activity/" + key, { signal: abort.signal })
      .then((reply) => {
        setResult({ key, items: reply.items, hasMore: reply.hasMore });
        setError("");
      })
      .catch((error) => {
        if (error.name !== "AbortError") setError(error.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [key, data, enabled]);
  const update = (next: Record<string, string>) => {
    setOffset(0);
    setFilter(
      Object.fromEntries(Object.entries(next).filter(([, v]) => v !== "")),
    );
  };
  return {
    items: result.key === key ? result.items : [],
    controls: <ActivityControls key={kind+data.outletId} kind={kind} value={filter} onChange={update}/>,
    pagination: (
      <div className="activity-pagination">
        <button
          className="button small"
          disabled={offset === 0 || loading}
          onClick={() => setOffset((value) => Math.max(0, value - 100))}
        >
          Previous
        </button>
        <span>
          {offset + 1}–{offset + (result.key === key ? result.items.length : 0)}
        </span>
        <button
          className="button small"
          disabled={result.key !== key || !result.hasMore || loading}
          onClick={() => setOffset((value) => value + 100)}
        >
          Next
        </button>
        {loading && <span role="status">Loading…</span>}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
    ),
  };
}
function ActivityFilter({
  value,
  onChange,
  amount,
  quantity,
  statusOptions,
  payment = false,
}: {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  amount: boolean;
  quantity: boolean;
  statusOptions: string[];
  payment?: boolean;
}) {
  const [period, setPeriod] = useState("all"),
    [draft, setDraft] = useState(value);
  function changePeriod(period: string) {
    setPeriod(period);
    const today = businessDate(),
      date = new Date(today + "T00:00:00Z");
    let from = today,
      to = today;
    if (period === "week") {
      date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
      from = date.toISOString().slice(0, 10);
      date.setUTCDate(date.getUTCDate() + 6);
      to = date.toISOString().slice(0, 10);
    }
    if (period === "month") {
      from = today.slice(0, 7) + "-01";
      date.setUTCMonth(date.getUTCMonth() + 1, 0);
      to = date.toISOString().slice(0, 10);
    }
    const next = {
      ...draft,
      from: period === "all" ? "" : from,
      to: period === "all" ? "" : to,
    };
    setDraft(next);
  }
  const field = (name: string, label: string, type = "number", scale = 1) => (
    <label>
      {label}
      <input
        aria-label={label}
        type={type}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? "any" : undefined}
        value={
          draft[name] === undefined || draft[name] === ""
            ? ""
            : type === "number"
              ? Number(draft[name]) / scale
              : draft[name]
        }
        onChange={(event) =>
          setDraft({
            ...draft,
            [name]:
              event.target.value === ""
                ? ""
                : type === "number"
                  ? String(Math.round(Number(event.target.value) * scale))
                  : event.target.value,
          })
        }
      />
    </label>
  );
  return (
    <form
      className="activity-filters"
      onSubmit={(event) => {
        event.preventDefault();
        onChange(draft);
      }}
    >
      <label>
        Period
        <select
          aria-label="Period"
          value={period}
          onChange={(event) => changePeriod(event.target.value)}
        >
          <option value="all">All dates</option>
          <option value="day">Daily</option>
          <option value="week">Weekly</option>
          <option value="month">Monthly</option>
          <option value="custom">Custom dates</option>
        </select>
      </label>
      {period === "custom" && (
        <>
          {field("from", "From date", "date")}
          {field("to", "To date", "date")}
        </>
      )}
      {amount && (
        <>
          {field("minAmount", "Min amount (₹)", "number", 100)}
          {field("maxAmount", "Max amount (₹)", "number", 100)}
        </>
      )}
      {quantity && (
        <>
          {field("minQuantity", "Min quantity", "number", 1000)}
          {field("maxQuantity", "Max quantity", "number", 1000)}
        </>
      )}
      <label>
        Search
        <input
          aria-label="Filter search"
          placeholder={payment?'Order no. or reference':undefined}
          value={draft.search ?? ""}
          onChange={(event) =>
            setDraft({ ...draft, search: event.target.value })
          }
        />
      </label>
      <label>
        {payment?'Payment method':'Status'}
        <select
          aria-label={payment?'Filter payment method':'Filter status'}
          value={draft.status ?? ""}
          onChange={(event) =>
            setDraft({ ...draft, status: event.target.value })
          }
        >
          <option value="">All</option>
          {statusOptions.map((value) => (
            <option key={value} value={value}>
              {payment?paymentMethodNames[value as PaymentMethod]:value.replaceAll("_", " ").toLowerCase()}
            </option>
          ))}
        </select>
      </label>
      {payment&&<label>Payment state<select aria-label="Filter payment state" value={draft.paymentState??''} onChange={event=>setDraft({...draft,paymentState:event.target.value})}><option value="">All states</option>{[['VERIFIED','Received'],['AWAITING_VERIFICATION','Awaiting verification'],['UNKNOWN','Unknown'],['INITIATED','Initiated'],['REJECTED','Rejected'],['FAILED','Failed']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>}
      <button className={payment?'button primary':'button'} type="submit">
        Apply
      </button>
      <button
        className="text-button"
        type="button"
        onClick={() => {
          setPeriod("all");
          setDraft({});
          onChange({});
        }}
      >
        Reset
      </button>
    </form>
  );
}

function ActivityControls({kind,value,onChange}:{kind:string;value:Record<string,string>;onChange:(next:Record<string,string>)=>void}){
 const payment=kind==='payments',amount=!['checklists','kot'].includes(kind),quantity=['invoices','movements','purchases','kot'].includes(kind);
 const noun=kind==='kot'?'KOT':kind==='movements'?'stock movements':kind,sortLabel=kind==='kot'?'KOT':payment?'Payment':kind[0].toUpperCase()+kind.slice(1);
 const statusOptions=payment?[...paymentMethods]:kind==='kot'?['RELEASED','PREPARING','READY','SERVED','CANCELLED']:kind==='invoices'?['FINAL_TAX_INVOICE','PROVISIONAL_BILL']:kind==='movements'?['RECEIPT','RECIPE_CONSUMPTION','WASTAGE']:['DRAFT','APPROVED','COMPLETED','CANCELLED'];
 const properties=payment?[['DATE','Created date'],['AMOUNT','Amount'],['ORDER','Order number'],['METHOD','Payment method'],['STATE','Payment state'],['REFERENCE','Reference']]:[['DATE',kind==='checklists'?'Due date':kind==='expenses'?'Expense date':'Created date'],...(amount?[['AMOUNT','Amount']]:[]),...(quantity?[['QUANTITY','Quantity']]:[]),['STATUS',kind==='invoices'?'Document type':kind==='movements'?'Movement type':'Status'],...(kind==='kot'?[['NUMBER','Order number'],['TITLE','Station']]:kind==='invoices'?[['NUMBER','Document number'],['CUSTOMER','Customer']]:kind==='movements'?[['ITEM','Ingredient']]:[['TITLE','Title']]),...(['purchases','expenses'].includes(kind)?[['REFERENCE','Reference']]:[])];
 const root=useRef<HTMLDivElement>(null),[sort,setSort]=useState(value.sort??'DATE_DESC');
 const [property,direction]=sort.split('_'),numeric=['AMOUNT','ORDER','QUANTITY'].includes(property);
 const count=Object.entries(value).filter(([key,value])=>key!=='sort'&&value!=='').length;
 const close=(restore=false)=>root.current?.querySelectorAll('details[open]').forEach(details=>{details.removeAttribute('open');if(restore)details.querySelector('summary')?.focus()});
 const fit=()=>{const toolbar=root.current?.closest('.payment-page-toolbar,.activity-control-bar')?.getBoundingClientRect();if(!toolbar)return;const top=Math.max(8,Math.min(toolbar.bottom-2,innerHeight-320));root.current?.querySelectorAll<HTMLElement>('details[open] .payment-controls-dropdown').forEach(popup=>{const anchor=popup.parentElement?.querySelector('summary')?.getBoundingClientRect();popup.style.top=top-toolbar.top+'px';popup.style.maxHeight=Math.max(0,innerHeight-top-14)+'px';if(anchor){popup.style.left=Math.max(8,Math.min(anchor.right-popup.offsetWidth,innerWidth-popup.offsetWidth-40))-toolbar.left+'px';popup.style.right='auto'}})};
 useEffect(()=>{
  const outside=(event:PointerEvent)=>{if(root.current&&!root.current.contains(event.target as Node))close()};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){const open=root.current?.querySelector('details[open]');if(open){open.removeAttribute('open');open.querySelector('summary')?.focus()}}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);window.addEventListener('resize',fit);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);window.removeEventListener('resize',fit)};
 },[]);
 const toggle=(event:React.SyntheticEvent<HTMLDetailsElement>)=>{if(event.currentTarget.open){root.current?.querySelectorAll('details[open]').forEach(other=>{if(other!==event.currentTarget)other.removeAttribute('open')});fit()}};
 const controls=<div className="payment-history-controls" ref={root}>
  <details onToggle={toggle}><summary aria-label={'Filter '+noun} title={'Filter '+noun}><Icon name="filter"/>{count>0&&<b>{count}</b>}</summary><div className="payment-controls-dropdown payment-filter-dropdown"><h3>Filter {noun}</h3><ActivityFilter value={value} onChange={next=>{onChange({...next,sort:value.sort??'DATE_DESC'});close(true)}} amount={amount} quantity={quantity} statusOptions={statusOptions} payment={payment}/></div></details>
  <details onToggle={toggle}><summary aria-label={'Sort '+noun} title={'Sort '+noun}><Icon name="sort"/>{value.sort&&value.sort!=='DATE_DESC'&&<i aria-label="Custom sorting applied"/>}</summary><form className="payment-controls-dropdown payment-sort-dropdown" onSubmit={event=>{event.preventDefault();onChange({...value,sort});close(true)}}><h3>Sort {noun}</h3><label>Sort by<select aria-label={sortLabel+' sort property'} value={property} onChange={event=>setSort(event.target.value+'_'+direction)}>{properties.map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label><label>Direction<select aria-label={sortLabel+' sort direction'} value={direction} onChange={event=>setSort(property+'_'+event.target.value)}><option value="DESC">{property==='DATE'?'Newest first':numeric?'Highest first':'Z–A'}</option><option value="ASC">{property==='DATE'?'Oldest first':numeric?'Lowest first':'A–Z'}</option></select></label><div className="payment-sort-actions"><button className="button" type="button" onClick={()=>{setSort('DATE_DESC');onChange({...value,sort:'DATE_DESC'});close(true)}}>Reset</button><button className="button primary">Apply sorting</button></div></form></details>
 </div>;
 return payment?controls:<div className="activity-control-bar">{controls}</div>;
}
