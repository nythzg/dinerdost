"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {confirmDiscardChanges} from './unsaved-changes';

export function queryHref(values: Record<string,string>, defaults: Record<string,string>) {
  const url = new URL(location.href);
  for (const [key,value] of Object.entries(values)) {
    if (!value || value === defaults[key]) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  return url.pathname + url.search + url.hash;
}

// Native history keeps these client-only views bookmarkable without refetching the page.
export function useUrlState<T extends Record<string,string>>(defaults: T) {
  const [state,setState] = useState<T>(defaults);
  const read = useCallback(() => {
    const params = new URLSearchParams(location.search);
    return Object.fromEntries(Object.entries(defaults).map(([key,value]) =>
      [key,params.get(key)?.slice(0,300) ?? value])) as T;
  }, [defaults]);
  const prior = useRef<{url:string;index:number}>(null);
  const restoring = useRef(false);
  useEffect(() => {
    const index = Number(history.state?.ddViewIndex ?? 0);
    history.replaceState({...history.state,ddViewIndex:index}, '', location.href);
    prior.current = {url:location.href,index};
    setState(read());
    const pop = () => {
      const previous = prior.current, index = Number(history.state?.ddViewIndex ?? 0);
      if (restoring.current) {restoring.current = false; return;}
      if (previous && !confirmDiscardChanges()) {
        const delta = previous.index - index;
        if (delta) {restoring.current = true; history.go(delta);}
        else history.replaceState({...history.state,ddViewIndex:previous.index}, '', previous.url);
        return;
      }
      prior.current = {url:location.href,index};
      setState(read());
    };
    const sync = () => {prior.current = {url:location.href,index:Number(history.state?.ddViewIndex ?? 0)}; setState(read());};
    window.addEventListener('popstate', pop);
    window.addEventListener('dd-url-change', sync);
    return () => {window.removeEventListener('popstate', pop);window.removeEventListener('dd-url-change', sync);};
  }, [read]);
  const update = useCallback((patch: Partial<T>, replace = false) => {
    const href = queryHref(patch as Record<string,string>, defaults);
    if (href === location.pathname + location.search + location.hash) return true;
    if (!confirmDiscardChanges()) return false;
    const index = Number(history.state?.ddViewIndex ?? 0) + (replace ? 0 : 1);
    history[replace ? 'replaceState' : 'pushState']({...history.state,ddViewIndex:index}, '', href);
    prior.current = {url:location.href,index};
    setState(read());
    window.dispatchEvent(new Event('dd-url-change'));
    return true;
  }, [defaults,read]);
  return [state,update] as const;
}
