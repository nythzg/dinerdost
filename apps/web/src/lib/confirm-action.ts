"use client";
import Swal,{type SweetAlertOptions} from 'sweetalert2/dist/sweetalert2.js';
const options:SweetAlertOptions={titleText:'Please confirm',icon:'question',showCancelButton:true,cancelButtonText:'Cancel',focusCancel:true,buttonsStyling:false,heightAuto:false,customClass:{container:'desk-confirm-container',popup:'desk-confirm-popup',confirmButton:'button primary',cancelButton:'button'},keydownListenerCapture:true};
/** Explicit confirmation only; plain text never interpreted as HTML. */
export async function confirmAction(text:string,confirmButtonText='Confirm'){
 const result=await Swal.fire({...options,text,confirmButtonText});
 return result.isConfirmed;
}
/** A required, bounded plain-text reason; cancellation performs no command. */
export async function rejectionReason(text:string){
 const result=await Swal.fire({...options,titleText:'Reject selected rounds',text,icon:'warning',input:'textarea',inputLabel:'Reason for rejection',inputPlaceholder:'Explain why this food is being rejected',inputAttributes:{maxlength:'500'},confirmButtonText:'Reject rounds',inputValidator:value=>value.trim().length<5?'Enter a reason of at least 5 characters.':undefined});
 return result.isConfirmed?String(result.value).trim():null;
}
/** Existing confirmation-only forms keep errors visible and cannot submit twice. */
export async function confirmFormAction(text:string,confirmButtonText:string,action:()=>Promise<unknown>){
 const result=await Swal.fire({...options,text,confirmButtonText,showLoaderOnConfirm:true,allowOutsideClick:()=>!Swal.isLoading(),allowEscapeKey:()=>!Swal.isLoading(),preConfirm:async()=>{try{await action();return true}catch(issue){const escaped=(issue as Error).message.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));Swal.showValidationMessage(escaped);return false}}});
 return result.isConfirmed;
}
