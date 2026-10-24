/** Manual availability supplements plans and roles; it never grants permissions. */
export const restaurantFeatures = [
 ['overview','Overview'],['floor-plan','Explore'],['floor','Tables'],['qr','Table QR ordering'],['storefront','Online ordering'],
 ['orders','Orders'],['pos','Cashier POS'],['kitchen','Kitchen'],['kitchenStages','Kitchen stage settings'],['tasks','Service'],['payments','Payments'],['invoices','Bills & invoices'],
 ['menu','Menu'],['recipes','Recipes'],['inventory','Inventory'],['customers','Customers'],['loyalty','Loyalty & rewards'],['coupons','Discount coupons'],
 ['reservations','Reservations'],['vendors','Vendors'],['purchases','Purchases'],['expenses','Expenses'],['checklists','Checklists'],['campaigns','Campaigns'],
 ['team','Team'],['attendance','Attendance'],['outlets','Outlets'],['brands','Virtual brands'],['reports','Reports'],['audit','Activity log'],['integrations','Connections'],
 ['calculator','Calculator'],['activeOrders','Active orders panel'],['notifications','Restaurant notifications'],['uploads','File uploads'],['taxSettings','Tax settings'],['billSettings','Bill adjustments'],['refunds','Refunds & replacements']
] as const;
export type RestaurantFeature=typeof restaurantFeatures[number][0];
export type FeatureFlags={server?:Partial<Record<RestaurantFeature,boolean>>;restaurant?:Partial<Record<RestaurantFeature,boolean>>};
export function restaurantFeatureEnabled(flags:FeatureFlags|undefined,key:string){return flags?.server?.[key as RestaurantFeature]!==false&&flags?.restaurant?.[key as RestaurantFeature]!==false;}
export const restaurantPlanModules:Record<string,string>={pos:'pos',storefront:'pos',qr:'qr',inventory:'inventory',recipes:'inventory',vendors:'procurement',purchases:'procurement',customers:'crm',campaigns:'crm',loyalty:'loyalty',coupons:'loyalty',reports:'reports',reservations:'reservations',expenses:'finance'};
/** Explicit web command surface; added to the authenticated actor internally, never accepted from HTTP input. */
export function webCommandFeatures(action:string,input:any):string[]{
 const groups:Record<string,string[]>={
  inventory:['materialSetup','stockValue','ingredientArchive','ingredientEdit','ingredient','stockCounts','receipt','wastage'],
  notifications:['dismissAlert'],invoices:['kotPrint','receiptSettings','bill','recordPrint'],purchases:['receivePurchase'],storefront:['storefront'],
  team:['employeeProfile','staffInvite','revokeStaffInvite','employeeRole','employee','employeeAccess'],
  billSettings:['orderAdjustments','orderCharges','billSettings','billDefaults','loyaltyCap','loyaltyName'],taxSettings:['taxSettings','orderTax'],
  payments:['recordPayment','paymentMethods','zeroTotal','initiatePayment','verifyPayment','postpaid'],
  floor:['tableActivity','removeTable','floor','exchangeTables','closeTable','tableCapacity','openSession','closeSession','pair','merge','demerge','table','renameTable'],
  'floor-plan':['floorPlan'],attendance:['shift','attendance'],menu:['menuCategory','menu'],qr:['deviceBan','qrPolicy'],
  pos:['createRound'],orders:['editRound','decideRound','identity','orderPin','void'],loyalty:['reward','reviewRewards'],customers:['customerProfile'],
  kitchen:['kitchenBulk','kitchen','rejectKitchenRounds','cancelPrepared','completePreparedService'],tasks:['serve','serveSelected','service'],
  refunds:['webRefund','webRefundDecision'],kitchenStages:['kitchenStages'],outlets:['outlet'],recipes:['recipe'],audit:['verifyAudit']
 };
 const result=Object.entries(groups).filter(([,commands])=>commands.includes(action)).map(([feature])=>feature);
 if(action==='reward'&&(input?.couponId||input?.couponCode))result.push('coupons');
 if(action==='record'||action==='recordDecision'){const feature=({vendors:'vendors',purchases:'purchases',expenses:'expenses',reservations:'reservations',campaigns:'campaigns',checklists:'checklists',brands:'brands'} as Record<string,string>)[input?.kind];if(feature)result.push(feature);}
 return result;
}
export function restaurantActionFeature(action:string,input:any):string|undefined{
 const record:Record<string,string>={vendors:'vendors',purchases:'purchases',expenses:'expenses',reservations:'reservations',campaigns:'campaigns',checklists:'checklists',brands:'brands'};
 if(action==='RECORD_SAVED')return record[input?.kind];
 if(/^CALCULATOR_/.test(action))return 'calculator';
 if(/KITCHEN.*STAGES|KITCHEN.*WORKFLOW|WEB_KITCHEN_POLICY/.test(action))return 'kitchenStages';
 if(/KITCHEN|^KOT_|PREPARED_SERVICE|KITCHEN_ROUNDS_REJECTED/.test(action))return 'kitchen';
 if(/REFUND|REPLACEMENT/.test(action))return 'refunds';
 if(/BILL_DEFAULT|LOYALTY_CAP|LOYALTY_NAME|BILL_SETTINGS/.test(action))return 'billSettings';
 if(/COUPON/.test(action))return 'coupons';
 if(/LOYALTY|ENTITLEMENT|REWARD/.test(action))return 'loyalty';
 if(/STOREFRONT|D2C/.test(action))return 'storefront';
 if(/CUSTOMER_ORDER_SUBMITTED|QR_POLICY/.test(action))return 'qr';
 if(/FLOOR_PLAN|FLOOR_LAYOUT|FLOOR_SAVED/.test(action))return 'floor-plan';
 if(/TABLE|SESSION|PAIRING/.test(action))return 'floor';
 if(/RECIPE/.test(action))return 'recipes';
 if(/INGREDIENT|STOCK|MATERIAL|WASTE|PRODUCTION|EXPIRY/.test(action))return 'inventory';
 if(/PURCHASE/.test(action))return 'purchases';if(/VENDOR|SUPPLIER|PROCUREMENT/.test(action))return 'vendors';
 if(/TAX_/.test(action))return 'taxSettings';
 if(/MENU|CATEGORY/.test(action))return 'menu';
 if(/EMPLOYEE|STAFF/.test(action))return 'team';
 if(/ATTENDANCE|SHIFT/.test(action))return 'attendance';
 if(/OUTLET/.test(action))return 'outlets';
 if(/CUSTOMER_PROFILE|CUSTOMER_SAVED/.test(action))return 'customers';
 if(/EXPENSE|PAYROLL|SALARY/.test(action))return 'expenses';
 if(/RESERVATION/.test(action))return 'reservations';
 if(/SERVICE|ROUND_SERVED|SELECTED_ROUNDS_SERVED/.test(action))return 'tasks';
 if(/PAYMENT|POSTPAID/.test(action))return 'payments';
 if(/INVOICE|BILL_|PRINT_RECORDED/.test(action))return 'invoices';
 if(/ORDER_ROUND_CREATED/.test(action))return 'pos';
 if(/ORDER_|ROUND_/.test(action))return 'orders';
}
