import type {Locator} from '@playwright/test';
// Set an exact fixture value for persistence/geometry tests. User interaction
// (mouse/touch/keyboard and grouped undo) is covered in the slider workflow.
export async function setRangeValue(input:Locator,value:number){
 await input.evaluate((element,value)=>{
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(element,String(value));
  element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));
 },value);
}
