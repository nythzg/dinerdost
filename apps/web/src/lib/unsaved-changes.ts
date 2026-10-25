"use client";
import {useEffect} from 'react';

export function confirmDiscardChanges(root: ParentNode = document) {
  return !root.querySelector('[data-unsaved-changes="true"]') ||
    window.confirm('You have unsaved changes. Discard them and leave?');
}

export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {event.preventDefault(); event.returnValue = '';};
    const leave = (event: MouseEvent) => {
      const link = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
      if (!link || link.hasAttribute('data-guarded-navigation') || link.download ||
          link.target === '_blank' || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const url = new URL(link.href);
      if (url.pathname === location.pathname && url.search === location.search) return;
      if (!confirmDiscardChanges()) {event.preventDefault(); event.stopImmediatePropagation();}
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', leave, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', leave, true);
    };
  }, [dirty]);
}
