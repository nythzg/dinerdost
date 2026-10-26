'use client';
export function CountSheetPrint() {
  return <button className="button" onClick={() => window.print()}>Print count sheet</button>;
}
