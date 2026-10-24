import {money,type Row} from '@/lib/client';
export function GuestBillBreakdown({bill,paid}:{bill:Row;paid?:number}){
 const taxes=bill.taxes?.length?bill.taxes:[{name:'Tax',amount:bill.tax,rateBps:bill.taxRates?.length===1?bill.taxRates[0]:undefined}];
 return <dl className="guest-bill-breakdown">
  <div><dt>Subtotal</dt><dd>{money(bill.subtotal)}</dd></div>
  {Number(bill.discount)>0&&<div className="guest-bill-saving"><dt>{bill.discountLabel??'Discount'}</dt><dd>−{money(bill.discount)}</dd></div>}
  {taxes.map((tax:Row,index:number)=><div key={index}><dt>{tax.name}{tax.rateBps!==undefined&&<small>{Number(tax.rateBps)/100}%</small>}</dt><dd>{money(tax.amount)}</dd></div>)}
  {(bill.charges??[]).map((charge:Row,index:number)=><div key={'charge-'+index}><dt>{charge.name}</dt><dd>{money(charge.amount)}</dd></div>)}
  {!!Number(bill.roundOff)&&<div><dt>Round off</dt><dd>{money(bill.roundOff)}</dd></div>}
  <div className="guest-bill-grand-total"><dt>Total</dt><dd>{money(bill.payable)}</dd></div>
  {paid!==undefined&&<><div><dt>Received</dt><dd>{money(paid)}</dd></div><div><dt>Outstanding</dt><dd>{money(Math.max(0,Number(bill.payable)-paid))}</dd></div></>}
 </dl>;
}
