"use client";
import Swal from 'sweetalert2/dist/sweetalert2.js';
import {money,type Row} from './client';

/** Compare server totals, retaining any concurrent changes to the bill's other rounds. */
export function showRewardApplied(order:Row,previousRound:Row,kind:'coupon'|'loyalty'){
 const round=order.rounds.find((entry:Row)=>entry.id===previousRound.id);
 const previousTotal=Number(order.totals.payable)-Number(round.payable)+Number(previousRound.payable);
 const unchanged=previousTotal===Number(order.totals.payable);
 const sameDiscount=Number(previousRound.discount)>0&&Number(previousRound.discount)===Number(round.discount);
 const sameReward=unchanged&&sameDiscount&&Number(previousRound.manual_discount)===0&&(kind==='coupon'?!!previousRound.coupon_code&&previousRound.coupon_code===round.coupon_code:!previousRound.coupon_code&&!round.coupon_code);
 const body=document.createElement('div');body.className='coupon-applied-summary';
 const discount=document.createElement('p');discount.append('Total discount');
 const amount=document.createElement('strong');amount.setAttribute('aria-label','Total discount');amount.textContent=money(order.totals.discount);discount.append(amount);
 const totals=document.createElement('div');totals.className='coupon-applied-totals';
 const previous=document.createElement('del');previous.setAttribute('aria-label','Previous total');previous.textContent=money(previousTotal);
 const current=document.createElement('strong');current.setAttribute('aria-label','Discounted total');current.textContent=money(order.totals.payable);
 if(!unchanged)totals.append(previous);totals.append(current);body.append(discount,totals);
 const explanation=sameReward?(kind==='loyalty'?`The ${money(round.discount)} loyalty discount is already included in this bill.`:'This coupon is already included in the bill total.'):unchanged&&sameDiscount?'This replaces an existing discount of the same value.':unchanged&&Number(previousRound.discount)!==Number(round.discount)?'The payable total is unchanged after the saved rounding rule.':previousTotal<Number(order.totals.payable)?'This replaces the previous discount; the payable total has increased.':'';
 if(explanation){const note=document.createElement('small');note.className='reward-applied-note';note.textContent=explanation;body.append(note);}
 void Swal.fire({titleText:sameReward?(kind==='coupon'?'Coupon already applied':'Loyalty already applied'):(kind==='coupon'?'Coupon applied':'Loyalty points claimed'),icon:sameReward?'info':'success',iconColor:'#285b45',html:body,confirmButtonText:'Done',buttonsStyling:false,heightAuto:false,returnFocus:true,keydownListenerCapture:true,customClass:{container:'desk-confirm-container',popup:'desk-confirm-popup coupon-applied-popup',confirmButton:'button primary'}});
}
