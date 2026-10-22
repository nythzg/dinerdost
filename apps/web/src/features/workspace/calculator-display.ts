/** Display grouping never enters the stored expression or arithmetic parser. */
export function plainCalculatorResult(value:string):string{
 const match=/^(-?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/i.exec(value);
 if(!match)return value;
 const digits=match[2]+(match[3]??''),point=match[2].length+Number(match[4]);
 return match[1]+(point<=0?'0.'+'0'.repeat(-point)+digits:point>=digits.length?digits+'0'.repeat(point-digits.length):digits.slice(0,point)+'.'+digits.slice(point));
}
export function calculatorDisplay(value:string):string{
 return value.replace(/(?:\d+(?:\.\d*)?|\.\d+)/g,number=>{const [integer,fraction]=number.split('.');return integer.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(fraction===undefined?'':'.'+fraction)}).replace(/\*/g,'×').replace(/\//g,'÷').replace(/-/g,'−');
}
export function calculatorExpression(value:string):string{
 return value.replace(/,/g,'').replace(/−/g,'-').replace(/[^0-9\s.+*/%()×÷-]/g,'').replace(/(^|[+\-×÷*/(])0+(?=\d)/g,'$1');
}
