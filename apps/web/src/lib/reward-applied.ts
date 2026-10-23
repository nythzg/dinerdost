"use client";
import Swal from 'sweetalert2/dist/sweetalert2.js';
import {money,type Row} from './client';

/** Compare server totals, retaining any concurrent changes to the bill's other rounds. */
export function showRewardApplied(order:Row,previousRound:Row,kind:'coupon'|'loyalty'){
 const round=order.rounds.find((entry:Row)=>entry.id===previousRound.id);
 const previousTotal=Number(order.totals.payable)-Number(round.payable)+Number(previousRound.payable);
 const body=document.createElement('div');body.className='coupon-applied-summary';
 const discount=document.createElement('p');discount.append('Total discount');
 const amount=document.createElement('strong');amount.setAttribute('aria-label','Total discount');amount.textContent=money(order.totals.discount);discount.append(amount);
 const totals=document.createElement('div');totals.className='coupon-applied-totals';
 const previous=document.createElement('del');previous.setAttribute('aria-label','Previous total');previous.textContent=money(previousTotal);
 const current=document.createElement('strong');current.setAttribute('aria-label','Discounted total');current.textContent=money(order.totals.payable);
 totals.append(previous,current);body.append(discount,totals);
 void Swal.fire({titleText:kind==='coupon'?'Coupon applied':'Loyalty points claimed',icon:'success',iconColor:'#285b45',html:body,confirmButtonText:'Done',buttonsStyling:false,heightAuto:false,returnFocus:true,keydownListenerCapture:true,customClass:{container:'desk-confirm-container',popup:'desk-confirm-popup coupon-applied-popup',confirmButton:'button primary'}});
}
