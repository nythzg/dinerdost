export const guestCourses=[{id:'starter',label:'Starter',icon:'leaf'},{id:'main',label:'Main course',icon:'dish'},{id:'freshener',label:'Drinks',icon:'cup'},{id:'dessert',label:'Dessert',icon:'dessert'}] as const;
export function guestMenuCourse(category:string,assigned?:string|null){
 const saved=guestCourses.find(course=>course.id===assigned);if(saved)return saved.id;
 if(/fresh[en]*er|beverage|drink|juice|mocktail|cocktail|\bcoffee\b|\btea\b/i.test(category))return 'freshener';
 if(/starter|appeti[sz]er|soup|salad|snack/i.test(category))return 'starter';
 if(/dessert|desert|sweet|ice[ -]?cream/i.test(category))return 'dessert';
 return 'main';
}
export function guestKitchenProgress(round:{status:string;kot_status:string}){
 if(['CANCELLED','REJECTED','VOIDED'].includes(round.status)||round.kot_status==='CANCELLED')return -1;
 if(['READY','SERVED'].includes(round.kot_status)||['READY','SERVED','SETTLED'].includes(round.status))return 4;
 if(round.kot_status==='PREPARING'||round.status==='PREPARING')return 3;
 if(round.kot_status==='RELEASED')return 2;
 if(round.status==='ACCEPTED')return 1;
 return 0;
}

export function guestCanRequestBill(rounds:ReadonlyArray<{status:string;kot_status:string}>|undefined){
 const active=rounds?.filter(round=>!['CANCELLED','REJECTED','VOIDED'].includes(round.status))??[];
 return active.length>0&&active.every(round=>round.kot_status==='SERVED'||round.status==='SERVED'||round.status==='SETTLED');
}
