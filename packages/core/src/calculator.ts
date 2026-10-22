/** Small arithmetic grammar shared by the calculator client and server; never evaluates code. */
export function calculate(expression: string): string {
  if (!expression.trim() || expression.length > 200 || /[^\d\s.+\-*/()%×÷]/.test(expression)) throw new Error('Enter a calculation using numbers and + − × ÷ %.');
  const source=expression.replace(/×/g,'*').replace(/÷/g,'/').replace(/\s+/g,'');
  let at=0,depth=0;
  const checked=(value:number)=>{if(!Number.isFinite(value)||Math.abs(value)>1e15)throw new Error('Result is outside the calculator range.');return value};
  function factor():number {
    if(++depth>40)throw new Error('The calculation is too complex.');
    let value:number;
    if(source[at]==='+'||source[at]==='-'){const negative=source[at++]==='-';value=factor()*(negative?-1:1)}
    else if(source[at]==='('){at++;value=sum();if(source[at++]!==')')throw new Error('Close each bracket.')}
    else {const number=/^(?:\d+(?:\.\d*)?|\.\d+)/.exec(source.slice(at));if(!number)throw new Error('Enter a valid number.');at+=number[0].length;value=Number(number[0])}
    while(source[at]==='%'){at++;value/=100}
    depth--;return checked(value);
  }
  function product(){let value=factor();while(source[at]==='*'||source[at]==='/'){const op=source[at++],right=factor();if(op==='/'&&right===0)throw new Error('Cannot divide by zero.');value=checked(op==='*'?value*right:value/right)}return value}
  function sum(){let value=product();while(source[at]==='+'||source[at]==='-'){const op=source[at++],right=product();value=checked(op==='+'?value+right:value-right)}return value}
  const value=sum();if(at!==source.length)throw new Error('Check the calculation.');return String(Number(value.toPrecision(15)));
}
